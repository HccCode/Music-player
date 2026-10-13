const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const SpotifyWebApi = require('spotify-web-api-node');

const { state, guardarConfig } = require('./src/dataManager');
const utils = require('./src/utils');
const createAudioEngine = require('./src/audioEngine');
const setupSockets = require('./src/socketHandler');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

const spotifyApi = new SpotifyWebApi({
    clientId: state.appConfig.clientId, 
    clientSecret: state.appConfig.clientSecret, 
    redirectUri: 'http://127.0.0.1:3001/callback'
});

const engine = createAudioEngine(io, spotifyApi);
setupSockets(io, spotifyApi, engine);

app.get('/login', (req, res) => {
    const scopes = [
      'streaming', 'user-read-email', 'user-read-private',
      'user-modify-playback-state', 'user-read-playback-state',
      'playlist-read-private', 'playlist-read-collaborative'
    ];
    res.redirect(spotifyApi.createAuthorizeURL(scopes, 'estado-inicial'));
});
  
app.get('/callback', (req, res) => {
    spotifyApi.authorizationCodeGrant(req.query.code || null).then(
      async (data) => {
        const accessToken = data.body['access_token'];
        const refreshToken = data.body['refresh_token'];
        spotifyApi.setAccessToken(accessToken);
        spotifyApi.setRefreshToken(refreshToken);
  
        if (refreshToken) {
            state.appConfig.refreshToken = refreshToken;
            guardarConfig();
        }
        engine.iniciarServiciosSpotify();
        await engine.actualizarMetadatosPendientes();
        await engine.emitirDispositivos();
        res.send('<h2 style="color:#1DB954; text-align:center; margin-top:50px; font-family:sans-serif;">¡Autenticación Exitosa!<br>Ya puedes cerrar esta pestaña.</h2>');
      }, (err) => res.send('Error en la autenticación.')
    );
});

server.listen(3001, '0.0.0.0', () => {
    const ip = utils.obtenerIpLocal();
    console.log('==================================================');
    console.log(` Backend Local Modularizado: http://localhost:3001`);
    console.log(` Control Móvil Remoto:       http://${ip}:5173`);
    console.log('==================================================');
    engine.inicializarCronGuardados();
    engine.intentarAutoLogin();
});