const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cron = require('node-cron');
const SpotifyWebApi = require('spotify-web-api-node');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

const spotifyApi = new SpotifyWebApi({
  clientId: '2cdbade90a534da1b99991ce51b0c34f', // Reemplaza con tu Client ID
  clientSecret: '090fd7a091f441a491f0c8c239bcffe0', // Reemplaza con tu Client Secret
  redirectUri: 'http://127.0.0.1:3001/callback'
});

let tareasProgramadas = [];
let tokenRefreshInterval = null;

// Convertidor de URL web a URI de Spotify
function parseSpotifyUri(input) {
    if (input.includes('spotify.com')) {
        const match = input.match(/(track|playlist|album)\/([a-zA-Z0-9]+)/);
        if (match) return `spotify:${match[1]}:${match[2]}`;
    }
    return input;
}

app.get('/login', (req, res) => {
  const scopes = ['user-modify-playback-state', 'user-read-playback-state', 'playlist-read-private', 'playlist-read-collaborative'];
  const authorizeURL = spotifyApi.createAuthorizeURL(scopes, 'estado-inicial');
  res.redirect(authorizeURL);
});

app.get('/callback', (req, res) => {
  const code = req.query.code || null;
  spotifyApi.authorizationCodeGrant(code).then(
    (data) => {
      spotifyApi.setAccessToken(data.body['access_token']);
      spotifyApi.setRefreshToken(data.body['refresh_token']);
      console.log('¡Spotify autenticado!');

      if(tokenRefreshInterval) clearInterval(tokenRefreshInterval);
      tokenRefreshInterval = setInterval(() => {
        spotifyApi.refreshAccessToken().then(
          (data) => spotifyApi.setAccessToken(data.body['access_token']),
          (err) => console.error('Error al refrescar token', err)
        );
      }, 50 * 60 * 1000);

      res.send('<h2 style="color:#1DB954;">¡Autenticación Exitosa! Cierra esta ventana.</h2>');
    },
    (err) => res.send('Error en la autenticación.')
  );
});

io.on('connection', (socket) => {
    socket.emit('tareas_actualizadas', tareasProgramadas.map(t => ({ id: t.id, hora: t.hora, minuto: t.minuto, ruta: t.ruta })));

    // CONTROLES EN TIEMPO REAL
    socket.on('control_play', async () => { try { await spotifyApi.play(); } catch(e){} });
    socket.on('control_pausa', async () => { try { await spotifyApi.pause(); } catch(e){} });
    socket.on('control_siguiente', async () => { try { await spotifyApi.skipToNext(); } catch(e){} });
    socket.on('control_anterior', async () => { try { await spotifyApi.skipToPrevious(); } catch(e){} });

    // OBTENER LISTA DE CANCIONES
    socket.on('obtener_playlist', async (rutaOriginal) => {
        try {
            const uri = parseSpotifyUri(rutaOriginal);
            if (uri.includes('playlist')) {
                const playlistId = uri.split(':')[2];
                const data = await spotifyApi.getPlaylistTracks(playlistId);
                const tracks = data.body.items.map((item, index) => `${index + 1}. ${item.track.name} - ${item.track.artists[0].name}`);
                socket.emit('lista_canciones_resultado', tracks);
            } else {
                socket.emit('lista_canciones_resultado', ['Este enlace es de una sola canción, no una playlist.']);
            }
        } catch (error) {
            socket.emit('lista_canciones_resultado', ['Error al cargar la playlist. Verifica el enlace.']);
        }
    });

    socket.on('programar_musica', (data) => {
        const { hora, minuto, ruta } = data;
        const uriSpotify = parseSpotifyUri(ruta); // Convierte la URL si es necesario
        
        const tareaCron = cron.schedule(`${minuto} ${hora} * * *`, async () => {
            try {
                const esTrack = uriSpotify.includes('track');
                const opciones = esTrack ? { uris: [uriSpotify] } : { context_uri: uriSpotify };
                await spotifyApi.play(opciones);
                io.emit('reproduciendo', { ruta: uriSpotify, hora, minuto });
            } catch (error) {
                console.error('Error al reproducir:', error.body?.error?.reason || error);
            }
        });

        tareasProgramadas.push({ id: Date.now(), hora, minuto, ruta, cronObj: tareaCron });
        io.emit('tareas_actualizadas', tareasProgramadas.map(t => ({ id: t.id, hora: t.hora, minuto: t.minuto, ruta: t.ruta })));
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

server.listen(3001, () => console.log('Backend corriendo en http://localhost:3001'));