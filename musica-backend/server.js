const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cron = require('node-cron');
const SpotifyWebApi = require('spotify-web-api-node');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

// Configuración de Spotify
const spotifyApi = new SpotifyWebApi({
  clientId: '1f6b538e02e94badaf70e028df6b0f56', 
  clientSecret: '46f576c4e34a4609b1e94ac63672c4e1', 
  redirectUri: 'http://127.0.0.1:3001/callback'
});

let tareasProgramadas = [];
let tokenRefreshInterval = null;
let monitorReproduccion = null;

function parseSpotifyUri(input) {
    let uri = input.trim();
    if (uri.includes('spotify.com')) {
        const match = uri.match(/(track|playlist|album)\/([a-zA-Z0-9]+)/);
        if (match) {
            return `spotify:${match[1]}:${match[2]}`;
        }
    }
    return uri;
}

const esperar = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// ----- RUTAS DE AUTENTICACIÓN -----
app.get('/login', (req, res) => {
  const scopes = [
      'user-modify-playback-state', 
      'user-read-playback-state', 
      'playlist-read-private', 
      'playlist-read-collaborative'
  ];
  const authorizeURL = spotifyApi.createAuthorizeURL(scopes, 'estado-inicial');
  res.redirect(authorizeURL);
});

app.get('/callback', (req, res) => {
  const code = req.query.code || null;
  spotifyApi.authorizationCodeGrant(code).then(
    (data) => {
      spotifyApi.setAccessToken(data.body['access_token']);
      spotifyApi.setRefreshToken(data.body['refresh_token']);
      console.log('✅ ¡Spotify autenticado correctamente!');

      if(tokenRefreshInterval) clearInterval(tokenRefreshInterval);
      tokenRefreshInterval = setInterval(() => {
        spotifyApi.refreshAccessToken().then(
          (data) => spotifyApi.setAccessToken(data.body['access_token']),
          (err) => console.error('Error al refrescar token', err)
        );
      }, 50 * 60 * 1000);

      if(monitorReproduccion) clearInterval(monitorReproduccion);
      monitorReproduccion = setInterval(async () => {
          if (!spotifyApi.getAccessToken()) return;
          try {
              const estado = await spotifyApi.getMyCurrentPlaybackState();
              if (estado.body && estado.body.item) {
                  io.emit('estado_reproduccion', {
                      activo: estado.body.is_playing,
                      cancion: estado.body.item.name,
                      artista: estado.body.item.artists.map(a => a.name).join(', '),
                      imagen: estado.body.item.album.images[0]?.url,
                      progreso: estado.body.progress_ms,   // <-- NUEVO: Tiempo actual
                      duracion: estado.body.item.duration_ms // <-- NUEVO: Duración total
                  });
              } else {
                  io.emit('estado_reproduccion', { activo: false });
              }
          } catch (error) {}
      }, 3000);

      res.send('<h2 style="color:#1DB954; text-align:center; margin-top:50px; font-family:sans-serif;">¡Autenticación Exitosa!<br>Vuelve a tu dashboard.</h2>');
    },
    (err) => res.send('Error en la autenticación.')
  );
});

// ----- LÓGICA PRINCIPAL -----
io.on('connection', (socket) => {
    socket.emit('tareas_actualizadas', tareasProgramadas.map(t => ({ id: t.id, hora: t.hora, minuto: t.minuto, ruta: t.ruta })));

    // CONTROLES EN VIVO
    socket.on('control_play', async () => { 
        if (!spotifyApi.getAccessToken()) return console.log("⚠️ ALERTA: No tienes permisos. Entra a http://127.0.0.1:3001/login");
        try { 
            const dispositivos = await spotifyApi.getMyDevices();
            if (!dispositivos.body.devices || dispositivos.body.devices.length === 0) return console.log("⚠️ No hay dispositivos abiertos.");
            
            // PRIORIDAD: Web Player -> Activo -> Computadora -> Primero en la lista
            const deviceToPlay = dispositivos.body.devices.find(d => d.name.toLowerCase().includes('web player'))
                              || dispositivos.body.devices.find(d => d.is_active) 
                              || dispositivos.body.devices.find(d => d.type === 'Computer') 
                              || dispositivos.body.devices[0];
            
            if (!deviceToPlay.is_active) {
                await spotifyApi.transferMyPlayback([deviceToPlay.id]); 
                await esperar(1500);
            }
            await spotifyApi.play({ device_id: deviceToPlay.id }); 
        } 
        catch(e){ console.error('\n❌ Error en Play:', e); } 
    });

    socket.on('control_pausa', async () => { 
        if (!spotifyApi.getAccessToken()) return;
        try { await spotifyApi.pause(); } catch(e){} 
    });
    socket.on('control_siguiente', async () => { 
        if (!spotifyApi.getAccessToken()) return;
        try { await spotifyApi.skipToNext(); } catch(e){} 
    });
    socket.on('control_anterior', async () => { 
        if (!spotifyApi.getAccessToken()) return;
        try { await spotifyApi.skipToPrevious(); } catch(e){} 
    });

    // LEER PLAYLIST, ÁLBUM O CANCIÓN
    socket.on('obtener_playlist', async (rutaOriginal) => {
        if (!spotifyApi.getAccessToken()) return socket.emit('lista_canciones_resultado', ['⚠️ Inicia sesión en /login primero.']);
        try {
            const uri = parseSpotifyUri(rutaOriginal);
            
            if (uri.includes('playlist')) {
                const playlistId = uri.split(':')[2];
                const data = await spotifyApi.getPlaylistTracks(playlistId);
                const tracks = data.body.items.map((item, index) => `${index + 1}. ${item.track.name} - ${item.track.artists[0].name}`);
                socket.emit('lista_canciones_resultado', tracks);
                
            } else if (uri.includes('track')) {
                const trackId = uri.split(':')[2];
                const data = await spotifyApi.getTrack(trackId);
                const trackInfo = `${data.body.name} - ${data.body.artists[0].name}`;
                socket.emit('lista_canciones_resultado', [trackInfo]);
                
            } else if (uri.includes('album')) {
                const albumId = uri.split(':')[2];
                const data = await spotifyApi.getAlbumTracks(albumId);
                const tracks = data.body.items.map((item, index) => `${index + 1}. ${item.name} - ${item.artists[0].name}`);
                socket.emit('lista_canciones_resultado', tracks);
                
            } else {
                socket.emit('lista_canciones_resultado', ['Formato de enlace no reconocido.']);
            }
        } catch (error) {
            socket.emit('lista_canciones_resultado', ['Error al cargar la información. Verifica el enlace.']);
        }
    });

    // ALARMA PROGRAMADA CON PRIORIDAD AL REPRODUCTOR WEB
    socket.on('programar_musica', (data) => {
        const { hora, minuto, ruta } = data;
        const uriSpotify = parseSpotifyUri(ruta);
        
        const tareaCron = cron.schedule(`${minuto} ${hora} * * *`, async () => {
            console.log(`\n--- INICIANDO ALARMA DE LAS ${hora}:${minuto} ---`);
            
            if (!spotifyApi.getAccessToken()) {
                console.error("❌ FALLO CRÍTICO: El servidor no tiene sesión. Entra a http://127.0.0.1:3001/login");
                return;
            }

            let deviceId = null;
            let isDeviceActive = false; 

            try {
                console.log("1. Buscando dispositivos en tu cuenta...");
                const dispositivos = await spotifyApi.getMyDevices();
                
                if (!dispositivos.body.devices || dispositivos.body.devices.length === 0) {
                    console.error('❌ Fallo: Ningún dispositivo encontrado. Abre la app o la web de Spotify.');
                    return;
                }

                // NUEVO ORDEN DE PRIORIDAD: Siempre busca el reproductor web primero
                const deviceToPlay = dispositivos.body.devices.find(d => d.name.toLowerCase().includes('web player'))
                                  || dispositivos.body.devices.find(d => d.is_active) 
                                  || dispositivos.body.devices.find(d => d.type === 'Computer') 
                                  || dispositivos.body.devices[0];
                                  
                deviceId = deviceToPlay.id;
                isDeviceActive = deviceToPlay.is_active; 
                
                console.log(`✅ Dispositivo encontrado: ${deviceToPlay.name} (Activo: ${isDeviceActive})`);
                
                if (isDeviceActive) {
                    console.log("2. Dispositivo activo. Pausando el reproductor para limpiar el caché...");
                    try { await spotifyApi.pause({ device_id: deviceId }); } catch(e){}
                    await esperar(1000); 
                } else {
                    console.log("2. Dispositivo inactivo. Despertándolo forzosamente...");
                    await spotifyApi.transferMyPlayback([deviceId]);
                    await esperar(2500); 
                }

            } catch (err) {
                console.error("❌ Error en el PASO 1 o 2 (Dispositivos):", err.body ? err.body.error : err);
                return; 
            }

            try {
                console.log(`3. Preparando orden de Play -> URI: ${uriSpotify}`);
                const esTrack = uriSpotify.includes('track');
                
                let opcionesPlay = { device_id: deviceId }; 
                
                if (esTrack) {
                    opcionesPlay.uris = [uriSpotify];
                } else {
                    opcionesPlay.context_uri = uriSpotify;
                }
                
                console.log("➡️ Opciones exactas enviadas a Spotify:", opcionesPlay);
                await spotifyApi.play(opcionesPlay);
                console.log(`✅ 🎵 ¡Música sonando correctamente en la versión Web!`);

            } catch (err) {
                console.error(`❌ Error en el PASO 3 (Reproducción):`, err.message || err.statusCode || "Error desconocido");
                if (err.body && err.body.error) {
                    console.error("Detalle de Spotify:", err.body.error);
                }
            }
        });

        tareasProgramadas.push({ id: Date.now(), hora, minuto, ruta, cronObj: tareaCron });
        io.emit('tareas_actualizadas', tareasProgramadas.map(t => ({ id: t.id, hora: t.hora, minuto: t.minuto, ruta: t.ruta })));
        console.log(`⏰ Nueva alarma configurada a las ${hora}:${minuto}`);
    });

    socket.on('cancelar_tarea', (id) => {
        const index = tareasProgramadas.findIndex(t => t.id === id);
        if (index !== -1) {
            tareasProgramadas[index].cronObj.stop();
            tareasProgramadas.splice(index, 1);
            io.emit('tareas_actualizadas', tareasProgramadas.map(t => ({ id: t.id, hora: t.hora, minuto: t.minuto, ruta: t.ruta })));
        }
    });
});

server.listen(3001, () => {
    console.log('==================================================');
    console.log(' Backend corriendo en http://localhost:3001       ');
    console.log('==================================================');
});