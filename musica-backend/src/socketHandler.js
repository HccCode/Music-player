const { state, guardarConfig, serializarTareas, guardarTareas, serializarAnuncios, guardarAnuncios, guardarHistorial, DIAS_TODOS, DEFAULT_IMG, registrarEvento } = require('./dataManager');
const utils = require('./utils');

module.exports = function(io, spotifyApi, engine) {
    io.on('connection', (socket) => {
        socket.emit('tareas_actualizadas', serializarTareas());
        socket.emit('anuncios_actualizados', serializarAnuncios());
        socket.emit('caja_negra_actualizada', state.cajaNegra);
        socket.emit('configuracion_actual', {
            clientId: state.appConfig.clientId, clientSecret: state.appConfig.clientSecret, preferredDeviceId: state.appConfig.preferredDeviceId || '',
            vozActivada: Boolean(state.appConfig.vozActivada), vozTexto: state.appConfig.vozTexto || '', vozVolumen: state.appConfig.vozVolumen ?? 50,
            vozNombre: state.appConfig.vozNombre || '', lucesActivadas: Boolean(state.appConfig.lucesActivadas), lucesWebhook: state.appConfig.lucesWebhook || '',
            tuyaId: state.appConfig.tuyaId || '', tuyaKey: state.appConfig.tuyaKey || ''
        });
        socket.emit('historial_actualizado', state.historial);
        socket.emit('estado_sesion', { autenticado: state.runtime.sesionActiva, accessToken: spotifyApi.getAccessToken() || '' });
        socket.emit('info_red', { ipLocal: utils.obtenerIpLocal() });
        engine.emitirDispositivos();

        socket.on('limpiar_caja_negra', () => {
            state.cajaNegra = [];
            io.emit('caja_negra_actualizada', state.cajaNegra);
        });

        socket.on('sincronizar_luces', (rgb) => {
            if (!state.appConfig.lucesActivadas || !state.appConfig.lucesWebhook) return;
            try {
                const data = JSON.stringify(rgb);
                const { URL } = require('url');
                const target = new URL(state.appConfig.lucesWebhook);
                const lib = target.protocol === 'https:' ? require('https') : require('http');
                const req = lib.request(target, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } });
                req.on('error', () => {}); req.write(data); req.end();
            } catch(e) {}
        });

        socket.on('youtube_progreso_sync', (datos) => {
            if (!state.estadoYoutube.enUso) return;
            if (datos.activo !== undefined) state.estadoYoutube.activo = datos.activo;
            if (datos.progreso !== undefined) state.estadoYoutube.progreso = datos.progreso;
            if (datos.duracion !== undefined) state.estadoYoutube.duracion = datos.duracion;
            if (datos.volumen !== undefined) state.estadoYoutube.volumen = datos.volumen;
            io.emit('estado_reproduccion', { ...state.estadoYoutube, esYoutube: true });
        });

        socket.on('duck_audio_inicio', async (opciones) => {
            if (state.estadoYoutube.enUso) io.emit('youtube_comando', { accion: 'volume', valor: 10 });
            if (!spotifyApi.getAccessToken()) return;
            try {
                if (state.runtime.fadeInterval) { clearInterval(state.runtime.fadeInterval); state.runtime.fadeInterval = null; }
                const estado = await spotifyApi.getMyCurrentPlaybackState();
                const device = await engine.getActiveDevice();
                if (!device) return;
                if (!opciones?.esAlarmaMusical) {
                    const volActual = estado.body?.device?.volume_percent;
                    if (typeof volActual === 'number' && volActual > 10) state.runtime.volumenPrevioDucking = volActual;
                    else if (state.runtime.volumenPrevioDucking === null) state.runtime.volumenPrevioDucking = 80;
                }
                await spotifyApi.setVolume(10, { device_id: device.id });
            } catch (e) {}
        });

        socket.on('duck_audio_fin', async (opciones) => {
            if (state.estadoYoutube.enUso) {
                if (opciones?.fadeInAlTerminar) io.emit('youtube_comando', { accion: 'fade_in', volFinal: 80, duracionSegundos: 25 });
                else io.emit('youtube_comando', { accion: 'volume', valor: state.estadoYoutube.volumen > 10 ? state.estadoYoutube.volumen : 80 });
            }
            if (!spotifyApi.getAccessToken()) return;
            try {
                const device = await engine.getActiveDevice();
                if (!device) return;
                if (opciones?.esAlarmaMusical) {
                    if (opciones?.fadeInAlTerminar) engine.iniciarFadeInVolumen(device.id, 10, 80, 25, 6);
                    else await spotifyApi.setVolume(80, { device_id: device.id });
                } else if (state.runtime.volumenPrevioDucking !== null) {
                    await spotifyApi.setVolume(state.runtime.volumenPrevioDucking, { device_id: device.id });
                    state.runtime.volumenPrevioDucking = null;
                }
            } catch (e) {}
        });

        socket.on('programar_anuncio', (data) => {
            const dias = Array.isArray(data.dias) && data.dias.length > 0 ? data.dias : DIAS_TODOS;
            const cronObj = engine.crearAnuncioCron(data.hora, data.minuto, data.texto, dias, true);
            state.anunciosProgramados.push({ id: Date.now(), hora: data.hora, minuto: data.minuto, texto: data.texto, dias, activa: true, cronObj });
            guardarAnuncios(); io.emit('anuncios_actualizados', serializarAnuncios());
            registrarEvento(io, `Nuevo anuncio programado: "${data.texto}" a las ${data.hora}:${data.minuto}`, 'info');
        });

        socket.on('toggle_anuncio', (id) => {
            const index = state.anunciosProgramados.findIndex(a => String(a.id) === String(id));
            if (index !== -1) {
                const anuncio = state.anunciosProgramados[index];
                anuncio.activa = !anuncio.activa;
                if (anuncio.activa) anuncio.cronObj.start(); else anuncio.cronObj.stop();
                guardarAnuncios(); io.emit('anuncios_actualizados', serializarAnuncios());
                registrarEvento(io, `Anuncio ${anuncio.activa ? 'activado' : 'desactivado'}: "${anuncio.texto}"`, 'info');
            }
        });

        socket.on('editar_anuncio', (data) => {
            const index = state.anunciosProgramados.findIndex(a => String(a.id) === String(data.id));
            if (index !== -1) {
                const anuncio = state.anunciosProgramados[index];
                anuncio.cronObj.stop();
                if (data.nuevaHora !== undefined) anuncio.hora = data.nuevaHora;
                if (data.nuevoMinuto !== undefined) anuncio.minuto = data.nuevoMinuto;
                if (data.nuevoTexto !== undefined) anuncio.texto = data.nuevoTexto;
                if (Array.isArray(data.nuevosDias) && data.nuevosDias.length > 0) anuncio.dias = data.nuevosDias;
                anuncio.cronObj = engine.crearAnuncioCron(anuncio.hora, anuncio.minuto, anuncio.texto, anuncio.dias, anuncio.activa);
                guardarAnuncios(); io.emit('anuncios_actualizados', serializarAnuncios());
            }
        });

        socket.on('eliminar_anuncio', (id) => {
            const index = state.anunciosProgramados.findIndex(a => String(a.id) === String(id));
            if (index !== -1) {
                state.anunciosProgramados[index].cronObj.stop();
                state.anunciosProgramados.splice(index, 1);
                guardarAnuncios(); io.emit('anuncios_actualizados', serializarAnuncios());
            }
        });

        socket.on('forzar_reconexion', async (cb) => {
            const ok = await engine.intentarAutoLogin();
            if (typeof cb === 'function') cb(ok);
        });

        socket.on('reproducir_item_directo', async (rutaOriginal) => {
            registrarEvento(io, `▶️ Iniciada reproducción manual.`, 'info');
            const ytId = utils.parseYoutubeId(rutaOriginal);
            if (ytId) { await engine.reproducirRutaYoutube(rutaOriginal, false, false); return; }

            if (state.estadoYoutube.enUso) {
                state.estadoYoutube.enUso = false; state.estadoYoutube.activo = false;
                io.emit('youtube_comando', { accion: 'fade_out_stop' });
                await utils.esperar(1800);
            }

            if (!spotifyApi.getAccessToken()) return;
            try {
                const uriSpotify = utils.parseSpotifyUri(rutaOriginal);
                const device = await engine.getActiveDevice();
                if (!device) return;

                let infoCrossfade = { estabaSonando: false, volOriginal: 80 };
                if (!device.is_active) {
                    await spotifyApi.transferMyPlayback([device.id]);
                    await utils.esperar(1500);
                } else {
                    infoCrossfade = await engine.ejecutarCrossfadeSalida(device.id);
                }

                const opcionesPlay = { device_id: device.id };
                if (uriSpotify.includes('track')) opcionesPlay.uris = [uriSpotify];
                else opcionesPlay.context_uri = uriSpotify;

                await spotifyApi.play(opcionesPlay);
                if (infoCrossfade.estabaSonando) engine.iniciarFadeInVolumen(device.id, 10, infoCrossfade.volOriginal, 3, 4);
            } catch (e) {}
        });

        socket.on('solicitar_token_sdk', async (callback) => {
            if (!spotifyApi.getAccessToken() && state.appConfig.refreshToken) await engine.intentarAutoLogin();
            if (typeof callback === 'function') callback(spotifyApi.getAccessToken() || '');
        });

        socket.on('web_player_listo', async () => { await utils.esperar(800); await engine.emitirDispositivos(); });

        socket.on('guardar_locutor', (datosVoz) => {
            if (datosVoz.vozActivada !== undefined) state.appConfig.vozActivada = Boolean(datosVoz.vozActivada);
            if (datosVoz.vozTexto !== undefined) state.appConfig.vozTexto = datosVoz.vozTexto;
            if (datosVoz.vozVolumen !== undefined) state.appConfig.vozVolumen = Number(datosVoz.vozVolumen);
            if (datosVoz.vozNombre !== undefined) state.appConfig.vozNombre = datosVoz.vozNombre;
            guardarConfig();
            io.emit('locutor_guardado_ok', { vozActivada: state.appConfig.vozActivada, vozTexto: state.appConfig.vozTexto, vozVolumen: state.appConfig.vozVolumen, vozNombre: state.appConfig.vozNombre });
        });

        socket.on('guardar_luces', (datos) => {
            if (datos.lucesActivadas !== undefined) state.appConfig.lucesActivadas = Boolean(datos.lucesActivadas);
            if (datos.lucesWebhook !== undefined) state.appConfig.lucesWebhook = datos.lucesWebhook;
            if (datos.tuyaId !== undefined) state.appConfig.tuyaId = datos.tuyaId.trim();
            if (datos.tuyaKey !== undefined) state.appConfig.tuyaKey = datos.tuyaKey.trim();
            guardarConfig();
            registrarEvento(io, `💡 Ajustes de luces ${state.appConfig.lucesActivadas ? 'activados' : 'desactivados'} actualizados.`, 'info');
        });

        socket.on('guardar_configuracion', (nuevosDatos) => {
            const nuevoId = (nuevosDatos.clientId || '').trim();
            const nuevoSecret = (nuevosDatos.clientSecret || '').trim();
            if (!nuevoId || !nuevoSecret) return;

            const cambio = state.appConfig.clientId !== nuevoId || state.appConfig.clientSecret !== nuevoSecret;
            state.appConfig.clientId = nuevoId; state.appConfig.clientSecret = nuevoSecret;

            if (cambio) {
                state.appConfig.refreshToken = ''; state.runtime.sesionActiva = false;
                io.emit('estado_sesion', { autenticado: false, accessToken: '' });
            }
            guardarConfig();
            spotifyApi.setClientId(state.appConfig.clientId);
            spotifyApi.setClientSecret(state.appConfig.clientSecret);
            socket.emit('configuracion_guardada');
        });

        socket.on('obtener_dispositivos', async () => await engine.emitirDispositivos());

        socket.on('seleccionar_dispositivo', async (deviceId) => {
            state.appConfig.preferredDeviceId = deviceId || '';
            guardarConfig();
            if (deviceId && spotifyApi.getAccessToken()) { try { await spotifyApi.transferMyPlayback([deviceId]); } catch (e) {} }
            await engine.emitirDispositivos();
        });

        socket.on('control_play', async () => { 
            if (state.estadoYoutube.enUso) { state.estadoYoutube.activo = true; io.emit('youtube_comando', { accion: 'play' }); return; }
            if (!spotifyApi.getAccessToken()) return;
            try { const device = await engine.getActiveDevice(); if (device) { if (!device.is_active) { await spotifyApi.transferMyPlayback([device.id]); await utils.esperar(1500); } await spotifyApi.play({ device_id: device.id }); } } catch(e){} 
        });

        socket.on('control_pausa', async () => { 
            if (state.estadoYoutube.enUso) { state.estadoYoutube.activo = false; io.emit('youtube_comando', { accion: 'pause' }); return; }
            if (!spotifyApi.getAccessToken()) return;
            if (state.runtime.fadeInterval) { clearInterval(state.runtime.fadeInterval); state.runtime.fadeInterval = null; }
            try { const device = await engine.getActiveDevice(); if(device) await spotifyApi.pause({ device_id: device.id }); } catch(e){} 
        });

        socket.on('control_siguiente', async () => { 
            if (state.estadoYoutube.enUso) { io.emit('youtube_comando', { accion: 'seek_relative', deltaMs: 15000 }); return; }
            if (!spotifyApi.getAccessToken()) return;
            try { const device = await engine.getActiveDevice(); if(device) await spotifyApi.skipToNext({ device_id: device.id }); } catch(e){} 
        });

        socket.on('control_anterior', async () => { 
            if (state.estadoYoutube.enUso) { io.emit('youtube_comando', { accion: 'seek', posicionMs: 0 }); return; }
            if (!spotifyApi.getAccessToken()) return;
            try { const device = await engine.getActiveDevice(); if(device) await spotifyApi.skipToPrevious({ device_id: device.id }); } catch(e){} 
        });

        socket.on('control_seek', async (posicionMs) => {
            if (state.estadoYoutube.enUso) { state.estadoYoutube.progreso = Math.floor(posicionMs); io.emit('youtube_comando', { accion: 'seek', posicionMs: Math.floor(posicionMs) }); return; }
            if (!spotifyApi.getAccessToken()) return;
            try { const device = await engine.getActiveDevice(); if (device) await spotifyApi.seek(Math.floor(posicionMs), { device_id: device.id }); } catch(e) {}
        });

        socket.on('control_volumen', async (nuevoVolumen) => {
            const volSeguro = Math.max(0, Math.min(100, Math.round(nuevoVolumen)));
            if (state.estadoYoutube.enUso) { state.estadoYoutube.volumen = volSeguro; io.emit('youtube_comando', { accion: 'volume', valor: volSeguro }); return; }
            if (!spotifyApi.getAccessToken()) return;
            if (state.runtime.fadeInterval) { clearInterval(state.runtime.fadeInterval); state.runtime.fadeInterval = null; }
            try { const device = await engine.getActiveDevice(); if (device) await spotifyApi.setVolume(volSeguro, { device_id: device.id }); } catch(e) {}
        });

        socket.on('reproducir_ahora', async (data) => {
            registrarEvento(io, `▶️ Reproducción manual iniciada desde la cola.`, 'info');
            if (data?.youtubeUrl) { await engine.reproducirRutaYoutube(data.youtubeUrl, false, false); return; }

            if (state.estadoYoutube.enUso) {
                state.estadoYoutube.enUso = false; state.estadoYoutube.activo = false;
                io.emit('youtube_comando', { accion: 'fade_out_stop' });
                await utils.esperar(1800);
            }

            if (!spotifyApi.getAccessToken()) return;
            try {
                const device = await engine.getActiveDevice();
                if (!device) return;

                let infoCrossfade = { estabaSonando: false, volOriginal: 80 };
                if (!device.is_active) { await spotifyApi.transferMyPlayback([device.id]); await utils.esperar(1500); } 
                else { infoCrossfade = await engine.ejecutarCrossfadeSalida(device.id); }

                await spotifyApi.play({ device_id: device.id, uris: data.uris, offset: { position: data.offset } });
                if (infoCrossfade.estabaSonando) engine.iniciarFadeInVolumen(device.id, 10, infoCrossfade.volOriginal, 3, 4);
            } catch(e) {}
        });

        socket.on('obtener_playlist', async (rutaOriginal) => {
            const ytId = utils.parseYoutubeId(rutaOriginal);
            if (ytId) {
                const meta = await engine.obtenerMetadatosRuta(rutaOriginal);
                socket.emit('lista_canciones_resultado', [{ numero: 1, nombre: meta.nombre, artista: meta.subtitulo, youtubeUrl: rutaOriginal }]);
                return;
            }
            if (!spotifyApi.getAccessToken()) return socket.emit('lista_canciones_resultado', ['⚠️ Inicia sesión primero.']);
            try {
                const uri = utils.parseSpotifyUri(rutaOriginal);
                if (uri.includes('playlist')) {
                    const data = await spotifyApi.getPlaylistTracks(uri.split(':')[2]);
                    socket.emit('lista_canciones_resultado', data.body.items.map((item, index) => ({ numero: index + 1, nombre: item.track.name, artista: item.track.artists[0].name, uri: item.track.uri })));
                } else if (uri.includes('track')) {
                    const data = await spotifyApi.getTrack(uri.split(':')[2]);
                    socket.emit('lista_canciones_resultado', [{ numero: 1, nombre: data.body.name, artista: data.body.artists[0].name, uri: data.body.uri }]);
                } else if (uri.includes('album')) {
                    const data = await spotifyApi.getAlbumTracks(uri.split(':')[2]);
                    socket.emit('lista_canciones_resultado', data.body.items.map((item, index) => ({ numero: index + 1, nombre: item.name, artista: item.artists[0].name, uri: item.uri })));
                } else { socket.emit('lista_canciones_resultado', ['Formato no reconocido.']); }
            } catch (error) { socket.emit('lista_canciones_resultado', ['Error al cargar la info.']); }
        });

        socket.on('programar_musica', async (data) => {
            const dias = Array.isArray(data.dias) && data.dias.length > 0 ? data.dias : DIAS_TODOS;
            const meta = await engine.obtenerMetadatosRuta(data.ruta);
            const cronObj = engine.crearTareaCron(data.hora, data.minuto, data.ruta, dias, true, Boolean(data.fadeIn));
            
            state.tareasProgramadas.push({ id: Date.now(), hora: data.hora, minuto: data.minuto, ruta: data.ruta, nombre: meta.nombre, subtitulo: meta.subtitulo, imagen: meta.imagen, tipo: meta.tipo, dias, activa: true, fadeIn: Boolean(data.fadeIn), cronObj });
            guardarTareas();

            registrarEvento(io, `Nueva alarma musical programada a las ${data.hora}:${data.minuto} -> ${meta.nombre}`, 'info');

            const indexHist = state.historial.findIndex(h => h.ruta === data.ruta);
            if (indexHist === -1) state.historial.unshift(meta); else state.historial[indexHist] = meta;
            guardarHistorial();
            
            io.emit('historial_actualizado', state.historial);
            io.emit('tareas_actualizadas', serializarTareas());
        });

        socket.on('toggle_tarea', (id) => {
            const index = state.tareasProgramadas.findIndex(t => String(t.id) === String(id));
            if (index !== -1) {
                const tarea = state.tareasProgramadas[index];
                tarea.activa = !tarea.activa;
                if (tarea.activa) tarea.cronObj.start(); else tarea.cronObj.stop();
                guardarTareas(); io.emit('tareas_actualizadas', serializarTareas());
                registrarEvento(io, `Alarma musical ${tarea.activa ? 'activada' : 'desactivada'}: ${tarea.nombre}`, 'info');
            }
        });

        socket.on('editar_tarea', (data) => {
            const index = state.tareasProgramadas.findIndex(t => String(t.id) === String(data.id));
            if (index !== -1) {
                const tarea = state.tareasProgramadas[index];
                tarea.cronObj.stop();
                if (data.nuevaHora !== undefined) tarea.hora = data.nuevaHora;
                if (data.nuevoMinuto !== undefined) tarea.minuto = data.nuevoMinuto;
                if (Array.isArray(data.nuevosDias) && data.nuevosDias.length > 0) tarea.dias = data.nuevosDias;
                if (data.nuevoFadeIn !== undefined) tarea.fadeIn = Boolean(data.nuevoFadeIn);
                tarea.cronObj = engine.crearTareaCron(tarea.hora, tarea.minuto, tarea.ruta, tarea.dias, tarea.activa, tarea.fadeIn);
                guardarTareas(); io.emit('tareas_actualizadas', serializarTareas());
            }
        });

        socket.on('eliminar_historial', (rutaEliminar) => {
            state.historial = state.historial.filter(h => h.ruta !== rutaEliminar);
            guardarHistorial(); io.emit('historial_actualizado', state.historial);
        });

        socket.on('cancelar_tarea', (id) => {
            const index = state.tareasProgramadas.findIndex(t => String(t.id) === String(id));
            if (index !== -1) {
                state.tareasProgramadas[index].cronObj.stop();
                state.tareasProgramadas.splice(index, 1);
                guardarTareas(); io.emit('tareas_actualizadas', serializarTareas());
            }
        });

        socket.on('importar_backup', async (backupData) => {
            try {
                if (Array.isArray(backupData.tareas)) {
                    state.tareasProgramadas.forEach(t => t.cronObj.stop());
                    state.tareasProgramadas = [];
                    backupData.tareas.forEach(t => {
                        if (!t.hora || !t.minuto || !t.ruta) return;
                        const dias = Array.isArray(t.dias) && t.dias.length > 0 ? t.dias : DIAS_TODOS;
                        const activa = t.activa !== undefined ? t.activa : true;
                        const cronObj = engine.crearTareaCron(t.hora, t.minuto, t.ruta, dias, activa, Boolean(t.fadeIn));
                        state.tareasProgramadas.push({ id: t.id || Date.now() + Math.floor(Math.random() * 10000), hora: t.hora, minuto: t.minuto, ruta: t.ruta, nombre: t.nombre || t.ruta, subtitulo: t.subtitulo || 'Spotify', imagen: t.imagen || DEFAULT_IMG, tipo: t.tipo || (utils.parseYoutubeId(t.ruta) ? 'YouTube' : 'Enlace'), dias, activa, fadeIn: Boolean(t.fadeIn), cronObj });
                    });
                    guardarTareas(); io.emit('tareas_actualizadas', serializarTareas());
                }

                if (Array.isArray(backupData.anuncios)) {
                    state.anunciosProgramados.forEach(a => a.cronObj.stop());
                    state.anunciosProgramados = [];
                    backupData.anuncios.forEach(a => {
                        if (!a.hora || !a.minuto || !a.texto) return;
                        const dias = Array.isArray(a.dias) && a.dias.length > 0 ? a.dias : DIAS_TODOS;
                        const activa = a.activa !== undefined ? a.activa : true;
                        const cronObj = engine.crearAnuncioCron(a.hora, a.minuto, a.texto, dias, activa);
                        state.anunciosProgramados.push({ id: a.id || Date.now() + Math.floor(Math.random() * 10000), hora: a.hora, minuto: a.minuto, texto: a.texto, dias, activa, cronObj });
                    });
                    guardarAnuncios(); io.emit('anuncios_actualizados', serializarAnuncios());
                }

                if (Array.isArray(backupData.historial)) {
                    state.historial = backupData.historial.map(item => typeof item === 'string' ? { ruta: item, nombre: item, subtitulo: 'Enlace guardado', imagen: DEFAULT_IMG, tipo: 'Enlace' } : item);
                    guardarHistorial(); io.emit('historial_actualizado', state.historial);
                }

                await engine.actualizarMetadatosPendientes();
                socket.emit('backup_importado_ok');
                registrarEvento(io, '💾 Archivo de copia de seguridad importado correctamente.', 'success');
            } catch (e) {}
        });
    });
};