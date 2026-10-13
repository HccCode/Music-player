const fs = require('fs');
const path = require('path');

const configPath = path.join(__dirname, '../config.json');
const tareasPath = path.join(__dirname, '../tareas.json');
const historialPath = path.join(__dirname, '../historial.json'); 
const anunciosPath = path.join(__dirname, '../anuncios.json');

const DEFAULT_IMG = 'https://i.scdn.co/image/ab6761610000e5eb55d39ab9c21d506aa52f7021';
const DIAS_TODOS = [1, 2, 3, 4, 5, 6, 0];

// Memoria central compartida entre todos los módulos
const state = {
    appConfig: { 
        clientId: '1f6b538e02e94badaf70e028df6b0f56', 
        clientSecret: '46f576c4e34a4609b1e94ac63672c4e1',
        preferredDeviceId: '', refreshToken: '', vozActivada: false,
        vozTexto: '¡Es hora de despertar y comenzar con energía!',
        vozVolumen: 50, vozNombre: '', lucesActivadas: false, lucesWebhook: '',
        tuyaId: '', tuyaKey: ''
    },
    historial: [],
    tareasProgramadas: [],
    anunciosProgramados: [],
    cajaNegra: [],
    estadoYoutube: { enUso: false, activo: false, videoId: '', cancion: '', artista: 'YouTube', imagen: DEFAULT_IMG, progreso: 0, duracion: 0, volumen: 80 },
    runtime: { fadeInterval: null, monitorReproduccion: null, tokenRefreshInterval: null, sesionActiva: false, volumenPrevioDucking: null }
};

if (fs.existsSync(configPath)) { try { state.appConfig = { ...state.appConfig, ...JSON.parse(fs.readFileSync(configPath, 'utf8')) }; } catch (e) {} } else { fs.writeFileSync(configPath, JSON.stringify(state.appConfig, null, 4)); }
if (fs.existsSync(historialPath)) { try { state.historial = JSON.parse(fs.readFileSync(historialPath, 'utf8')).map(item => typeof item === 'string' ? { ruta: item, nombre: item, subtitulo: 'Enlace guardado', imagen: DEFAULT_IMG, tipo: 'Enlace' } : item); } catch (e) {} }

let rawTareas = [];
if (fs.existsSync(tareasPath)) { try { rawTareas = JSON.parse(fs.readFileSync(tareasPath, 'utf8')); } catch(e){} }

let rawAnuncios = [];
if (fs.existsSync(anunciosPath)) { try { rawAnuncios = JSON.parse(fs.readFileSync(anunciosPath, 'utf8')); } catch(e){} }

function guardarConfig() { fs.writeFileSync(configPath, JSON.stringify(state.appConfig, null, 4)); }
function guardarHistorial() { fs.writeFileSync(historialPath, JSON.stringify(state.historial, null, 4)); }

function serializarTareas() {
    return state.tareasProgramadas.map(t => ({
        id: t.id, hora: t.hora, minuto: t.minuto, ruta: t.ruta, 
        nombre: t.nombre || t.ruta, subtitulo: t.subtitulo || 'Spotify', 
        imagen: t.imagen || DEFAULT_IMG, tipo: t.tipo || 'Enlace',
        dias: Array.isArray(t.dias) && t.dias.length > 0 ? t.dias : DIAS_TODOS,
        activa: t.activa !== undefined ? t.activa : true, fadeIn: Boolean(t.fadeIn)
    }));
}
function guardarTareas() { fs.writeFileSync(tareasPath, JSON.stringify(serializarTareas(), null, 4)); }

function serializarAnuncios() {
    return state.anunciosProgramados.map(a => ({
        id: a.id, hora: a.hora, minuto: a.minuto, texto: a.texto,
        dias: Array.isArray(a.dias) && a.dias.length > 0 ? a.dias : DIAS_TODOS,
        activa: a.activa !== undefined ? a.activa : true
    }));
}
function guardarAnuncios() { fs.writeFileSync(anunciosPath, JSON.stringify(serializarAnuncios(), null, 4)); }

function registrarEvento(io, evento, tipo = 'info') {
    const now = new Date();
    const log = {
        id: Date.now() + Math.random(),
        fecha: now.toLocaleDateString('es-MX'),
        hora: now.toLocaleTimeString('es-MX', { hour12: false }),
        evento,
        tipo
    };
    state.cajaNegra.unshift(log);
    if (state.cajaNegra.length > 200) state.cajaNegra.pop();
    if (io) io.emit('caja_negra_actualizada', state.cajaNegra);
    console.log(`[${log.hora}] [${tipo.toUpperCase()}] ${evento}`);
}

module.exports = { 
    state, DEFAULT_IMG, DIAS_TODOS, 
    guardarConfig, guardarHistorial, serializarTareas, guardarTareas, serializarAnuncios, guardarAnuncios,
    rawTareas, rawAnuncios, registrarEvento
};