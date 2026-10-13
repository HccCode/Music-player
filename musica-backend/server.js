const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cron = require('node-cron');
const SpotifyWebApi = require('spotify-web-api-node');
const fs = require('fs');
const path = require('path');
const os = require('os'); 

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

function obtenerIpLocal() {
    const interfaces = os.networkInterfaces();
    let ipFallback = '127.0.0.1';
    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
            if (iface.family === 'IPv4' && !iface.internal) {
                if (iface.address.startsWith('192.168.') || iface.address.startsWith('10.')) {
                    return iface.address;
                }
                ipFallback = iface.address;
            }
        }
    }
    return ipFallback;
}

// --- SISTEMAS DE PERSISTENCIA ---
const configPath = path.join(__dirname, 'config.json');
const tareasPath = path.join(__dirname, 'tareas.json');
const historialPath = path.join(__dirname, 'historial.json'); 
const anunciosPath = path.join(__dirname, 'anuncios.json');

let appConfig = { 
    clientId: '1f6b538e02e94badaf70e028df6b0f56', 
    clientSecret: '46f576c4e34a4609b1e94ac63672c4e1',
    preferredDeviceId: '',
    refreshToken: '',
    vozActivada: false,
    vozTexto: '¡Es hora de despertar y comenzar con energía!',
    vozVolumen: 50,
    vozNombre: ''
};

if (fs.existsSync(configPath)) {
    try { appConfig = { ...appConfig, ...JSON.parse(fs.readFileSync(configPath, 'utf8')) }; } 
    catch (e) {}
} else { fs.writeFileSync(configPath, JSON.stringify(appConfig, null, 4)); }

const DEFAULT_IMG = 'https://i.scdn.co/image/ab6761610000e5eb55d39ab9c21d506aa52f7021';
const DIAS_TODOS = [1, 2, 3, 4, 5, 6, 0];

let historial = [];
if (fs.existsSync(historialPath)) {
    try { 
        const rawHistorial = JSON.parse(fs.readFileSync(historialPath, 'utf8')); 
        historial = rawHistorial.map(item => typeof item === 'string' 
            ? { ruta: item, nombre: item, subtitulo: 'Enlace guardado', imagen: DEFAULT_IMG, tipo: 'Enlace' } 
            : item
        );
    } catch (e) {}
}

const spotifyApi = new SpotifyWebApi({
  clientId: appConfig.clientId, 
  clientSecret: appConfig.clientSecret, 
  redirectUri: 'http://127.0.0.1:3001/callback'
});

let tareasProgramadas = [];
let anunciosProgramados = [];
let tokenRefreshInterval = null;
let monitorReproduccion = null;
let fadeInterval = null;
let sesionActiva = false;
let volumenPrevioDucking = null;

function parseSpotifyUri(input) {
    let uri = input.trim();
    if (uri.includes('spotify.com')) {
        const match = uri.match(/(track|playlist|album)\/([a-zA-Z0-9]+)/);
        if (match) return `spotify:${match[1]}:${match[2]}`;
    }
    return uri;
}

const esperar = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// --- FUNCIONES DE FADE-IN Y CROSSFADE SUAVE ---
function iniciarFadeInVolumen(deviceId, volInicial = 10, volFinal = 80, duracionSegundos = 30, pasos = 6) {
    if (fadeInterval) clearInterval(fadeInterval);
    let volActual = volInicial;
    const incremento = Math.max(1, Math.round((volFinal - volInicial) / pasos));
    const intervaloMs = Math.max(250, Math.round((duracionSegundos * 1000) / pasos));

    fadeInterval = setInterval(async () => {
        volActual += incremento;
        if (volActual >= volFinal) {
            volActual = volFinal;
            clearInterval(fadeInterval);
            fadeInterval = null;
        }
        try {
            await spotifyApi.setVolume(volActual, { device_id: deviceId });
        } catch (e) {
            clearInterval(fadeInterval);
            fadeInterval = null;
        }
    }, intervaloMs);
}

// Baja suavemente el volumen actual hasta 10% en ~2.8 segundos si ya hay música sonando
async function ejecutarCrossfadeSalida(deviceId) {
    if (fadeInterval) {
        clearInterval(fadeInterval);
        fadeInterval = null;
    }
    let volOriginal = 80;
    let estabaSonando = false;

    try {
        const estado = await spotifyApi.getMyCurrentPlaybackState();
        if (estado.body && estado.body.is_playing) {
            estabaSonando = true;
            volOriginal = estado.body.device?.volume_percent ?? 80;

            if (volOriginal > 15) {
                const pasos = 4;
                const decremento = Math.round((volOriginal - 10) / pasos);
                let v = volOriginal;
                for (let i = 0; i < pasos; i++) {
                    v = Math.max(10, v - decremento);
                    await spotifyApi.setVolume(v, { device_id: deviceId });
                    await esperar(650);
                }
            }
        }
    } catch (e) {}

    return { estabaSonando, volOriginal };
}

async function obtenerMetadatosRuta(rutaOriginal) {
    const fallback = {
        ruta: rutaOriginal,
        nombre: rutaOriginal,
        subtitulo: 'Enlace de Spotify',
        imagen: DEFAULT_IMG,
        tipo: 'Enlace'
    };

    if (!spotifyApi.getAccessToken()) return fallback;

    try {
        const uri = parseSpotifyUri(rutaOriginal);
        const partes = uri.split(':');
        const tipoUri = partes[1];
        const id = partes[2];

        if (tipoUri === 'track') {
            const data = await spotifyApi.getTrack(id);
            return {
                ruta: rutaOriginal,
                nombre: data.body.name,
                subtitulo: data.body.artists.map(a => a.name).join(', '),
                imagen: data.body.album.images[0]?.url || DEFAULT_IMG,
                tipo: 'Canción'
            };
        } else if (tipoUri === 'playlist') {
            const data = await spotifyApi.getPlaylist(id);
            return {
                ruta: rutaOriginal,
                nombre: data.body.name,
                subtitulo: `De ${data.body.owner.display_name || 'Spotify'}`,
                imagen: data.body.images[0]?.url || DEFAULT_IMG,
                tipo: 'Playlist'
            };
        } else if (tipoUri === 'album') {
            const data = await spotifyApi.getAlbum(id);
            return {
                ruta: rutaOriginal,
                nombre: data.body.name,
                subtitulo: data.body.artists.map(a => a.name).join(', '),
                imagen: data.body.images[0]?.url || DEFAULT_IMG,
                tipo: 'Álbum'
            };
        }
    } catch (e) {}
    return fallback;
}

async function actualizarMetadatosPendientes() {
    if (!spotifyApi.getAccessToken()) return;
    let huboCambiosTareas = false;
    let huboCambiosHistorial = false;

    for (let t of tareasProgramadas) {
        if (!t.nombre || t.nombre === t.ruta || t.subtitulo === 'Enlace guardado') {
            const meta = await obtenerMetadatosRuta(t.ruta);
            t.nombre = meta.nombre;
            t.subtitulo = meta.subtitulo;
            t.imagen = meta.imagen;
            t.tipo = meta.tipo;
            huboCambiosTareas = true;
        }
    }

    for (let i = 0; i < historial.length; i++) {
        let h = historial[i];
        if (!h.nombre || h.nombre === h.ruta || h.subtitulo === 'Enlace guardado') {
            const meta = await obtenerMetadatosRuta(h.ruta);
            historial[i] = meta;
            huboCambiosHistorial = true;
        }
    }

    if (huboCambiosTareas) {
        guardarTareasEnArchivo();
        emitirTareas();
    }
    if (huboCambiosHistorial) {
        fs.writeFileSync(historialPath, JSON.stringify(historial, null, 4));
        io.emit('historial_actualizado', historial);
    }
}

async function getActiveDevice() {
    const dispositivos = await spotifyApi.getMyDevices();
    const lista = dispositivos.body.devices || [];
    if (lista.length === 0) return null;

    if (appConfig.preferredDeviceId) {
        const preferido = lista.find(d => d.id === appConfig.preferredDeviceId);
        if (preferido) return preferido;
    }

    return lista.find(d => d.name.includes('Mi Panel Musical'))
        || lista.find(d => d.name.toLowerCase().includes('web player'))
        || lista.find(d => d.is_active) 
        || lista.find(d => d.type === 'Computer') 
        || lista[0];
}

async function emitirDispositivos() {
    if (!spotifyApi.getAccessToken()) return;
    try {
        const data = await spotifyApi.getMyDevices();
        io.emit('dispositivos_actualizados', {
            dispositivos: data.body.devices || [],
            preferredDeviceId: appConfig.preferredDeviceId || ''
        });
    } catch (e) {}
}

function iniciarServiciosSpotify() {
    sesionActiva = true;
    const tokenActual = spotifyApi.getAccessToken() || '';
    io.emit('estado_sesion', { autenticado: true, accessToken: tokenActual });

    if (tokenRefreshInterval) clearInterval(tokenRefreshInterval);
    tokenRefreshInterval = setInterval(async () => {
        try {
            const data = await spotifyApi.refreshAccessToken();
            const nuevoToken = data.body['access_token'];
            spotifyApi.setAccessToken(nuevoToken);
            if (data.body['refresh_token']) {
                spotifyApi.setRefreshToken(data.body['refresh_token']);
                appConfig.refreshToken = data.body['refresh_token'];
                fs.writeFileSync(configPath, JSON.stringify(appConfig, null, 4));
            }
            io.emit('estado_sesion', { autenticado: true, accessToken: nuevoToken });
        } catch (err) {}
    }, 50 * 60 * 1000);

    if (monitorReproduccion) clearInterval(monitorReproduccion);
    monitorReproduccion = setInterval(async () => {
        if (!spotifyApi.getAccessToken()) return;
        try {
            const [estado, dispositivosData] = await Promise.all([
                spotifyApi.getMyCurrentPlaybackState(),
                spotifyApi.getMyDevices()
            ]);

            io.emit('dispositivos_actualizados', {
                dispositivos: dispositivosData.body?.devices || [],
                preferredDeviceId: appConfig.preferredDeviceId || ''
            });

            if (estado.body && estado.body.item) {
                io.emit('estado_reproduccion', {
                    activo: estado.body.is_playing,
                    cancion: estado.body.item.name,
                    artista: estado.body.item.artists.map(a => a.name).join(', '),
                    imagen: estado.body.item.album.images[0]?.url,
                    progreso: estado.body.progress_ms,
                    duracion: estado.body.item.duration_ms,
                    volumen: estado.body.device?.volume_percent ?? 80,
                    dispositivoActivo: estado.body.device?.name || ''
                });
            } else {
                io.emit('estado_reproduccion', { activo: false });
            }
        } catch (error) {}
    }, 3000);
}

async function intentarAutoLogin() {
    if (!appConfig.refreshToken) return false;
    try {
        spotifyApi.setRefreshToken(appConfig.refreshToken);
        const data = await spotifyApi.refreshAccessToken();
        spotifyApi.setAccessToken(data.body['access_token']);
        if (data.body['refresh_token']) {
            spotifyApi.setRefreshToken(data.body['refresh_token']);
            appConfig.refreshToken = data.body['refresh_token'];
            fs.writeFileSync(configPath, JSON.stringify(appConfig, null, 4));
        }
        console.log('🔑 ¡Auto-Login exitoso! Sesión de Spotify activa.');
        iniciarServiciosSpotify();
        await actualizarMetadatosPendientes();
        await emitirDispositivos();
        return true;
    } catch (e) {
        sesionActiva = false;
        io.emit('estado_sesion', { autenticado: false, accessToken: '' });
        return false;
    }
}

// --- LÓGICA DE ALARMAS MUSICALES Y CRON (CON CROSSFADE SUAVE) ---
function crearTareaCron(hora, minuto, ruta, dias = DIAS_TODOS, activa = true, fadeIn = false) {
    const uriSpotify = parseSpotifyUri(ruta);
    const diasValidos = Array.isArray(dias) && dias.length > 0 ? dias : DIAS_TODOS;
    const diasCron = diasValidos.length === 7 ? '*' : diasValidos.join(',');

    const job = cron.schedule(`${minuto} ${hora} * * ${diasCron}`, async () => {
        if (!spotifyApi.getAccessToken() && appConfig.refreshToken) {
            await intentarAutoLogin();
        }
        if (!spotifyApi.getAccessToken()) return;

        let deviceId = null;
        let infoCrossfade = { estabaSonando: false, volOriginal: 80 };

        try {
            const device = await getActiveDevice();
            if (!device) return console.log('⚠️ No se encontró dispositivo para la alarma.');
            deviceId = device.id;
            
            if (device.is_active) {
                // Si ya estaba sonando otra canción, hace Fade-Out suave de 3s hasta 10%
                infoCrossfade = await ejecutarCrossfadeSalida(deviceId);
                try { await spotifyApi.pause({ device_id: deviceId }); } catch(e){}
                await esperar(600); 
            } else {
                await spotifyApi.transferMyPlayback([deviceId]);
                await esperar(2200); 
            }

            if (fadeIn || appConfig.vozActivada || infoCrossfade.estabaSonando) {
                try {
                    await spotifyApi.setVolume(10, { device_id: deviceId });
                    await esperar(300);
                } catch(e) {}
            }
        } catch (err) { return; }

        try {
            const esTrack = uriSpotify.includes('track');
            let opcionesPlay = { device_id: deviceId }; 
            if (esTrack) opcionesPlay.uris = [uriSpotify];
            else opcionesPlay.context_uri = uriSpotify;
            
            await spotifyApi.play(opcionesPlay);

            if (appConfig.vozActivada) {
                io.emit('hablar_tts', { 
                    textoAdicional: appConfig.vozTexto,
                    volumenVoz: appConfig.vozVolumen ?? 50,
                    vozNombre: appConfig.vozNombre || '',
                    esAlarmaMusical: true,
                    fadeInAlTerminar: Boolean(fadeIn)
                });
            } else if (fadeIn) {
                iniciarFadeInVolumen(deviceId, 10, 80, 30, 6);
            } else if (infoCrossfade.estabaSonando) {
                // Termina la transición Crossfade subiendo en 3 segundos al volumen previo
                iniciarFadeInVolumen(deviceId, 10, infoCrossfade.volOriginal, 3, 4);
            }
        } catch (err) {}
    });

    if (!activa) job.stop();
    return job;
}

// --- LÓGICA DE ANUNCIOS DE VOZ PROGRAMADOS (CRON INDEPENDIENTE) ---
function crearAnuncioCron(hora, minuto, texto, dias = DIAS_TODOS, activa = true) {
    const diasValidos = Array.isArray(dias) && dias.length > 0 ? dias : DIAS_TODOS;
    const diasCron = diasValidos.length === 7 ? '*' : diasValidos.join(',');

    const job = cron.schedule(`${minuto} ${hora} * * ${diasCron}`, () => {
        console.log(`🎙️ Disparando anuncio programado (${hora}:${minuto}): ${texto}`);
        io.emit('hablar_tts', {
            textoAdicional: texto,
            volumenVoz: appConfig.vozVolumen ?? 50,
            vozNombre: appConfig.vozNombre || '',
            esAlarmaMusical: false
        });
    });

    if (!activa) job.stop();
    return job;
}

function serializarTareas() {
    return tareasProgramadas.map(t => ({
        id: t.id,
        hora: t.hora,
        minuto: t.minuto,
        ruta: t.ruta,
        nombre: t.nombre || t.ruta,
        subtitulo: t.subtitulo || 'Spotify',
        imagen: t.imagen || DEFAULT_IMG,
        tipo: t.tipo || 'Enlace',
        dias: Array.isArray(t.dias) && t.dias.length > 0 ? t.dias : DIAS_TODOS,
        activa: t.activa !== undefined ? t.activa : true,
        fadeIn: Boolean(t.fadeIn)
    }));
}

function serializarAnuncios() {
    return anunciosProgramados.map(a => ({
        id: a.id,
        hora: a.hora,
        minuto: a.minuto,
        texto: a.texto,
        dias: Array.isArray(a.dias) && a.dias.length > 0 ? a.dias : DIAS_TODOS,
        activa: a.activa !== undefined ? a.activa : true
    }));
}

function emitirTareas() {
    io.emit('tareas_actualizadas', serializarTareas());
}

function emitirAnuncios() {
    io.emit('anuncios_actualizados', serializarAnuncios());
}

function guardarTareasEnArchivo() {
    fs.writeFileSync(tareasPath, JSON.stringify(serializarTareas(), null, 4));
}

function guardarAnunciosEnArchivo() {
    fs.writeFileSync(anunciosPath, JSON.stringify(serializarAnuncios(), null, 4));
}

// Cargar tareas musicales al iniciar
if (fs.existsSync(tareasPath)) {
    try {
        const tareasGuardadas = JSON.parse(fs.readFileSync(tareasPath, 'utf8'));
        let historialModificado = false;

        tareasGuardadas.forEach(t => {
            const dias = Array.isArray(t.dias) && t.dias.length > 0 ? t.dias : DIAS_TODOS;
            const activa = t.activa !== undefined ? t.activa : true;
            const fadeIn = Boolean(t.fadeIn);
            const cronObj = crearTareaCron(t.hora, t.minuto, t.ruta, dias, activa, fadeIn);
            
            const tareaNormalizada = {
                id: t.id,
                hora: t.hora,
                minuto: t.minuto,
                ruta: t.ruta,
                nombre: t.nombre || t.ruta,
                subtitulo: t.subtitulo || 'Enlace guardado',
                imagen: t.imagen || DEFAULT_IMG,
                tipo: t.tipo || 'Enlace',
                dias,
                activa,
                fadeIn,
                cronObj
            };
            tareasProgramadas.push(tareaNormalizada);
            
            if (!historial.some(h => h.ruta === t.ruta)) {
                historial.push({
                    ruta: t.ruta,
                    nombre: tareaNormalizada.nombre,
                    subtitulo: tareaNormalizada.subtitulo,
                    imagen: tareaNormalizada.imagen,
                    tipo: tareaNormalizada.tipo
                });
                historialModificado = true;
            }
        });

        if (historialModificado) {
            fs.writeFileSync(historialPath, JSON.stringify(historial, null, 4));
        }
    } catch (e) {}
}

// Cargar anuncios de voz programados al iniciar
if (fs.existsSync(anunciosPath)) {
    try {
        const anunciosGuardados = JSON.parse(fs.readFileSync(anunciosPath, 'utf8'));
        anunciosGuardados.forEach(a => {
            const dias = Array.isArray(a.dias) && a.dias.length > 0 ? a.dias : DIAS_TODOS;
            const activa = a.activa !== undefined ? a.activa : true;
            const cronObj = crearAnuncioCron(a.hora, a.minuto, a.texto, dias, activa);
            anunciosProgramados.push({
                id: a.id,
                hora: a.hora,
                minuto: a.minuto,
                texto: a.texto,
                dias,
                activa,
                cronObj
            });
        });
    } catch (e) {}
}

// ----- RUTAS DE AUTENTICACIÓN -----
app.get('/login', (req, res) => {
  const scopes = [
    'streaming',
    'user-read-email',
    'user-read-private',
    'user-modify-playback-state',
    'user-read-playback-state',
    'playlist-read-private',
    'playlist-read-collaborative'
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
          appConfig.refreshToken = refreshToken;
          fs.writeFileSync(configPath, JSON.stringify(appConfig, null, 4));
      }

      iniciarServiciosSpotify();
      await actualizarMetadatosPendientes();
      await emitirDispositivos();

      res.send('<h2 style="color:#1DB954; text-align:center; margin-top:50px; font-family:sans-serif;">¡Autenticación Exitosa!<br>Ya puedes cerrar esta pestaña.</h2>');
    }, (err) => res.send('Error en la autenticación.')
  );
});

// ----- LÓGICA DE SOCKETS -----
io.on('connection', (socket) => {
    socket.emit('tareas_actualizadas', serializarTareas());
    socket.emit('anuncios_actualizados', serializarAnuncios());
    socket.emit('configuracion_actual', {
        clientId: appConfig.clientId,
        clientSecret: appConfig.clientSecret,
        preferredDeviceId: appConfig.preferredDeviceId || '',
        vozActivada: Boolean(appConfig.vozActivada),
        vozTexto: appConfig.vozTexto || '',
        vozVolumen: appConfig.vozVolumen ?? 50,
        vozNombre: appConfig.vozNombre || ''
    });
    socket.emit('historial_actualizado', historial);
    socket.emit('estado_sesion', { 
        autenticado: sesionActiva, 
        accessToken: spotifyApi.getAccessToken() || '' 
    });
    socket.emit('info_red', { ipLocal: obtenerIpLocal() });
    emitirDispositivos();

    // --- AUDIO DUCKING: Bajar música al 10% mientras habla el locutor y restaurar al terminar ---
    socket.on('duck_audio_inicio', async (opciones) => {
        if (!spotifyApi.getAccessToken()) return;
        try {
            if (fadeInterval) {
                clearInterval(fadeInterval);
                fadeInterval = null;
            }
            const estado = await spotifyApi.getMyCurrentPlaybackState();
            const device = await getActiveDevice();
            if (!device) return;

            if (!opciones?.esAlarmaMusical) {
                const volActual = estado.body?.device?.volume_percent;
                if (typeof volActual === 'number' && volActual > 10) {
                    volumenPrevioDucking = volActual;
                } else if (volumenPrevioDucking === null) {
                    volumenPrevioDucking = 80;
                }
            }
            await spotifyApi.setVolume(10, { device_id: device.id });
        } catch (e) {}
    });

    socket.on('duck_audio_fin', async (opciones) => {
        if (!spotifyApi.getAccessToken()) return;
        try {
            const device = await getActiveDevice();
            if (!device) return;

            if (opciones?.esAlarmaMusical) {
                if (opciones?.fadeInAlTerminar) {
                    iniciarFadeInVolumen(device.id, 10, 80, 25, 6);
                } else {
                    await spotifyApi.setVolume(80, { device_id: device.id });
                }
            } else if (volumenPrevioDucking !== null) {
                await spotifyApi.setVolume(volumenPrevioDucking, { device_id: device.id });
                volumenPrevioDucking = null;
            }
        } catch (e) {}
    });

    // --- GESTIÓN DE ANUNCIOS PROGRAMADOS ---
    socket.on('programar_anuncio', (data) => {
        const { hora, minuto, texto, dias } = data;
        if (!hora || !minuto || !texto) return;
        const diasSeleccionados = Array.isArray(dias) && dias.length > 0 ? dias : DIAS_TODOS;
        const cronObj = crearAnuncioCron(hora, minuto, texto, diasSeleccionados, true);

        anunciosProgramados.push({
            id: Date.now(),
            hora,
            minuto,
            texto,
            dias: diasSeleccionados,
            activa: true,
            cronObj
        });
        guardarAnunciosEnArchivo();
        emitirAnuncios();
    });

    socket.on('toggle_anuncio', (id) => {
        const index = anunciosProgramados.findIndex(a => String(a.id) === String(id));
        if (index !== -1) {
            const anuncio = anunciosProgramados[index];
            anuncio.activa = !anuncio.activa;
            if (anuncio.activa) anuncio.cronObj.start();
            else anuncio.cronObj.stop();
            guardarAnunciosEnArchivo();
            emitirAnuncios();
        }
    });

    socket.on('editar_anuncio', (data) => {
        const { id, nuevaHora, nuevoMinuto, nuevoTexto, nuevosDias } = data;
        const index = anunciosProgramados.findIndex(a => String(a.id) === String(id));
        if (index !== -1) {
            const anuncio = anunciosProgramados[index];
            anuncio.cronObj.stop();
            if (nuevaHora !== undefined) anuncio.hora = nuevaHora;
            if (nuevoMinuto !== undefined) anuncio.minuto = nuevoMinuto;
            if (nuevoTexto !== undefined) anuncio.texto = nuevoTexto;
            if (Array.isArray(nuevosDias) && nuevosDias.length > 0) {
                anuncio.dias = nuevosDias;
            }
            anuncio.cronObj = crearAnuncioCron(anuncio.hora, anuncio.minuto, anuncio.texto, anuncio.dias, anuncio.activa);
            guardarAnunciosEnArchivo();
            emitirAnuncios();
        }
    });

    socket.on('eliminar_anuncio', (id) => {
        const index = anunciosProgramados.findIndex(a => String(a.id) === String(id));
        if (index !== -1) {
            anunciosProgramados[index].cronObj.stop();
            anunciosProgramados.splice(index, 1);
            guardarAnunciosEnArchivo();
            emitirAnuncios();
        }
    });

    socket.on('forzar_reconexion', async (cb) => {
        const ok = await intentarAutoLogin();
        if (typeof cb === 'function') cb(ok);
    });

    // Reproducción desde vista móvil / historial con Crossfade Suave
    socket.on('reproducir_item_directo', async (rutaOriginal) => {
        if (!spotifyApi.getAccessToken()) return;
        try {
            const uriSpotify = parseSpotifyUri(rutaOriginal);
            const device = await getActiveDevice();
            if (!device) return;

            let infoCrossfade = { estabaSonando: false, volOriginal: 80 };
            if (!device.is_active) {
                await spotifyApi.transferMyPlayback([device.id]);
                await esperar(1500);
            } else {
                infoCrossfade = await ejecutarCrossfadeSalida(device.id);
            }

            const esTrack = uriSpotify.includes('track');
            const opcionesPlay = { device_id: device.id };
            if (esTrack) opcionesPlay.uris = [uriSpotify];
            else opcionesPlay.context_uri = uriSpotify;

            await spotifyApi.play(opcionesPlay);

            if (infoCrossfade.estabaSonando) {
                iniciarFadeInVolumen(device.id, 10, infoCrossfade.volOriginal, 3, 4);
            }
        } catch (e) {}
    });

    socket.on('solicitar_token_sdk', async (callback) => {
        if (!spotifyApi.getAccessToken() && appConfig.refreshToken) {
            await intentarAutoLogin();
        }
        if (typeof callback === 'function') {
            callback(spotifyApi.getAccessToken() || '');
        }
    });

    socket.on('web_player_listo', async (deviceId) => {
        await esperar(800);
        await emitirDispositivos();
    });

    socket.on('guardar_locutor', (datosVoz) => {
        if (datosVoz.vozActivada !== undefined) {
            appConfig.vozActivada = Boolean(datosVoz.vozActivada);
        }
        if (datosVoz.vozTexto !== undefined) {
            appConfig.vozTexto = datosVoz.vozTexto;
        }
        if (datosVoz.vozVolumen !== undefined) {
            appConfig.vozVolumen = Number(datosVoz.vozVolumen);
        }
        if (datosVoz.vozNombre !== undefined) {
            appConfig.vozNombre = datosVoz.vozNombre;
        }
        fs.writeFileSync(configPath, JSON.stringify(appConfig, null, 4));
        io.emit('locutor_guardado_ok', {
            vozActivada: appConfig.vozActivada,
            vozTexto: appConfig.vozTexto,
            vozVolumen: appConfig.vozVolumen,
            vozNombre: appConfig.vozNombre
        });
    });

    socket.on('guardar_configuracion', (nuevosDatos) => {
        const nuevoId = (nuevosDatos.clientId || '').trim();
        const nuevoSecret = (nuevosDatos.clientSecret || '').trim();
        if (!nuevoId || !nuevoSecret) return;

        const cambioCredenciales = appConfig.clientId !== nuevoId || appConfig.clientSecret !== nuevoSecret;
        appConfig.clientId = nuevoId;
        appConfig.clientSecret = nuevoSecret;

        if (cambioCredenciales) {
            appConfig.refreshToken = '';
            sesionActiva = false;
            io.emit('estado_sesion', { autenticado: false, accessToken: '' });
        }
        
        fs.writeFileSync(configPath, JSON.stringify(appConfig, null, 4));
        spotifyApi.setClientId(appConfig.clientId);
        spotifyApi.setClientSecret(appConfig.clientSecret);
        socket.emit('configuracion_guardada');
    });

    socket.on('obtener_dispositivos', async () => {
        await emitirDispositivos();
    });

    socket.on('seleccionar_dispositivo', async (deviceId) => {
        appConfig.preferredDeviceId = deviceId || '';
        fs.writeFileSync(configPath, JSON.stringify(appConfig, null, 4));

        if (deviceId && spotifyApi.getAccessToken()) {
            try { await spotifyApi.transferMyPlayback([deviceId]); } catch (e) {}
        }
        await emitirDispositivos();
    });

    socket.on('control_play', async () => { 
        if (!spotifyApi.getAccessToken()) return;
        try { 
            const device = await getActiveDevice();
            if (!device) return;
            if (!device.is_active) { await spotifyApi.transferMyPlayback([device.id]); await esperar(1500); }
            await spotifyApi.play({ device_id: device.id }); 
        } catch(e){} 
    });

    socket.on('control_pausa', async () => { 
        if (!spotifyApi.getAccessToken()) return;
        if (fadeInterval) { clearInterval(fadeInterval); fadeInterval = null; }
        try { const device = await getActiveDevice(); if(device) await spotifyApi.pause({ device_id: device.id }); } catch(e){} 
    });
    socket.on('control_siguiente', async () => { 
        if (!spotifyApi.getAccessToken()) return;
        try { const device = await getActiveDevice(); if(device) await spotifyApi.skipToNext({ device_id: device.id }); } catch(e){} 
    });
    socket.on('control_anterior', async () => { 
        if (!spotifyApi.getAccessToken()) return;
        try { const device = await getActiveDevice(); if(device) await spotifyApi.skipToPrevious({ device_id: device.id }); } catch(e){} 
    });

    socket.on('control_seek', async (posicionMs) => {
        if (!spotifyApi.getAccessToken()) return;
        try {
            const device = await getActiveDevice();
            if (device) await spotifyApi.seek(Math.floor(posicionMs), { device_id: device.id });
        } catch(e) {}
    });

    socket.on('control_volumen', async (nuevoVolumen) => {
        if (!spotifyApi.getAccessToken()) return;
        if (fadeInterval) { clearInterval(fadeInterval); fadeInterval = null; }
        try {
            const device = await getActiveDevice();
            if (device) {
                const volSeguro = Math.max(0, Math.min(100, Math.round(nuevoVolumen)));
                await spotifyApi.setVolume(volSeguro, { device_id: device.id });
            }
        } catch(e) {}
    });

    // Reproducción desde la cola derecha con Crossfade Suave
    socket.on('reproducir_ahora', async (data) => {
        if (!spotifyApi.getAccessToken()) return;
        try {
            const { uris, offset } = data;
            const device = await getActiveDevice();
            if (!device) return;

            let infoCrossfade = { estabaSonando: false, volOriginal: 80 };
            if (!device.is_active) {
                await spotifyApi.transferMyPlayback([device.id]);
                await esperar(1500);
            } else {
                infoCrossfade = await ejecutarCrossfadeSalida(device.id);
            }

            await spotifyApi.play({ device_id: device.id, uris, offset: { position: offset } });

            if (infoCrossfade.estabaSonando) {
                iniciarFadeInVolumen(device.id, 10, infoCrossfade.volOriginal, 3, 4);
            }
        } catch(e) {}
    });

    socket.on('obtener_playlist', async (rutaOriginal) => {
        if (!spotifyApi.getAccessToken()) return socket.emit('lista_canciones_resultado', ['⚠️ Inicia sesión primero.']);
        try {
            const uri = parseSpotifyUri(rutaOriginal);
            if (uri.includes('playlist')) {
                const playlistId = uri.split(':')[2];
                const data = await spotifyApi.getPlaylistTracks(playlistId);
                const tracks = data.body.items.map((item, index) => ({ numero: index + 1, nombre: item.track.name, artista: item.track.artists[0].name, uri: item.track.uri }));
                socket.emit('lista_canciones_resultado', tracks);
            } else if (uri.includes('track')) {
                const trackId = uri.split(':')[2];
                const data = await spotifyApi.getTrack(trackId);
                socket.emit('lista_canciones_resultado', [{ numero: 1, nombre: data.body.name, artista: data.body.artists[0].name, uri: data.body.uri }]);
            } else if (uri.includes('album')) {
                const albumId = uri.split(':')[2];
                const data = await spotifyApi.getAlbumTracks(albumId);
                const tracks = data.body.items.map((item, index) => ({ numero: index + 1, nombre: item.name, artista: item.artists[0].name, uri: item.uri }));
                socket.emit('lista_canciones_resultado', tracks);
            } else { socket.emit('lista_canciones_resultado', ['Formato no reconocido.']); }
        } catch (error) { socket.emit('lista_canciones_resultado', ['Error al cargar la info.']); }
    });

    socket.on('programar_musica', async (data) => {
        const { hora, minuto, ruta, dias, fadeIn } = data;
        const diasSeleccionados = Array.isArray(dias) && dias.length > 0 ? dias : DIAS_TODOS;
        const usarFadeIn = Boolean(fadeIn);
        const meta = await obtenerMetadatosRuta(ruta);
        const cronObj = crearTareaCron(hora, minuto, ruta, diasSeleccionados, true, usarFadeIn);
        
        const nuevaTarea = { 
            id: Date.now(), 
            hora, 
            minuto, 
            ruta, 
            nombre: meta.nombre,
            subtitulo: meta.subtitulo,
            imagen: meta.imagen,
            tipo: meta.tipo,
            dias: diasSeleccionados,
            activa: true,
            fadeIn: usarFadeIn,
            cronObj 
        };
        
        tareasProgramadas.push(nuevaTarea);
        guardarTareasEnArchivo();

        const indexHist = historial.findIndex(h => h.ruta === ruta);
        if (indexHist === -1) {
            historial.unshift(meta);
        } else {
            historial[indexHist] = meta;
        }
        fs.writeFileSync(historialPath, JSON.stringify(historial, null, 4));
        
        io.emit('historial_actualizado', historial);
        emitirTareas();
    });

    socket.on('toggle_tarea', (id) => {
        const index = tareasProgramadas.findIndex(t => String(t.id) === String(id));
        if (index !== -1) {
            const tarea = tareasProgramadas[index];
            tarea.activa = !tarea.activa;
            if (tarea.activa) tarea.cronObj.start();
            else tarea.cronObj.stop();
            guardarTareasEnArchivo();
            emitirTareas();
        }
    });

    socket.on('editar_tarea', (data) => {
        const { id, nuevaHora, nuevoMinuto, nuevosDias, nuevoFadeIn } = data;
        const index = tareasProgramadas.findIndex(t => String(t.id) === String(id));
        if (index !== -1) {
            const tarea = tareasProgramadas[index];
            tarea.cronObj.stop();
            if (nuevaHora !== undefined) tarea.hora = nuevaHora;
            if (nuevoMinuto !== undefined) tarea.minuto = nuevoMinuto;
            if (Array.isArray(nuevosDias) && nuevosDias.length > 0) {
                tarea.dias = nuevosDias;
            }
            if (nuevoFadeIn !== undefined) {
                tarea.fadeIn = Boolean(nuevoFadeIn);
            }
            tarea.cronObj = crearTareaCron(tarea.hora, tarea.minuto, tarea.ruta, tarea.dias, tarea.activa, tarea.fadeIn);
            
            guardarTareasEnArchivo();
            emitirTareas();
        }
    });

    socket.on('importar_backup', async (backupData) => {
        try {
            if (Array.isArray(backupData.tareas)) {
                tareasProgramadas.forEach(t => t.cronObj.stop());
                tareasProgramadas = [];

                backupData.tareas.forEach(t => {
                    if (!t.hora || !t.minuto || !t.ruta) return;
                    const dias = Array.isArray(t.dias) && t.dias.length > 0 ? t.dias : DIAS_TODOS;
                    const activa = t.activa !== undefined ? t.activa : true;
                    const fadeIn = Boolean(t.fadeIn);
                    const cronObj = crearTareaCron(t.hora, t.minuto, t.ruta, dias, activa, fadeIn);

                    tareasProgramadas.push({
                        id: t.id || Date.now() + Math.floor(Math.random() * 10000),
                        hora: t.hora,
                        minuto: t.minuto,
                        ruta: t.ruta,
                        nombre: t.nombre || t.ruta,
                        subtitulo: t.subtitulo || 'Spotify',
                        imagen: t.imagen || DEFAULT_IMG,
                        tipo: t.tipo || 'Enlace',
                        dias,
                        activa,
                        fadeIn,
                        cronObj
                    });
                });
                guardarTareasEnArchivo();
                emitirTareas();
            }

            if (Array.isArray(backupData.anuncios)) {
                anunciosProgramados.forEach(a => a.cronObj.stop());
                anunciosProgramados = [];

                backupData.anuncios.forEach(a => {
                    if (!a.hora || !a.minuto || !a.texto) return;
                    const dias = Array.isArray(a.dias) && a.dias.length > 0 ? a.dias : DIAS_TODOS;
                    const activa = a.activa !== undefined ? a.activa : true;
                    const cronObj = crearAnuncioCron(a.hora, a.minuto, a.texto, dias, activa);

                    anunciosProgramados.push({
                        id: a.id || Date.now() + Math.floor(Math.random() * 10000),
                        hora: a.hora,
                        minuto: a.minuto,
                        texto: a.texto,
                        dias,
                        activa,
                        cronObj
                    });
                });
                guardarAnunciosEnArchivo();
                emitirAnuncios();
            }

            if (Array.isArray(backupData.historial)) {
                historial = backupData.historial.map(item => typeof item === 'string'
                    ? { ruta: item, nombre: item, subtitulo: 'Enlace guardado', imagen: DEFAULT_IMG, tipo: 'Enlace' }
                    : item
                );
                fs.writeFileSync(historialPath, JSON.stringify(historial, null, 4));
                io.emit('historial_actualizado', historial);
            }

            await actualizarMetadatosPendientes();
            socket.emit('backup_importado_ok');
        } catch (e) {}
    });

    socket.on('eliminar_historial', (rutaEliminar) => {
        historial = historial.filter(h => h.ruta !== rutaEliminar);
        fs.writeFileSync(historialPath, JSON.stringify(historial, null, 4));
        io.emit('historial_actualizado', historial);
    });

    socket.on('cancelar_tarea', (id) => {
        const index = tareasProgramadas.findIndex(t => String(t.id) === String(id));
        if (index !== -1) {
            tareasProgramadas[index].cronObj.stop();
            tareasProgramadas.splice(index, 1);
            guardarTareasEnArchivo();
            emitirTareas();
        }
    });
});

server.listen(3001, '0.0.0.0', () => {
    const ip = obtenerIpLocal();
    console.log('==================================================');
    console.log(` Backend Local:   http://localhost:3001`);
    console.log(` Control Móvil:   http://${ip}:5173`);
    console.log('==================================================');
    intentarAutoLogin();
});