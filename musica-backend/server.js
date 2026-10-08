const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cron = require('node-cron');
const SpotifyWebApi = require('spotify-web-api-node');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

// 1. Configuración de Spotify
const spotifyApi = new SpotifyWebApi({
  clientId: '2cdbade90a534da1b99991ce51b0c34f', // Reemplaza con tu Client ID
  clientSecret: '090fd7a091f441a491f0c8c239bcffe0', // Reemplaza con tu Client Secret
  redirectUri: 'http://127.0.0.1:3001/callback'
});

let tareasProgramadas = [];
let tokenRefreshInterval = null;

// 2. Rutas de Autenticación (OAuth 2.0)
app.get('/login', (req, res) => {
  // Pedimos permiso para modificar la reproducción y leer el estado activo
  const scopes = ['user-modify-playback-state', 'user-read-playback-state'];
  const authorizeURL = spotifyApi.createAuthorizeURL(scopes, 'estado-inicial');
  res.redirect(authorizeURL);
});

app.get('/callback', (req, res) => {
  const code = req.query.code || null;
  
  spotifyApi.authorizationCodeGrant(code).then(
    (data) => {
      // Guardamos los tokens en la instancia
      spotifyApi.setAccessToken(data.body['access_token']);
      spotifyApi.setRefreshToken(data.body['refresh_token']);
      
      console.log('¡Spotify autenticado correctamente!');

      // Spotify expira el token cada hora. Lo refrescamos automáticamente cada 50 mins.
      if(tokenRefreshInterval) clearInterval(tokenRefreshInterval);
      tokenRefreshInterval = setInterval(() => {
        spotifyApi.refreshAccessToken().then(
          (data) => {
            console.log('Token de Spotify renovado.');
            spotifyApi.setAccessToken(data.body['access_token']);
          },
          (err) => {
            console.error('Error al refrescar el token', err);
          }
        );
      }, 50 * 60 * 1000);

      res.send(`
        <h2 style="font-family:sans-serif; color:#1DB954;">¡Autenticación Exitosa!</h2>
        <p style="font-family:sans-serif;">Tu servidor ya tiene control de Spotify. Puedes cerrar esta ventana y regresar a tu dashboard.</p>
      `);
    },
    (err) => {
      console.error('Error al obtener tokens de Spotify:', err);
      res.send('Ocurrió un error en la autenticación.');
    }
  );
});

// 3. Lógica de Sockets y Programación
io.on('connection', (socket) => {
    console.log('Interfaz conectada al backend');
    
    socket.emit('tareas_actualizadas', tareasProgramadas.map(t => ({ id: t.id, hora: t.hora, minuto: t.minuto, ruta: t.ruta })));

    socket.on('programar_musica', (data) => {
        const { hora, minuto, ruta } = data;
        const cronExpression = `${minuto} ${hora} * * *`;
        
        const tareaCron = cron.schedule(cronExpression, async () => {
            console.log(`Es la hora. Intentando reproducir URI de Spotify: ${ruta}`);
            
            try {
                // Spotify requiere diferente formato si es una sola canción (track) o una lista/álbum
                const esTrack = ruta.includes('track');
                const opcionesReproduccion = esTrack ? { uris: [ruta] } : { context_uri: ruta };

                await spotifyApi.play(opcionesReproduccion);
                console.log('Música iniciada en Spotify con éxito.');
                io.emit('reproduciendo', { ruta, hora, minuto });

            } catch (error) {
                console.error('Error al reproducir en Spotify:', error.body || error);
                // Si el error es NO_ACTIVE_DEVICE, significa que necesitas tener Spotify abierto en algún lado
                if (error.body && error.body.error && error.body.error.reason === 'NO_ACTIVE_DEVICE') {
                    console.log('ATENCIÓN: Debes tener la app de Spotify abierta y activa en algún dispositivo (PC, móvil, etc.).');
                }
            }
        });

        const nuevaTarea = { id: Date.now(), hora, minuto, ruta, cronObj: tareaCron };
        tareasProgramadas.push(nuevaTarea);
        
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

server.listen(3001, () => {
    console.log('Backend de Spotify corriendo en http://127.0.0.1:3001');
    console.log('IMPORTANTE: Antes de programar música, debes autenticarte entrando a: http://127.0.0.1:3001/login');
});