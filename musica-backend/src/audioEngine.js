const cron = require('node-cron');
const { state, DEFAULT_IMG, DIAS_TODOS, guardarTareas, guardarHistorial, rawTareas, rawAnuncios, registrarEvento } = require('./dataManager');
const utils = require('./utils');

module.exports = function(io, spotifyApi) {

    function iniciarFadeInVolumen(deviceId, volInicial = 10, volFinal = 80, duracionSegundos = 30, pasos = 6) {
        if (state.runtime.fadeInterval) clearInterval(state.runtime.fadeInterval);
        let volActual = volInicial;
        const incremento = Math.max(1, Math.round((volFinal - volInicial) / pasos));
        const intervaloMs = Math.max(250, Math.round((duracionSegundos * 1000) / pasos));

        state.runtime.fadeInterval = setInterval(async () => {
            volActual += incremento;
            if (volActual >= volFinal) {
                volActual = volFinal;
                clearInterval(state.runtime.fadeInterval);
                state.runtime.fadeInterval = null;
            }
            try { await spotifyApi.setVolume(volActual, { device_id: deviceId }); } 
            catch (e) { clearInterval(state.runtime.fadeInterval); state.runtime.fadeInterval = null; }
        }, intervaloMs);
    }

    async function ejecutarCrossfadeSalida(deviceId) {
        if (state.runtime.fadeInterval) { clearInterval(state.runtime.fadeInterval); state.runtime.fadeInterval = null; }
        let volOriginal = 80;
        let estabaSonando = false;

        try {
            const estado = await spotifyApi.getMyCurrentPlaybackState();
            if (estado.body && estado.body.is_playing) {
                estabaSonando = true;
                volOriginal = estado.body.device?.volume_percent ?? 80;

                if (volOriginal > 15 && deviceId) {
                    const pasos = 4;
                    const decremento = Math.round((volOriginal - 10) / pasos);
                    let v = volOriginal;
                    for (let i = 0; i < pasos; i++) {
                        v = Math.max(10, v - decremento);
                        await spotifyApi.setVolume(v, { device_id: deviceId });
                        await utils.esperar(650);
                    }
                }
            }
        } catch (e) {}
        return { estabaSonando, volOriginal };
    }

    async function obtenerMetadatosRuta(rutaOriginal) {
        const ytId = utils.parseYoutubeId(rutaOriginal);
        if (ytId) {
            const fallbackYt = { ruta: rutaOriginal, nombre: `Video de YouTube (${ytId})`, subtitulo: 'YouTube Music / Video', imagen: `https://i.ytimg.com/vi/${ytId}/hqdefault.jpg`, tipo: 'YouTube' };
            try {
                const res = await fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${ytId}&format=json`);
                if (res.ok) {
                    const data = await res.json();
                    return { ruta: rutaOriginal, nombre: data.title || fallbackYt.nombre, subtitulo: data.author_name ? `YouTube • ${data.author_name}` : 'YouTube', imagen: data.thumbnail_url || fallbackYt.imagen, tipo: 'YouTube' };
                }
            } catch (e) {}
            return fallbackYt;
        }

        const fallback = { ruta: rutaOriginal, nombre: rutaOriginal, subtitulo: 'Enlace de Spotify', imagen: DEFAULT_IMG, tipo: 'Enlace' };
        if (!spotifyApi.getAccessToken()) return fallback;

        try {
            const uri = utils.parseSpotifyUri(rutaOriginal);
            const partes = uri.split(':');
            const tipoUri = partes[1];
            const id = partes[2];

            if (tipoUri === 'track') {
                const data = await spotifyApi.getTrack(id);
                return { ruta: rutaOriginal, nombre: data.body.name, subtitulo: data.body.artists.map(a => a.name).join(', '), imagen: data.body.album.images[0]?.url || DEFAULT_IMG, tipo: 'Canción' };
            } else if (tipoUri === 'playlist') {
                const data = await spotifyApi.getPlaylist(id);
                return { ruta: rutaOriginal, nombre: data.body.name, subtitulo: `De ${data.body.owner.display_name || 'Spotify'}`, imagen: data.body.images[0]?.url || DEFAULT_IMG, tipo: 'Playlist' };
            } else if (tipoUri === 'album') {
                const data = await spotifyApi.getAlbum(id);
                return { ruta: rutaOriginal, nombre: data.body.name, subtitulo: data.body.artists.map(a => a.name).join(', '), imagen: data.body.images[0]?.url || DEFAULT_IMG, tipo: 'Álbum' };
            }
        } catch (e) {}
        return fallback;
    }

    async function actualizarMetadatosPendientes() {
        let huboCambios = false;
        for (let t of state.tareasProgramadas) {
            if (!t.nombre || t.nombre === t.ruta || t.subtitulo === 'Enlace guardado') {
                const meta = await obtenerMetadatosRuta(t.ruta);
                t.nombre = meta.nombre; t.subtitulo = meta.subtitulo; t.imagen = meta.imagen; t.tipo = meta.tipo;
                huboCambios = true;
            }
        }
        for (let i = 0; i < state.historial.length; i++) {
            let h = state.historial[i];
            if (!h.nombre || h.nombre === h.ruta || h.subtitulo === 'Enlace guardado') {
                state.historial[i] = await obtenerMetadatosRuta(h.ruta);
                huboCambios = true;
            }
        }
        if (huboCambios) {
            guardarTareas(); guardarHistorial();
            io.emit('historial_actualizado', state.historial);
        }
    }

    async function getActiveDevice() {
        const dispositivos = await spotifyApi.getMyDevices();
        const lista = dispositivos.body.devices || [];
        if (lista.length === 0) return null;
        if (state.appConfig.preferredDeviceId) {
            const preferido = lista.find(d => d.id === state.appConfig.preferredDeviceId);
            if (preferido) return preferido;
        }
        return lista.find(d => d.name.includes('Mi Panel Musical')) || lista.find(d => d.name.toLowerCase().includes('web player')) || lista.find(d => d.is_active) || lista.find(d => d.type === 'Computer') || lista[0];
    }

    async function emitirDispositivos() {
        if (!spotifyApi.getAccessToken()) return;
        try {
            const data = await spotifyApi.getMyDevices();
            io.emit('dispositivos_actualizados', { dispositivos: data.body.devices || [], preferredDeviceId: state.appConfig.preferredDeviceId || '' });
        } catch (e) {}
    }

    async function reproducirRutaYoutube(rutaOriginal, usarFadeIn = false, esAlarma = false) {
        const ytId = utils.parseYoutubeId(rutaOriginal);
        if (!ytId) return;

        if (spotifyApi.getAccessToken()) {
            try {
                const device = await getActiveDevice();
                if (device && device.is_active) {
                    await ejecutarCrossfadeSalida(device.id);
                    await spotifyApi.pause({ device_id: device.id });
                }
            } catch (e) {}
        }

        const meta = await obtenerMetadatosRuta(rutaOriginal);
        state.estadoYoutube = {
            enUso: true, activo: true, videoId: ytId, cancion: meta.nombre, artista: meta.subtitulo,
            imagen: meta.imagen, progreso: 0, duracion: 0, volumen: usarFadeIn ? 10 : (state.estadoYoutube.volumen || 80)
        };

        io.emit('youtube_comando', { accion: 'play_video', videoId: ytId, nombre: meta.nombre, artista: meta.subtitulo, imagen: meta.imagen, fadeIn: Boolean(usarFadeIn), locutorActivo: Boolean(esAlarma && state.appConfig.vozActivada) });
        io.emit('estado_reproduccion', { activo: true, cancion: state.estadoYoutube.cancion, artista: state.estadoYoutube.artista, imagen: state.estadoYoutube.imagen, progreso: 0, duracion: 0, volumen: state.estadoYoutube.volumen, esYoutube: true, videoId: ytId });

        if (esAlarma) registrarEvento(io, `⏰ Alarma disparada de YouTube: ${meta.nombre}`, 'success');
        
        if (esAlarma && state.appConfig.vozActivada) {
            utils.lanzarAlertaFocos(state.appConfig);
            io.emit('hablar_tts', { textoAdicional: state.appConfig.vozTexto, volumenVoz: state.appConfig.vozVolumen ?? 50, vozNombre: state.appConfig.vozNombre || '', esAlarmaMusical: true, fadeInAlTerminar: Boolean(usarFadeIn) });
        }
    }

    function iniciarServiciosSpotify() {
        state.runtime.sesionActiva = true;
        io.emit('estado_sesion', { autenticado: true, accessToken: spotifyApi.getAccessToken() || '' });

        if (state.runtime.tokenRefreshInterval) clearInterval(state.runtime.tokenRefreshInterval);
        state.runtime.tokenRefreshInterval = setInterval(async () => {
            try {
                const data = await spotifyApi.refreshAccessToken();
                spotifyApi.setAccessToken(data.body['access_token']);
                if (data.body['refresh_token']) {
                    spotifyApi.setRefreshToken(data.body['refresh_token']);
                    state.appConfig.refreshToken = data.body['refresh_token'];
                    const { guardarConfig } = require('./dataManager');
                    guardarConfig();
                }
                io.emit('estado_sesion', { autenticado: true, accessToken: data.body['access_token'] });
                registrarEvento(io, '🔄 Token de Spotify renovado automáticamente.', 'info');
            } catch (err) {
                registrarEvento(io, '⚠️ Falló la renovación automática del Token de Spotify.', 'warning');
            }
        }, 50 * 60 * 1000);

        if (state.runtime.monitorReproduccion) clearInterval(state.runtime.monitorReproduccion);
        state.runtime.monitorReproduccion = setInterval(async () => {
            if (!spotifyApi.getAccessToken()) return;
            try {
                const [estado, dispositivosData] = await Promise.all([ spotifyApi.getMyCurrentPlaybackState(), spotifyApi.getMyDevices() ]);
                io.emit('dispositivos_actualizados', { dispositivos: dispositivosData.body?.devices || [], preferredDeviceId: state.appConfig.preferredDeviceId || '' });

                if (state.estadoYoutube.enUso) {
                    if (estado.body && estado.body.is_playing) {
                        state.estadoYoutube.enUso = false; state.estadoYoutube.activo = false;
                        io.emit('youtube_comando', { accion: 'stop' });
                        registrarEvento(io, '▶️ Spotify reanudado, deteniendo YouTube de fondo.', 'info');
                    } else {
                        io.emit('estado_reproduccion', { ...state.estadoYoutube, esYoutube: true });
                        return;
                    }
                }

                if (estado.body && estado.body.item) {
                    io.emit('estado_reproduccion', {
                        activo: estado.body.is_playing, cancion: estado.body.item.name, artista: estado.body.item.artists.map(a => a.name).join(', '),
                        imagen: estado.body.item.album.images[0]?.url, progreso: estado.body.progress_ms, duracion: estado.body.item.duration_ms,
                        volumen: estado.body.device?.volume_percent ?? 80, dispositivoActivo: estado.body.device?.name || '', esYoutube: false
                    });
                } else {
                    io.emit('estado_reproduccion', { activo: false, esYoutube: false });
                }
            } catch (error) {}
        }, 3000);
    }

    async function intentarAutoLogin() {
        if (!state.appConfig.refreshToken) return false;
        try {
            spotifyApi.setRefreshToken(state.appConfig.refreshToken);
            const data = await spotifyApi.refreshAccessToken();
            spotifyApi.setAccessToken(data.body['access_token']);
            if (data.body['refresh_token']) {
                spotifyApi.setRefreshToken(data.body['refresh_token']);
                state.appConfig.refreshToken = data.body['refresh_token'];
                const { guardarConfig } = require('./dataManager');
                guardarConfig();
            }
            registrarEvento(io, '🔑 Auto-Login de Spotify exitoso.', 'success');
            iniciarServiciosSpotify();
            await actualizarMetadatosPendientes();
            await emitirDispositivos();
            return true;
        } catch (e) {
            state.runtime.sesionActiva = false;
            io.emit('estado_sesion', { autenticado: false, accessToken: '' });
            registrarEvento(io, '❌ Falló el inicio de sesión de Spotify. Reconecta manualmente.', 'error');
            return false;
        }
    }

    function crearTareaCron(hora, minuto, ruta, dias = DIAS_TODOS, activa = true, fadeIn = false) {
        const ytId = utils.parseYoutubeId(ruta);
        const uriSpotify = utils.parseSpotifyUri(ruta);
        const diasCron = (Array.isArray(dias) && dias.length > 0 ? dias : DIAS_TODOS).length === 7 ? '*' : dias.join(',');

        const job = cron.schedule(`${minuto} ${hora} * * ${diasCron}`, async () => {
            if (ytId) { await reproducirRutaYoutube(ruta, Boolean(fadeIn), true); return; }

            if (state.estadoYoutube.enUso) {
                state.estadoYoutube.enUso = false; state.estadoYoutube.activo = false;
                io.emit('youtube_comando', { accion: 'fade_out_stop' });
                await utils.esperar(2200);
            }

            if (!spotifyApi.getAccessToken() && state.appConfig.refreshToken) await intentarAutoLogin();
            if (!spotifyApi.getAccessToken()) {
                registrarEvento(io, `❌ Alarma musical fallida (Sin sesión de Spotify): ${ruta}`, 'error');
                return;
            }

            let deviceId = null;
            let infoCrossfade = { estabaSonando: false, volOriginal: 80 };

            try {
                const device = await getActiveDevice();
                if (!device) {
                    registrarEvento(io, `⚠️ No se encontró dispositivo activo para la alarma: ${ruta}`, 'warning');
                    return;
                }
                deviceId = device.id;
                
                if (device.is_active) {
                    infoCrossfade = await ejecutarCrossfadeSalida(deviceId);
                    try { await spotifyApi.pause({ device_id: deviceId }); } catch(e){}
                    await utils.esperar(600); 
                } else {
                    await spotifyApi.transferMyPlayback([deviceId]);
                    await utils.esperar(2200); 
                }

                if (fadeIn || state.appConfig.vozActivada || infoCrossfade.estabaSonando) {
                    try { await spotifyApi.setVolume(10, { device_id: deviceId }); await utils.esperar(300); } catch(e) {}
                }
            } catch (err) { return; }

            try {
                await spotifyApi.play(uriSpotify.includes('track') ? { device_id: deviceId, uris: [uriSpotify] } : { device_id: deviceId, context_uri: uriSpotify });
                registrarEvento(io, `⏰ Alarma musical de Spotify disparada correctamente.`, 'success');

                if (state.appConfig.vozActivada) {
                    utils.lanzarAlertaFocos(state.appConfig);
                    io.emit('hablar_tts', { textoAdicional: state.appConfig.vozTexto, volumenVoz: state.appConfig.vozVolumen ?? 50, vozNombre: state.appConfig.vozNombre || '', esAlarmaMusical: true, fadeInAlTerminar: Boolean(fadeIn) });
                } else if (fadeIn) {
                    iniciarFadeInVolumen(deviceId, 10, 80, 30, 6);
                } else if (infoCrossfade.estabaSonando) {
                    iniciarFadeInVolumen(deviceId, 10, infoCrossfade.volOriginal, 3, 4);
                }
            } catch (err) {
                registrarEvento(io, `❌ Error reproduciendo alarma en Spotify.`, 'error');
            }
        });
        if (!activa) job.stop();
        return job;
    }

    function crearAnuncioCron(hora, minuto, texto, dias = DIAS_TODOS, activa = true) {
        const diasCron = (Array.isArray(dias) && dias.length > 0 ? dias : DIAS_TODOS).length === 7 ? '*' : dias.join(',');
        const job = cron.schedule(`${minuto} ${hora} * * ${diasCron}`, () => {
            utils.lanzarAlertaFocos(state.appConfig);
            io.emit('hablar_tts', { textoAdicional: texto, volumenVoz: state.appConfig.vozVolumen ?? 50, vozNombre: state.appConfig.vozNombre || '', esAlarmaMusical: false });
            registrarEvento(io, `🎙️ Anuncio programado disparado: "${texto}"`, 'success');
        });
        if (!activa) job.stop();
        return job;
    }

    function inicializarCronGuardados() {
        rawTareas.forEach(t => {
            const dias = Array.isArray(t.dias) && t.dias.length > 0 ? t.dias : DIAS_TODOS;
            const activa = t.activa !== undefined ? t.activa : true;
            const fadeIn = Boolean(t.fadeIn);
            const cronObj = crearTareaCron(t.hora, t.minuto, t.ruta, dias, activa, fadeIn);
            state.tareasProgramadas.push({ id: t.id, hora: t.hora, minuto: t.minuto, ruta: t.ruta, nombre: t.nombre || t.ruta, subtitulo: t.subtitulo || 'Enlace', imagen: t.imagen || DEFAULT_IMG, tipo: t.tipo || (utils.parseYoutubeId(t.ruta) ? 'YouTube' : 'Enlace'), dias, activa, fadeIn, cronObj });
        });
        rawAnuncios.forEach(a => {
            const dias = Array.isArray(a.dias) && a.dias.length > 0 ? a.dias : DIAS_TODOS;
            const activa = a.activa !== undefined ? a.activa : true;
            const cronObj = crearAnuncioCron(a.hora, a.minuto, a.texto, dias, activa);
            state.anunciosProgramados.push({ id: a.id, hora: a.hora, minuto: a.minuto, texto: a.texto, dias, activa, cronObj });
        });
        registrarEvento(null, '🚀 Servidor iniciado y horarios programados.', 'info');
    }

    return { 
        iniciarFadeInVolumen, ejecutarCrossfadeSalida, obtenerMetadatosRuta, actualizarMetadatosPendientes, getActiveDevice, emitirDispositivos,
        reproducirRutaYoutube, iniciarServiciosSpotify, intentarAutoLogin, crearTareaCron, crearAnuncioCron, inicializarCronGuardados
    };
};