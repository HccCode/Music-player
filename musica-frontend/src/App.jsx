import React, { useState, useEffect, useRef } from 'react';
import io from 'socket.io-client';
import './App.css';

// Conecta automáticamente a localhost en PC o a la IP Wi-Fi cuando entras desde el celular
const BACKEND_URL = `http://${window.location.hostname}:3001`;
const socket = io(BACKEND_URL);

const DIAS_SEMANA = [
  { id: 1, label: 'L', nombre: 'Lunes' },
  { id: 2, label: 'M', nombre: 'Martes' },
  { id: 3, label: 'X', nombre: 'Miércoles' },
  { id: 4, label: 'J', nombre: 'Jueves' },
  { id: 5, label: 'V', nombre: 'Viernes' },
  { id: 6, label: 'S', nombre: 'Sábado' },
  { id: 0, label: 'D', nombre: 'Domingo' }
];

const formatTime = (ms) => {
  if (!ms) return '0:00';
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
};

const obtenerProximaAlarma = (tareas, ahora) => {
  const activas = tareas.filter(t => t.activa !== false);
  if (activas.length === 0) return null;

  let menorDiffMs = Infinity;
  let tareaMasProxima = null;

  activas.forEach(tarea => {
    const h = parseInt(tarea.hora, 10);
    const m = parseInt(tarea.minuto, 10);
    if (isNaN(h) || isNaN(m)) return;

    const diasValidos = Array.isArray(tarea.dias) && tarea.dias.length > 0
      ? tarea.dias
      : [1, 2, 3, 4, 5, 6, 0];

    for (let offset = 0; offset <= 7; offset++) {
      const candidato = new Date(ahora);
      candidato.setDate(ahora.getDate() + offset);
      candidato.setHours(h, m, 0, 0);

      if (candidato <= ahora) continue;

      if (diasValidos.includes(candidato.getDay())) {
        const diff = candidato - ahora;
        if (diff < menorDiffMs) {
          menorDiffMs = diff;
          tareaMasProxima = tarea;
        }
        break;
      }
    }
  });

  if (!tareaMasProxima || menorDiffMs === Infinity) return null;

  const totalSeconds = Math.floor(menorDiffMs / 1000);
  const dias = Math.floor(totalSeconds / 86400);
  const horas = Math.floor((totalSeconds % 86400) / 3600);
  const minutos = Math.floor((totalSeconds % 3600) / 60);
  const segundos = totalSeconds % 60;

  let partes = [];
  if (dias > 0) partes.push(`${dias}d`);
  if (horas > 0) partes.push(`${horas}h`);
  if (minutos > 0) partes.push(`${minutos}m`);
  if (dias === 0 && horas === 0 && minutos === 0) {
    partes.push(`${segundos}s`);
  }

  return {
    nombre: tareaMasProxima.nombre || tareaMasProxima.ruta,
    horaStr: `${tareaMasProxima.hora.toString().padStart(2, '0')}:${tareaMasProxima.minuto.toString().padStart(2, '0')}`,
    tiempoRestante: partes.join(' ')
  };
};

function App() {
  const [vistaActiva, setVistaActiva] = useState('inicio'); 
  const [esMovil, setEsMovil] = useState(window.innerWidth <= 850);
  const [reconectandoMovil, setReconectandoMovil] = useState(false);

  const [tareas, setTareas] = useState([]);
  const [historial, setHistorial] = useState([]);
  const [sesionAutenticada, setSesionAutenticada] = useState(false);
  const [spotifyToken, setSpotifyToken] = useState('');
  
  // Estados del Reproductor Web Integrado (SDK)
  const [sdkListo, setSdkListo] = useState(false);
  const [webPlayerId, setWebPlayerId] = useState('');
  const [audioDesbloqueado, setAudioDesbloqueado] = useState(false);
  const [errorSdk, setErrorSdk] = useState('');
  const playerRef = useRef(null);

  // Estados para Control Remoto Móvil (QR)
  const [ipLocal, setIpLocal] = useState('');
  const [mostrarModalQr, setMostrarModalQr] = useState(false);

  const [ahora, setAhora] = useState(new Date());

  const [hora, setHora] = useState('');
  const [ruta, setRuta] = useState('');
  const [diasSeleccionados, setDiasSeleccionados] = useState([1, 2, 3, 4, 5, 6, 0]);
  const [fadeIn, setFadeIn] = useState(false);
  const [cola, setCola] = useState([]);
  
  const [dispositivos, setDispositivos] = useState([]);
  const [dispositivoPreferido, setDispositivoPreferido] = useState('');

  // Estados de Edición
  const [editandoId, setEditandoId] = useState(null);
  const [editHora, setEditHora] = useState('');
  const [editDias, setEditDias] = useState([]);
  const [editFadeIn, setEditFadeIn] = useState(false);

  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');

  const [reproduccion, setReproduccion] = useState({ 
    activo: false, cancion: 'Esperando música...', artista: 'Spotify API', 
    imagen: 'https://i.scdn.co/image/ab6761610000e5eb55d39ab9c21d506aa52f7021',
    progreso: 0, duracion: 0
  });

  const [colorAmbiente, setColorAmbiente] = useState('28, 45, 90');

  const [progresoLocal, setProgresoLocal] = useState(0);
  const [volumen, setVolumen] = useState(80);
  const [volumenPrevio, setVolumenPrevio] = useState(80);
  const cambiandoVolumenRef = useRef(false);
  const fileInputRef = useRef(null);

  // Detectar si estamos en celular o PC
  useEffect(() => {
    const handleResize = () => setEsMovil(window.innerWidth <= 850);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    const timerReloj = setInterval(() => {
      setAhora(new Date());
    }, 1000);
    return () => clearInterval(timerReloj);
  }, []);

  useEffect(() => {
    socket.on('tareas_actualizadas', (data) => setTareas(data));
    socket.on('historial_actualizado', (data) => setHistorial(data));
    socket.on('info_red', (data) => {
      if (data?.ipLocal) setIpLocal(data.ipLocal);
    });
    socket.on('estado_sesion', (data) => {
      setSesionAutenticada(Boolean(data?.autenticado));
      if (data?.accessToken) {
        setSpotifyToken(data.accessToken);
      }
    });
    
    socket.on('estado_reproduccion', (data) => {
      setReproduccion(prevState => ({ ...prevState, ...data }));
      if (data.progreso !== undefined) {
        setProgresoLocal(data.progreso);
      }
      if (data.volumen !== undefined && !cambiandoVolumenRef.current) {
        setVolumen(data.volumen);
      }
    });
    socket.on('lista_canciones_resultado', (data) => setCola(data));
    socket.on('configuracion_actual', (data) => {
      setClientId(data.clientId); 
      setClientSecret(data.clientSecret);
      if (data.preferredDeviceId !== undefined) {
        setDispositivoPreferido(data.preferredDeviceId);
      }
    });
    socket.on('dispositivos_actualizados', (data) => {
      setDispositivos(data.dispositivos || []);
      if (data.preferredDeviceId !== undefined) {
        setDispositivoPreferido(data.preferredDeviceId);
      }
    });
    socket.on('configuracion_guardada', () => {
      alert('¡Configuración guardada! Renueva la sesión de Spotify.');
      window.open('http://127.0.0.1:3001/login', '_blank');
      setVistaActiva('inicio');
    });
    socket.on('backup_importado_ok', () => {
      alert('✅ ¡Copia de seguridad restaurada exitosamente!');
    });

    return () => {
      socket.off('tareas_actualizadas'); socket.off('estado_reproduccion');
      socket.off('lista_canciones_resultado'); socket.off('configuracion_actual');
      socket.off('configuracion_guardada'); socket.off('historial_actualizado');
      socket.off('dispositivos_actualizados'); socket.off('backup_importado_ok');
      socket.off('estado_sesion'); socket.off('info_red');
    };
  }, []);

  // Inicializar Spotify Web Playback SDK de forma segura (solo en contexto seguro/PC)
  useEffect(() => {
    // El SDK de Spotify exige HTTPS o localhost/127.0.0.1 (window.isSecureContext)
    if (esMovil || !spotifyToken || !window.isSecureContext) return;
    if (playerRef.current) return;

    const inicializarReproductor = () => {
      if (!window.Spotify || playerRef.current) return;

      const player = new window.Spotify.Player({
        name: '🎧 Mi Panel Musical (Web)',
        getOAuthToken: (cb) => {
          socket.emit('solicitar_token_sdk', (tokenFresco) => {
            cb(tokenFresco || spotifyToken);
          });
        },
        volume: 0.8
      });

      player.addListener('ready', ({ device_id }) => {
        setSdkListo(true);
        setWebPlayerId(device_id);
        setErrorSdk('');
        socket.emit('web_player_listo', device_id);
      });

      player.addListener('not_ready', () => {
        setSdkListo(false);
      });

      player.addListener('initialization_error', ({ message }) => {
        console.warn('SDK Init:', message);
        setErrorSdk('Activa "Contenido protegido" en tu navegador');
      });

      player.addListener('authentication_error', () => {
        setErrorSdk('Haz clic en "Cambiar / Reconectar" para actualizar permisos');
      });

      player.addListener('account_error', () => {
        setErrorSdk('Se requiere Spotify Premium para el Web Player');
      });

      player.addListener('player_state_changed', (state) => {
        if (!state) return;
        const currentTrack = state.track_window?.current_track;
        if (currentTrack) {
          setReproduccion(prev => ({
            ...prev,
            activo: !state.paused,
            cancion: currentTrack.name,
            artista: currentTrack.artists.map(a => a.name).join(', '),
            imagen: currentTrack.album.images[0]?.url || prev.imagen,
            progreso: state.position,
            duracion: state.duration
          }));
          setProgresoLocal(state.position);
        }
      });

      player.connect();
      playerRef.current = player;
    };

    if (window.Spotify) {
      inicializarReproductor();
    } else {
      window.onSpotifyWebPlaybackSDKReady = inicializarReproductor;
      if (!document.getElementById('spotify-player-sdk')) {
        const script = document.createElement('script');
        script.id = 'spotify-player-sdk';
        script.src = 'https://sdk.scdn.co/spotify-player.js';
        script.async = true;
        document.body.appendChild(script);
      }
    }

    return () => {
      if (playerRef.current) {
        playerRef.current.disconnect();
        playerRef.current = null;
      }
    };
  }, [spotifyToken, esMovil]);

  // Extraer el color dominante cada vez que cambia la imagen de la canción
  useEffect(() => {
    if (!reproduccion.imagen) return;
    const img = new Image();
    img.crossOrigin = 'Anonymous';
    img.src = reproduccion.imagen;

    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        canvas.width = 24;
        canvas.height = 24;
        ctx.drawImage(img, 0, 0, 24, 24);
        const data = ctx.getImageData(0, 0, 24, 24).data;

        let r = 0, g = 0, b = 0, count = 0;
        for (let i = 0; i < data.length; i += 4) {
          const pr = data[i];
          const pg = data[i + 1];
          const pb = data[i + 2];
          const luma = (pr + pg + pb) / 3;
          if (luma > 22 && luma < 235) {
            r += pr;
            g += pg;
            b += pb;
            count++;
          }
        }

        if (count > 0) {
          r = Math.round(r / count);
          g = Math.round(g / count);
          b = Math.round(b / count);
          const boost = 1.15;
          r = Math.min(230, Math.max(25, Math.round(r * boost)));
          g = Math.min(230, Math.max(25, Math.round(g * boost)));
          b = Math.min(230, Math.max(25, Math.round(b * boost)));
          setColorAmbiente(`${r}, ${g}, ${b}`);
        }
      } catch (e) {}
    };
  }, [reproduccion.imagen]);

  useEffect(() => {
    let intervalo;
    if (reproduccion.activo) {
      intervalo = setInterval(() => {
        setProgresoLocal(prev => prev + 1000 > reproduccion.duracion ? reproduccion.duracion : prev + 1000);
      }, 1000);
    }
    return () => clearInterval(intervalo);
  }, [reproduccion.activo, reproduccion.duracion]);

  const activarAudioNavegador = () => {
    if (playerRef.current && playerRef.current.activateElement) {
      playerRef.current.activateElement();
    }
    setAudioDesbloqueado(true);
    if (webPlayerId) {
      setDispositivoPreferido(webPlayerId);
      socket.emit('seleccionar_dispositivo', webPlayerId);
    }
  };

  // Botón de reconexión desde el móvil
  const handleReconectarMovil = () => {
    setReconectandoMovil(true);
    socket.emit('forzar_reconexion', (ok) => {
      setReconectandoMovil(false);
      if (!ok) {
        window.open(`${BACKEND_URL}/login`, '_blank');
      }
    });
  };

  const toggleDiaFormulario = (diaId) => {
    setDiasSeleccionados(prev => {
      if (prev.includes(diaId)) {
        if (prev.length === 1) return prev;
        return prev.filter(d => d !== diaId);
      }
      return [...prev, diaId];
    });
  };

  const toggleDiaEdicion = (diaId) => {
    setEditDias(prev => {
      if (prev.includes(diaId)) {
        if (prev.length === 1) return prev;
        return prev.filter(d => d !== diaId);
      }
      return [...prev, diaId];
    });
  };

  const handleProgramar = (e) => {
    e.preventDefault();
    if (!hora || !ruta) return alert('Completa la hora y el enlace.');
    const [h, m] = hora.split(':');
    socket.emit('programar_musica', { 
      hora: h, 
      minuto: m, 
      ruta, 
      dias: diasSeleccionados, 
      fadeIn
    });
    socket.emit('obtener_playlist', ruta);
    setHora(''); setRuta('');
  };

  const handleGuardarConfig = (e) => {
    e.preventDefault();
    if (!clientId || !clientSecret) return;
    socket.emit('guardar_configuracion', { clientId, clientSecret });
  };

  const cargarListaManual = (rutaLista) => socket.emit('obtener_playlist', rutaLista);
  
  const reusarRuta = (rutaExistente) => { 
    setRuta(rutaExistente); 
    setVistaActiva('inicio');
  };

  const eliminarDelHistorial = (rutaEliminar) => {
    socket.emit('eliminar_historial', rutaEliminar);
  };

  const reproducirCancionDeLista = (index) => {
    if (playerRef.current && playerRef.current.activateElement) {
      playerRef.current.activateElement();
      setAudioDesbloqueado(true);
    }
    const uris = cola.slice(0, 80).map(t => t.uri).filter(u => u);
    if (uris.length > 0) socket.emit('reproducir_ahora', { uris, offset: index >= 80 ? 0 : index });
  };

  const iniciarEdicion = (tarea) => {
    setEditandoId(tarea.id);
    setEditHora(`${tarea.hora.toString().padStart(2, '0')}:${tarea.minuto.toString().padStart(2, '0')}`);
    setEditDias(Array.isArray(tarea.dias) && tarea.dias.length > 0 ? tarea.dias : [1, 2, 3, 4, 5, 6, 0]);
    setEditFadeIn(Boolean(tarea.fadeIn));
  };

  const guardarEdicion = (id) => {
    if (!editHora) return;
    const [h, m] = editHora.split(':');
    socket.emit('editar_tarea', { 
      id, 
      nuevaHora: h, 
      nuevoMinuto: m, 
      nuevosDias: editDias, 
      nuevoFadeIn: editFadeIn
    });
    setEditandoId(null);
  };

  const exportarBackup = () => {
    const backup = {
      fechaExportacion: new Date().toISOString(),
      tareas,
      historial
    };
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `spotify-scheduler-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const importarBackupArchivo = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const contenido = JSON.parse(ev.target.result);
        if (!contenido.tareas && !contenido.historial) {
          return alert('⚠️ El archivo seleccionado no tiene un formato de backup válido.');
        }
        socket.emit('importar_backup', contenido);
      } catch (err) {
        alert('❌ Error al leer el archivo JSON.');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleSeek = (e) => {
    if (!reproduccion.duracion) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const porcentaje = Math.max(0, Math.min(1, clickX / rect.width));
    const nuevoTiempoMs = Math.floor(porcentaje * reproduccion.duracion);
    
    setProgresoLocal(nuevoTiempoMs);
    socket.emit('control_seek', nuevoTiempoMs);
  };

  const handleVolumenChange = (e) => {
    const nuevoVol = Number(e.target.value);
    cambiandoVolumenRef.current = true;
    setVolumen(nuevoVol);
    if (playerRef.current && dispositivoPreferido === webPlayerId) {
      playerRef.current.setVolume(nuevoVol / 100).catch(() => {});
    }
    socket.emit('control_volumen', nuevoVol);
    setTimeout(() => {
      cambiandoVolumenRef.current = false;
    }, 1200);
  };

  const toggleMute = () => {
    if (volumen > 0) {
      setVolumenPrevio(volumen);
      setVolumen(0);
      socket.emit('control_volumen', 0);
    } else {
      const restaurar = volumenPrevio > 0 ? volumenPrevio : 70;
      setVolumen(restaurar);
      socket.emit('control_volumen', restaurar);
    }
  };

  const handleCambiarDispositivo = (e) => {
    const nuevoId = e.target.value;
    if (nuevoId === webPlayerId && playerRef.current?.activateElement) {
      playerRef.current.activateElement();
      setAudioDesbloqueado(true);
    }
    setDispositivoPreferido(nuevoId);
    socket.emit('seleccionar_dispositivo', nuevoId);
  };

  const porcentajeProgreso = reproduccion.duracion ? (progresoLocal / reproduccion.duracion) * 100 : 0;
  const proximaAlarma = obtenerProximaAlarma(tareas, ahora);
  const horaFormateadaReloj = ahora.toLocaleTimeString('es-MX', { hour12: false });

  const puertoFrontend = window.location.port || '5173';
  const urlRemotaMovil = `http://${ipLocal || window.location.hostname}:${puertoFrontend}`;
  const qrImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&margin=10&data=${encodeURIComponent(urlRemotaMovil)}`;

  // =========================================================================
  // VISTA SIMPLIFICADA EXCLUSIVA PARA MÓVIL
  // (1. Qué suena, 2. Reconexión, 3. Próxima canción/lista, 4. Historial)
  // =========================================================================
  if (esMovil) {
    return (
      <div className="mobile-simple-app" style={{ '--ambient-rgb': colorAmbiente }}>
        
        {/* 1. CABECERA COMPACTA + BOTÓN DE RECONEXIÓN */}
        <header className="mobile-top-bar">
          <div className="mobile-status-badge">
            <span className="auth-dot" style={{ backgroundColor: sesionAutenticada ? '#1ed760' : '#f59e0b' }}></span>
            <span>{sesionAutenticada ? 'Spotify Conectado' : 'Sin Sesión'}</span>
          </div>
          <button 
            type="button" 
            className="mobile-reconnect-btn" 
            onClick={handleReconectarMovil}
          >
            {reconectandoMovil ? '⏳ Conectando...' : '🔄 Reconectar'}
          </button>
        </header>

        {/* 2. PÍLDORA DE PRÓXIMA CANCIÓN O LISTA */}
        <div className={`mobile-next-pill ${proximaAlarma ? 'active' : ''}`}>
          {proximaAlarma ? (
            <>
              <span className="bell-pulse">🔔</span>
              <span className="next-label">Próxima:</span>
              <strong className="mobile-next-name">{proximaAlarma.nombre}</strong>
              <span className="next-time-badge">
                {proximaAlarma.horaStr} (en {proximaAlarma.tiempoRestante})
              </span>
            </>
          ) : (
            <span className="next-empty">🔕 Sin alarmas activas programadas</span>
          )}
        </div>

        {/* 3. TARJETA DE MÚSICA SONANDO ACTUALMENTE */}
        <section className="mobile-now-playing-card">
          <img src={reproduccion.imagen} alt="Portada" className="mobile-cover" />
          <div className="mobile-track-meta">
            <h2>{reproduccion.cancion}</h2>
            <p>{reproduccion.artista}</p>
          </div>

          <div className="progress-bar-container mobile-progress">
            <span className="time-text">{formatTime(progresoLocal)}</span>
            <div className="progress-bg clickable" onClick={handleSeek}>
              <div className="progress-fill" style={{ width: `${porcentajeProgreso}%` }}>
                <span className="progress-thumb"></span>
              </div>
            </div>
            <span className="time-text">{formatTime(reproduccion.duracion)}</span>
          </div>

          <div className="mobile-controls-row">
            <button className="ctrl-btn" onClick={() => socket.emit('control_anterior')}>⏮</button>
            {reproduccion.activo ? (
              <button className="play-btn mobile-play-big" onClick={() => socket.emit('control_pausa')}>⏸</button>
            ) : (
              <button className="play-btn mobile-play-big" onClick={() => socket.emit('control_play')}>▶</button>
            )}
            <button className="ctrl-btn" onClick={() => socket.emit('control_siguiente')}>⏭</button>
          </div>

          <div className="mobile-volume-row">
            <button className="vol-btn" onClick={toggleMute}>
              {volumen === 0 ? '🔇' : volumen < 50 ? '🔉' : '🔊'}
            </button>
            <input 
              type="range" 
              min="0" 
              max="100" 
              value={volumen} 
              onChange={handleVolumenChange} 
              className="volume-slider mobile-vol-slider"
              style={{ background: `linear-gradient(90deg, #1ed760 ${volumen}%, rgba(255,255,255,0.16) ${volumen}%)` }}
            />
            <span className="vol-percent">{volumen}%</span>
          </div>
        </section>

        {/* 4. HISTORIAL DE CANCIONES Y LISTAS */}
        <section className="mobile-history-section">
          <h3 className="mobile-section-title">🕒 Historial ({historial.length})</h3>
          <div className="mobile-history-list">
            {historial.length === 0 ? (
              <p className="empty-text">No hay elementos en el historial.</p>
            ) : (
              historial.map((item, idx) => {
                const obj = typeof item === 'string' 
                  ? { ruta: item, nombre: item, subtitulo: 'Enlace guardado', imagen: 'https://i.scdn.co/image/ab6761610000e5eb55d39ab9c21d506aa52f7021', tipo: 'Enlace' } 
                  : item;
                return (
                  <div className="mobile-history-item" key={idx}>
                    <img src={obj.imagen} alt="Cover" className="mobile-hist-thumb" />
                    <div className="mobile-hist-info">
                      <span className="mobile-hist-name">{obj.nombre}</span>
                      <span className="mobile-hist-sub">{obj.tipo || 'Spotify'} • {obj.subtitulo}</span>
                    </div>
                    <button 
                      type="button" 
                      className="mobile-hist-play-btn" 
                      onClick={() => socket.emit('reproducir_item_directo', obj.ruta)}
                      title="Reproducir ahora"
                    >
                      ▶
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </section>
      </div>
    );
  }

  // =========================================================================
  // VISTA COMPLETA DE ESCRITORIO (PC)
  // =========================================================================
  return (
    <div 
      className="modern-spotify-layout" 
      style={{ '--ambient-rgb': colorAmbiente }}
    >
      {mostrarModalQr && (
        <div className="qr-modal-overlay" onClick={() => setMostrarModalQr(false)}>
          <div className="qr-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="qr-modal-header">
              <h3>📱 Control Remoto en tu Celular</h3>
              <button className="qr-close-btn" onClick={() => setMostrarModalQr(false)}>✖️</button>
            </div>
            <p className="qr-modal-desc">
              Asegúrate de que tu celular esté conectado a la <strong>misma red Wi-Fi</strong> y escanea este código con tu cámara:
            </p>
            <div className="qr-image-wrapper">
              <img src={qrImageUrl} alt="Código QR de Red Local" className="qr-code-img" />
            </div>
            <div className="qr-url-box">
              <span>{urlRemotaMovil}</span>
            </div>
            <p className="qr-modal-hint">
              💡 Al abrirlo en el celular verás automáticamente la interfaz móvil simplificada.
            </p>
          </div>
        </div>
      )}

      <div className="top-panels">
        
        <aside className="panel left-panel">
          <div className="nav-container">
            <div className={`nav-item ${vistaActiva === 'inicio' ? 'active' : ''}`} onClick={() => setVistaActiva('inicio')}>
              <span className="icon">🏠</span><span>Inicio</span>
            </div>
            <div className={`nav-item ${vistaActiva === 'configuracion' ? 'active' : ''}`} onClick={() => setVistaActiva('configuracion')}>
              <span className="icon">⚙️</span><span>Configuración</span>
            </div>
          </div>
          <div className="library-container">
            <div className={`nav-item library-header ${vistaActiva === 'historial' ? 'active' : ''}`} onClick={() => setVistaActiva('historial')}>
              <span className="icon">🕒</span><span>Historial</span>
            </div>
            <div className="auth-box">
               <div className="auth-status-row">
                 <span className="auth-dot" style={{ backgroundColor: sesionAutenticada ? '#1ed760' : '#f59e0b' }}></span>
                 <p>{sesionAutenticada ? 'Sesión Activa (Auto-Login)' : 'Sesión Pendiente'}</p>
               </div>
               <a href="http://127.0.0.1:3001/login" target="_blank" rel="noreferrer" className="pill-btn">
                 {sesionAutenticada ? 'Cambiar / Reconectar' : 'Iniciar Sesión'}
               </a>
            </div>
          </div>
        </aside>

        <main className="panel center-panel">
          <header className="center-header">
            <div className="header-live-info">
              <div className="live-clock-pill" title="Hora actual del sistema">
                <span className="clock-icon">🕒</span>
                <span className="clock-digits">{horaFormateadaReloj}</span>
              </div>

              <div className={`next-alarm-banner ${proximaAlarma ? 'active' : ''}`}>
                {proximaAlarma ? (
                  <>
                    <span className="bell-pulse">🔔</span>
                    <span className="next-label">Próxima:</span>
                    <strong className="next-song-name">{proximaAlarma.nombre}</strong>
                    <span className="next-time-badge">
                      {proximaAlarma.horaStr} (en {proximaAlarma.tiempoRestante})
                    </span>
                  </>
                ) : (
                  <span className="next-empty">🔕 Sin alarmas activas programadas</span>
                )}
              </div>
            </div>

            <div className="header-right-tools">
              <button 
                type="button" 
                className="qr-trigger-btn" 
                onClick={() => setMostrarModalQr(true)}
                title="Abrir código QR para controlar desde el celular"
              >
                📱 Control Móvil
              </button>

              {errorSdk ? (
                <a href="http://127.0.0.1:3001/login" target="_blank" rel="noreferrer" className="sdk-badge warning" title="Haz clic para actualizar los permisos del Web Player">
                  ⚠️ {errorSdk}
                </a>
              ) : sdkListo ? (
                <button 
                  type="button" 
                  className={`sdk-badge ${audioDesbloqueado ? 'ready' : 'action'}`}
                  onClick={activarAudioNavegador}
                  title="Haz clic para usar este navegador como altavoz principal de Spotify"
                >
                  {audioDesbloqueado ? '🎧 Web Player Activo' : '🔊 Activar Audio aquí'}
                </button>
              ) : (
                sesionAutenticada && window.isSecureContext && (
                  <span className="sdk-badge loading">⏳ Conectando Web Player...</span>
                )
              )}
              <div className="header-profile"><span>H</span></div>
            </div>
          </header>

          <div className="center-content">
            
            {vistaActiva === 'inicio' && (
              <>
                <h1 className="main-title">Panel de Control Musical</h1>
                <div className="glass-card fixed-top-card">
                  <h2>Programar Reproducción</h2>
                  <form className="schedule-form-container" onSubmit={handleProgramar}>
                    <div className="schedule-form">
                      <div className="input-group">
                        <label>Hora</label>
                        <input type="time" value={hora} onChange={(e) => setHora(e.target.value)} required />
                      </div>
                      <div className="input-group stretch">
                        <label>URI o Enlace</label>
                        <input type="text" placeholder="Pega el enlace de tu canción, álbum o playlist..." value={ruta} onChange={(e) => setRuta(e.target.value)} required />
                      </div>
                      <button type="submit" className="green-btn">Programar</button>
                    </div>

                    <div className="days-selector-bar">
                      <div className="days-left-group">
                        <span className="days-label">Repetir los días:</span>
                        <div className="days-pills">
                          {DIAS_SEMANA.map((d) => (
                            <button
                              type="button"
                              key={d.id}
                              title={d.nombre}
                              className={`day-btn ${diasSeleccionados.includes(d.id) ? 'selected' : ''}`}
                              onClick={() => toggleDiaFormulario(d.id)}
                            >
                              {d.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      <label className={`fade-toggle-pill ${fadeIn ? 'active' : ''}`} title="Inicia al 10% de volumen y sube gradualmente hasta 80% en 30 segundos">
                        <input 
                          type="checkbox" 
                          checked={fadeIn} 
                          onChange={(e) => setFadeIn(e.target.checked)} 
                        />
                        <span>📈 Subir volumen gradualmente (Fade-In)</span>
                      </label>
                    </div>
                  </form>
                </div>

                <h2 className="section-title">Horarios Activos ({tareas.length})</h2>

                <div className="tasks-container scrollable-tasks">
                  {tareas.length === 0 ? (
                    <p className="empty-text">No hay reproducciones automáticas pendientes.</p>
                  ) : (
                    tareas.map((tarea) => {
                      const activa = tarea.activa !== undefined ? tarea.activa : true;
                      const diasTarea = Array.isArray(tarea.dias) && tarea.dias.length > 0 ? tarea.dias : [1, 2, 3, 4, 5, 6, 0];

                      return (
                        <div className={`task-row ${!activa ? 'task-disabled' : ''}`} key={tarea.id}>
                          
                          <label className="switch" title={activa ? 'Alarma activa (clic para pausar)' : 'Alarma pausada (clic para activar)'}>
                            <input 
                              type="checkbox" 
                              checked={activa} 
                              onChange={() => socket.emit('toggle_tarea', tarea.id)} 
                            />
                            <span className="slider"></span>
                          </label>

                          {editandoId === tarea.id ? (
                            <div className="task-edit-mode">
                              <input type="time" value={editHora} onChange={(e) => setEditHora(e.target.value)} className="edit-time-input"/>
                              <div className="edit-days-pills">
                                {DIAS_SEMANA.map((d) => (
                                  <button
                                    type="button"
                                    key={d.id}
                                    className={`day-btn mini ${editDias.includes(d.id) ? 'selected' : ''}`}
                                    onClick={() => toggleDiaEdicion(d.id)}
                                  >
                                    {d.label}
                                  </button>
                                ))}
                              </div>
                              <button
                                type="button"
                                className={`fade-mini-btn ${editFadeIn ? 'selected' : ''}`}
                                onClick={() => setEditFadeIn(!editFadeIn)}
                                title="Activar/Desactivar Fade-In gradual"
                              >
                                📈 Fade-In
                              </button>
                              <button type="button" className="outline-btn safe" onClick={() => guardarEdicion(tarea.id)}>✔️ Guardar</button>
                              <button type="button" className="outline-btn danger" onClick={() => setEditandoId(null)}>✖️</button>
                            </div>
                          ) : (
                            <>
                              <div className="task-time-block" onDoubleClick={() => iniciarEdicion(tarea)} title="Doble clic para editar">
                                <div className="task-time">
                                  {tarea.hora.toString().padStart(2, '0')}:{tarea.minuto.toString().padStart(2, '0')}
                                </div>
                                <div className="task-days-mini">
                                  {DIAS_SEMANA.map(d => (
                                    <span key={d.id} className={`mini-day-dot ${diasTarea.includes(d.id) ? 'on' : ''}`}>
                                      {d.label}
                                    </span>
                                  ))}
                                </div>
                              </div>

                              <div className="task-media" title={tarea.ruta}>
                                <img src={tarea.imagen} alt="Cover" className="task-thumb" />
                                <div className="task-meta">
                                  <div className="task-title-row">
                                    <span className="media-badge">{tarea.tipo || 'Spotify'}</span>
                                    {tarea.fadeIn && <span className="fade-badge" title="Subida de volumen gradual activa">📈 Fade-In</span>}
                                    <span className="task-name">{tarea.nombre || tarea.ruta}</span>
                                  </div>
                                  <span className="task-sub">{tarea.subtitulo || tarea.ruta}</span>
                                </div>
                              </div>

                              <div className="task-actions">
                                <button className="outline-btn" onClick={() => iniciarEdicion(tarea)} title="Editar Hora y Días">✏️</button>
                                <button className="outline-btn" onClick={() => cargarListaManual(tarea.ruta)}>Ver Pista</button>
                                <button className="outline-btn danger" onClick={() => socket.emit('cancelar_tarea', tarea.id)}>Cancelar</button>
                              </div>
                            </>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              </>
            )}

            {vistaActiva === 'historial' && (
              <>
                <h1 className="main-title">Historial</h1>
                <div className="glass-card history-full-card">
                  <h2>Canciones y Listas Guardadas</h2>
                  <div className="tasks-container scrollable-tasks">
                    {historial.length === 0 ? (
                      <p className="empty-text">Aún no hay canciones o listas en tu historial.</p>
                    ) : (
                      historial.map((item, idx) => {
                        const obj = typeof item === 'string' 
                          ? { ruta: item, nombre: item, subtitulo: 'Enlace guardado', imagen: 'https://i.scdn.co/image/ab6761610000e5eb55d39ab9c21d506aa52f7021', tipo: 'Enlace' } 
                          : item;
                        return (
                          <div className="task-row" key={idx}>
                            <div className="task-media" title={obj.ruta}>
                              <img src={obj.imagen} alt="Cover" className="task-thumb" />
                              <div className="task-meta">
                                <div className="task-title-row">
                                  <span className="media-badge">{obj.tipo || 'Spotify'}</span>
                                  <span className="task-name">{obj.nombre}</span>
                                </div>
                                <span className="task-sub">{obj.subtitulo}</span>
                              </div>
                            </div>
                            <div className="task-actions">
                              <button className="outline-btn" onClick={() => cargarListaManual(obj.ruta)}>Ver Pista</button>
                              <button className="outline-btn" onClick={() => reusarRuta(obj.ruta)}>Volver a agregar</button>
                              <button className="outline-btn danger" onClick={() => eliminarDelHistorial(obj.ruta)} title="Eliminar del historial">🗑️</button>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              </>
            )}

            {vistaActiva === 'configuracion' && (
              <div className="config-scroll-wrapper">
                <h1 className="main-title">Configuración y Respaldo</h1>
                <div className="glass-card">
                  <h2>Credenciales de Spotify</h2>
                  <form className="config-form" onSubmit={handleGuardarConfig}>
                    <div className="input-group stretch"><label>Client ID</label><input type="text" value={clientId} onChange={(e) => setClientId(e.target.value)} required /></div>
                    <div className="input-group stretch" style={{marginTop:'20px'}}><label>Client Secret</label><input type="password" value={clientSecret} onChange={(e) => setClientSecret(e.target.value)} required /></div>
                    <div style={{marginTop:'30px'}}><button type="submit" className="green-btn">Guardar Credenciales</button></div>
                  </form>
                </div>

                <div className="glass-card">
                  <h2>Copia de Seguridad (Horarios e Historial)</h2>
                  <p className="config-desc">
                    Descarga un archivo de respaldo con todos tus horarios programados e historial de canciones, o restaura una copia guardada anteriormente.
                  </p>
                  <div className="backup-actions-row">
                    <button type="button" className="green-btn" onClick={exportarBackup}>
                      💾 Descargar Backup (.json)
                    </button>
                    <button 
                      type="button" 
                      className="outline-btn backup-upload-btn" 
                      onClick={() => fileInputRef.current?.click()}
                    >
                      📂 Importar Backup (.json)
                    </button>
                    <input 
                      type="file" 
                      accept=".json" 
                      ref={fileInputRef} 
                      onChange={importarBackupArchivo} 
                      style={{ display: 'none' }} 
                    />
                  </div>
                </div>
              </div>
            )}

          </div>
        </main>

        <aside className="panel right-panel">
          <div className="right-panel-header"><h3>{reproduccion.cancion}</h3></div>
          <div className="now-playing-large">
            <img src={reproduccion.imagen} alt="Portada" className="large-cover" />
            <div className="large-info"><h2>{reproduccion.cancion}</h2><p>{reproduccion.artista}</p></div>
          </div>
          <div className="queue-container">
            <div className="queue-header"><h4>Siguiente en la lista</h4></div>
            {cola.length === 0 ? <p className="empty-queue">Carga una playlist.</p> : typeof cola[0] === 'string' ? <p className="empty-queue">{cola[0]}</p> : (
              <ul className="queue-list">
                {cola.map((track, index) => (
                  <li key={index} className="queue-item" onDoubleClick={() => reproducirCancionDeLista(index)}>
                    <div className="queue-track-info">
                      <span className="queue-icon">🎵</span>
                      <div className="queue-text-block">
                        <span className="queue-track-name">{track.nombre}</span><span className="queue-track-artist">{track.artista}</span>
                      </div>
                    </div>
                    {track.uri && <button className="queue-play-btn" onClick={(e) => { e.stopPropagation(); reproducirCancionDeLista(index); }}>▶</button>}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </aside>
      </div>

      <footer className="bottom-player">
        <div className="player-left">
          {reproduccion.imagen && <img src={reproduccion.imagen} alt="Cover" />}
          <div className="player-track-info"><span className="name">{reproduccion.cancion}</span><span className="artist">{reproduccion.artista}</span></div>
        </div>

        <div className="player-center">
          <div className="player-controls">
            <button className="ctrl-btn" onClick={() => socket.emit('control_anterior')}>⏮</button>
            {reproduccion.activo ? (
              <button className="play-btn" onClick={() => socket.emit('control_pausa')}>⏸</button>
            ) : (
              <button className="play-btn" onClick={() => { activarAudioNavegador(); socket.emit('control_play'); }}>▶</button>
            )}
            <button className="ctrl-btn" onClick={() => socket.emit('control_siguiente')}>⏭</button>
          </div>
          
          <div className="progress-bar-container">
            <span className="time-text">{formatTime(progresoLocal)}</span>
            <div className="progress-bg clickable" onClick={handleSeek} title="Haz clic para adelantar o retroceder">
              <div className="progress-fill" style={{ width: `${porcentajeProgreso}%` }}>
                <span className="progress-thumb"></span>
              </div>
            </div>
            <span className="time-text">{formatTime(reproduccion.duracion)}</span>
          </div>
        </div>

        <div className="player-right">
          <div className="device-selector-group">
            <select 
              className="device-select" 
              value={dispositivoPreferido} 
              onChange={handleCambiarDispositivo}
              title="Seleccionar dispositivo de salida"
            >
              <option value="">💻 Auto (Panel Web / Activo)</option>
              {dispositivos.map(d => (
                <option key={d.id} value={d.id}>
                  {d.is_active ? '🟢 ' : '⚪ '}{d.name}
                </option>
              ))}
            </select>
            <button 
              className="device-refresh-btn" 
              onClick={() => socket.emit('obtener_dispositivos')}
              title="Actualizar lista de dispositivos"
            >
              🔄
            </button>
          </div>

          <div className="volume-control">
            <button className="vol-btn" onClick={toggleMute} title={volumen === 0 ? 'Activar sonido' : 'Silenciar'}>
              {volumen === 0 ? '🔇' : volumen < 50 ? '🔉' : '🔊'}
            </button>
            <input 
              type="range" 
              min="0" 
              max="100" 
              value={volumen} 
              onChange={handleVolumenChange} 
              className="volume-slider"
              style={{ background: `linear-gradient(90deg, #1ed760 ${volumen}%, rgba(255,255,255,0.16) ${volumen}%)` }}
              title={`Volumen: ${volumen}%`}
            />
            <span className="vol-percent">{volumen}%</span>
          </div>

          <span className="status-indicator">
            <span className="dot" style={{backgroundColor: reproduccion.activo ? '#1DB954' : '#535353'}}></span>
            {reproduccion.activo ? 'Online' : 'Pausado'}
          </span>
        </div>
      </footer>
    </div>
  );
}

export default App;