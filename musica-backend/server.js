const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cron = require('node-cron');
const SpotifyWebApi = require('spotify-web-api-node');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

// Configuración de Spotify (Con el Client ID ya corregido)
const spotifyApi = new SpotifyWebApi({
  clientId: '1f6b538e02e94badaf70e028df6b0f56', // Reemplaza con tu Client ID
  clientSecret: '46f576c4e34a4609b1e94ac63672c4e1', // Reemplaza con tu Client Secret
  redirectUri: 'http://127.0.0.1:3001/callback'
});

let tareasProgramadas = [];
let tokenRefreshInterval = null;
let monitorReproduccion = null;

// Convertidor automático de enlaces de Spotify
function parseSpotifyUri(input) {
    if (input.includes('spotify.com')) {
        const match = input.match(/(track|playlist|album)\/([a-zA-Z0-9]+)/);
        if (match) return `spotify:${match[1]}:${match[2]}`;
    }
    return input;
}

// Rutas de Autenticación
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
      console.log('¡Spotify autenticado correctamente!');

      // Mantener el token activo
      if(tokenRefreshInterval) clearInterval(tokenRefreshInterval);
      tokenRefreshInterval = setInterval(() => {
        spotifyApi.refreshAccessToken().then(
          (data) => spotifyApi.setAccessToken(data.body['access_token']),
          (err) => console.error('Error al refrescar token', err)
        );
      }, 50 * 60 * 1000);

      // Monitorear la canción actual cada 3 segundos
      if(monitorReproduccion) clearInterval(monitorReproduccion);
      monitorReproduccion = setInterval(async () => {
          try {
              const estado = await spotifyApi.getMyCurrentPlaybackState();
              if (estado.body && estado.body.item) {
                  io.emit('estado_reproduccion', {
                      activo: estado.body.is_playing,
                      cancion: estado.body.item.name,
                      artista: estado.body.item.artists.map(a => a.name).join(', '),
                      imagen: estado.body.item.album.images[0]?.url
                  });
              } else {
                  io.emit('estado_reproduccion', { activo: false });
              }
          } catch (error) {
              // Evitamos llenar la consola si Spotify se cierra
          }
      }, 3000);

      res.send('<h2 style="color:#1DB954; font-family:sans-serif; text-align:center; margin-top:50px;">¡Autenticación Exitosa!<br>Ya puedes cerrar esta ventana y volver al Dashboard.</h2>');
    },
    (err) => {
        console.error('Error en autenticación', err);
        res.send('Error en la autenticación.');
    }
  );
});

// Sockets y Lógica Principal
io.on('connection', (socket) => {
    socket.emit('tareas_actualizadas', tareasProgramadas.map(t => ({ id: t.id, hora: t.hora, minuto: t.minuto, ruta: t.ruta })));

    // Controles en vivo con selección automática de dispositivo
    socket.on('control_play', async () => { 
        try { 
            const dispositivos = await spotifyApi.getMyDevices();
            if (!dispositivos.body.devices || dispositivos.body.devices.length === 0) {
                return console.log("Advertencia: Abre la app de Spotify primero.");
            }
            const deviceId = dispositivos.body.devices[0].id;
            await spotifyApi.play({ device_id: deviceId }); 
        } 
        catch(e){ console.error('Error en Play:', e.body ? e.body.error : e); } 
    });

    socket.on('control_pausa', async () => { 
        try { await spotifyApi.pause(); } 
        catch(e){ console.error('Error en Pausa:', e.body ? e.body.error : e); } 
    });

    socket.on('control_siguiente', async () => { 
        try { await spotifyApi.skipToNext(); } 
        catch(e){ console.error('Error en Siguiente:', e.body ? e.body.error : e); } 
    });

    socket.on('control_anterior', async () => { 
        try { await spotifyApi.skipToPrevious(); } 
        catch(e){ console.error('Error en Anterior:', e.body ? e.body.error : e); } 
    });

    // Obtener contenido de lista de reproducción
    socket.on('obtener_playlist', async (rutaOriginal) => {
        try {
            const uri = parseSpotifyUri(rutaOriginal);
            if (uri.includes('playlist')) {
                const playlistId = uri.split(':')[2];
                const data = await spotifyApi.getPlaylistTracks(playlistId);
                const tracks = data.body.items.map((item, index) => `${index + 1}. ${item.track.name} - ${item.track.artists[0].name}`);
                socket.emit('lista_canciones_resultado', tracks);
            } else {
                socket.emit('lista_canciones_resultado', ['El enlace proporcionado pertenece a una canción individual.']);
            }
        } catch (error) {
            socket.emit('lista_canciones_resultado', ['Error al cargar la playlist. Asegúrate de que no sea privada.']);
        }
    });

    // Tarea Programada (Alarma)
    socket.on('programar_musica', (data) => {
        const { hora, minuto, ruta } = data;
        const uriSpotify = parseSpotifyUri(ruta);
        
        const tareaCron = cron.schedule(`${minuto} ${hora} * * *`, async () => {
            try {
                // Buscamos aparatos abiertos y forzamos la reproducción en uno de ellos
                const dispositivos = await spotifyApi.getMyDevices();
                
                if (!dispositivos.body.devices || dispositivos.body.devices.length === 0) {
                    console.error('Alarma fallida: No hay ningún dispositivo con Spotify abierto para reproducir la música.');
                    return;
                }

                const deviceToPlay = dispositivos.body.devices.find(d => d.is_active) || dispositivos.body.devices[0];
                const esTrack = uriSpotify.includes('track');
                const opciones = esTrack ? { uris: [uriSpotify] } : { context_uri: uriSpotify };
                
                opciones.device_id = deviceToPlay.id; // Fuerza el dispositivo

                await spotifyApi.play(opciones);
                console.log(`[${hora}:${minuto}] ¡Música iniciada correctamente!`);
            } catch (error) {
                console.error(`[${hora}:${minuto}] Error al reproducir la alarma:`, error.body ? error.body.error : error);
            }
        });

        tareasProgramadas.push({ id: Date.now(), hora, minuto, ruta, cronObj: tareaCron });
        io.emit('tareas_actualizadas', tareasProgramadas.map(t => ({ id: t.id, hora: t.hora, minuto: t.minuto, ruta: t.ruta })));
        console.log(`Nueva música programada a las ${hora}:${minuto}`);
    });

    // Cancelar programación
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
    console.log('PASO 1: Entra a http://127.0.0.1:3001/login');
    console.log('PASO 2: Abre la app de Spotify en tu PC o Celular');
    console.log('PASO 3: Controla la música desde tu Panel Web');
});