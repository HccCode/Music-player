import React, { useState, useEffect, useRef } from 'react';
import io from 'socket.io-client';
import './App.css';

import { obtenerProximaAlarma, ejecutarLocutorConClima } from './utils/helpers';
import KioskOverlay from './components/KioskOverlay';
import QrModal from './components/QrModal';
import MobileView from './components/MobileView';
import SidebarLeft from './components/SidebarLeft';
import RightPanel from './components/RightPanel';
import BottomPlayer from './components/BottomPlayer';
import InicioView from './components/views/InicioView';
import HistorialView from './components/views/HistorialView';
import ConfiguracionView from './components/views/ConfiguracionView';

const BACKEND_URL = `http://${window.location.hostname}:3001`;
const socket = io(BACKEND_URL);

function App() {
  const [vistaActiva, setVistaActiva] = useState('inicio'); 
  const [esMovil, setEsMovil] = useState(window.innerWidth <= 850);
  const [reconectandoMovil, setReconectandoMovil] = useState(false);

  const [modoKiosco, setModoKiosco] = useState(false);
  const [mostrarControlesKiosco, setMostrarControlesKiosco] = useState(true);

  const [tareas, setTareas] = useState([]);
  const [anuncios, setAnuncios] = useState([]);
  const [historial, setHistorial] = useState([]);
  const [sesionAutenticada, setSesionAutenticada] = useState(false);
  const [spotifyToken, setSpotifyToken] = useState('');
  
  const [sdkListo, setSdkListo] = useState(false);
  const [webPlayerId, setWebPlayerId] = useState('');
  const [audioDesbloqueado, setAudioDesbloqueado] = useState(false);
  const [errorSdk, setErrorSdk] = useState('');
  const playerRef = useRef(null);

  const [ipLocal, setIpLocal] = useState('');
  const [mostrarModalQr, setMostrarModalQr] = useState(false);

  const [ahora, setAhora] = useState(new Date());
  const [ruta, setRuta] = useState('');
  const [cola, setCola] = useState([]);
  
  const [dispositivos, setDispositivos] = useState([]);
  const [dispositivoPreferido, setDispositivoPreferido] = useState('');

  // Configuración y Locutor
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [vozActivada, setVozActivada] = useState(false);
  const [vozTexto, setVozTexto] = useState('');
  const [vozVolumen, setVozVolumen] = useState(50);
  const [vozNombre, setVozNombre] = useState('');
  const [vocesDisponibles, setVocesDisponibles] = useState([]);
  const [mensajeGuardadoVoz, setMensajeGuardadoVoz] = useState(false);

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
  const vozVolumenRef = useRef(50);
  const vozNombreRef = useRef('');

  useEffect(() => { vozVolumenRef.current = vozVolumen; }, [vozVolumen]);
  useEffect(() => { vozNombreRef.current = vozNombre; }, [vozNombre]);

  // Cargar voces disponibles en el navegador
  useEffect(() => {
    if (!('speechSynthesis' in window)) return;
    const cargarListaVoces = () => {
      const lista = window.speechSynthesis.getVoices() || [];
      if (lista.length === 0) return;
      const ordenadas = [...lista].sort((a, b) => {
        const aEs = a.lang.toLowerCase().startsWith('es') ? 0 : 1;
        const bEs = b.lang.toLowerCase().startsWith('es') ? 0 : 1;
        if (aEs !== bEs) return aEs - bEs;
        return a.name.localeCompare(b.name);
      });
      setVocesDisponibles(ordenadas);
    };
    cargarListaVoces();
    window.speechSynthesis.onvoiceschanged = cargarListaVoces;
  }, []);

  useEffect(() => {
    const handleResize = () => setEsMovil(window.innerWidth <= 850);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    const timerReloj = setInterval(() => setAhora(new Date()), 1000);
    return () => clearInterval(timerReloj);
  }, []);

  useEffect(() => {
    const handleKeyDown = (e) => { if (e.key === 'Escape') cerrarKiosco(); };
    const handleFullScreenChange = () => { if (!document.fullscreenElement) setModoKiosco(false); };
    window.addEventListener('keydown', handleKeyDown);
    document.addEventListener('fullscreenchange', handleFullScreenChange);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('fullscreenchange', handleFullScreenChange);
    };
  }, []);

  useEffect(() => {
    if (!modoKiosco) return;
    let timeout;
    const onMouseMove = () => {
      setMostrarControlesKiosco(true);
      clearTimeout(timeout);
      timeout = setTimeout(() => setMostrarControlesKiosco(false), 3000);
    };
    window.addEventListener('mousemove', onMouseMove);
    timeout = setTimeout(() => setMostrarControlesKiosco(false), 3000);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      clearTimeout(timeout);
    };
  }, [modoKiosco]);

  const hablarConClima = (textoPersonalizado, opciones = {}) => {
    ejecutarLocutorConClima({
      textoPersonalizado,
      opciones,
      socket,
      playerRef,
      vozVolumenDefault: vozVolumenRef.current,
      vozNombreDefault: vozNombreRef.current
    });
  };

  useEffect(() => {
    socket.on('tareas_actualizadas', (data) => setTareas(data));
    socket.on('anuncios_actualizados', (data) => setAnuncios(data));
    socket.on('historial_actualizado', (data) => setHistorial(data));
    socket.on('info_red', (data) => { if (data?.ipLocal) setIpLocal(data.ipLocal); });
    socket.on('estado_sesion', (data) => {
      setSesionAutenticada(Boolean(data?.autenticado));
      if (data?.accessToken) setSpotifyToken(data.accessToken);
    });
    socket.on('estado_reproduccion', (data) => {
      setReproduccion(prev => ({ ...prev, ...data }));
      if (data.progreso !== undefined) setProgresoLocal(data.progreso);
      if (data.volumen !== undefined && !cambiandoVolumenRef.current) setVolumen(data.volumen);
    });
    socket.on('lista_canciones_resultado', (data) => setCola(data));
    socket.on('configuracion_actual', (data) => {
      setClientId(data.clientId || ''); 
      setClientSecret(data.clientSecret || '');
      setVozActivada(Boolean(data.vozActivada));
      setVozTexto(data.vozTexto || '');
      if (data.vozVolumen !== undefined) setVozVolumen(Number(data.vozVolumen));
      if (data.vozNombre !== undefined) setVozNombre(data.vozNombre || '');
      if (data.preferredDeviceId !== undefined) setDispositivoPreferido(data.preferredDeviceId);
    });
    socket.on('dispositivos_actualizados', (data) => {
      setDispositivos(data.dispositivos || []);
      if (data.preferredDeviceId !== undefined) setDispositivoPreferido(data.preferredDeviceId);
    });
    socket.on('locutor_guardado_ok', (data) => {
      setVozActivada(Boolean(data.vozActivada));
      setVozTexto(data.vozTexto || '');
      if (data.vozVolumen !== undefined) setVozVolumen(Number(data.vozVolumen));
      if (data.vozNombre !== undefined) setVozNombre(data.vozNombre || '');
      setMensajeGuardadoVoz(true);
      setTimeout(() => setMensajeGuardadoVoz(false), 2500);
    });
    socket.on('configuracion_guardada', () => {
      alert('¡Credenciales guardadas! Renueva la sesión de Spotify.');
      window.open('http://127.0.0.1:3001/login', '_blank');
      setVistaActiva('inicio');
    });
    socket.on('backup_importado_ok', () => {
      alert('✅ ¡Copia de seguridad restaurada exitosamente!');
    });
    socket.on('hablar_tts', (data) => {
      hablarConClima(data?.textoAdicional || '', {
        volumenVoz: data?.volumenVoz,
        vozNombre: data?.vozNombre,
        esAlarmaMusical: data?.esAlarmaMusical,
        fadeInAlTerminar: data?.fadeInAlTerminar
      });
    });

    return () => {
      socket.off('tareas_actualizadas'); socket.off('anuncios_actualizados');
      socket.off('estado_reproduccion'); socket.off('lista_canciones_resultado');
      socket.off('configuracion_actual'); socket.off('configuracion_guardada');
      socket.off('locutor_guardado_ok'); socket.off('historial_actualizado');
      socket.off('dispositivos_actualizados'); socket.off('backup_importado_ok');
      socket.off('estado_sesion'); socket.off('info_red'); socket.off('hablar_tts');
    };
  }, []);

  // Web Playback SDK
  useEffect(() => {
    if (esMovil || !spotifyToken || !window.isSecureContext || playerRef.current) return;

    const inicializarReproductor = () => {
      if (!window.Spotify || playerRef.current) return;
      const player = new window.Spotify.Player({
        name: '🎧 Mi Panel Musical (Web)',
        getOAuthToken: (cb) => {
          socket.emit('solicitar_token_sdk', (tokenFresco) => cb(tokenFresco || spotifyToken));
        },
        volume: 0.8
      });

      player.addListener('ready', ({ device_id }) => {
        setSdkListo(true);
        setWebPlayerId(device_id);
        setErrorSdk('');
        socket.emit('web_player_listo', device_id);
      });
      player.addListener('not_ready', () => setSdkListo(false));
      player.addListener('initialization_error', () => setErrorSdk('Activa "Contenido protegido" en tu navegador'));
      player.addListener('authentication_error', () => setErrorSdk('Haz clic en "Cambiar / Reconectar"'));
      player.addListener('account_error', () => setErrorSdk('Se requiere Spotify Premium para el Web Player'));
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

  // Color camaleón según la portada
  useEffect(() => {
    if (!reproduccion.imagen) return;
    const img = new Image();
    img.crossOrigin = 'Anonymous';
    img.src = reproduccion.imagen;
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        canvas.width = 24; canvas.height = 24;
        ctx.drawImage(img, 0, 0, 24, 24);
        const data = ctx.getImageData(0, 0, 24, 24).data;
        let r = 0, g = 0, b = 0, count = 0;
        for (let i = 0; i < data.length; i += 4) {
          const luma = (data[i] + data[i + 1] + data[i + 2]) / 3;
          if (luma > 22 && luma < 235) {
            r += data[i]; g += data[i + 1]; b += data[i + 2]; count++;
          }
        }
        if (count > 0) {
          const boost = 1.15;
          r = Math.min(230, Math.max(25, Math.round((r / count) * boost)));
          g = Math.min(230, Math.max(25, Math.round((g / count) * boost)));
          b = Math.min(230, Math.max(25, Math.round((b / count) * boost)));
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

  const abrirKiosco = () => {
    setModoKiosco(true);
    if (document.documentElement.requestFullscreen) {
      document.documentElement.requestFullscreen().catch(() => {});
    }
  };

  const cerrarKiosco = () => {
    setModoKiosco(false);
    if (document.fullscreenElement && document.exitFullscreen) {
      document.exitFullscreen().catch(() => {});
    }
  };

  const activarAudioNavegador = () => {
    if (playerRef.current?.activateElement) playerRef.current.activateElement();
    setAudioDesbloqueado(true);
    if (webPlayerId) {
      setDispositivoPreferido(webPlayerId);
      socket.emit('seleccionar_dispositivo', webPlayerId);
    }
  };

  const handleReconectarMovil = () => {
    setReconectandoMovil(true);
    socket.emit('forzar_reconexion', (ok) => {
      setReconectandoMovil(false);
      if (!ok) window.open(`${BACKEND_URL}/login`, '_blank');
    });
  };

  const handleGuardarLocutor = (
    nuevaActivacion = vozActivada,
    nuevoTexto = vozTexto,
    nuevoVol = vozVolumen,
    nuevoNombre = vozNombre
  ) => {
    socket.emit('guardar_locutor', {
      vozActivada: nuevaActivacion,
      vozTexto: nuevoTexto,
      vozVolumen: nuevoVol,
      vozNombre: nuevoNombre
    });
  };

  const cargarListaManual = (rutaLista) => socket.emit('obtener_playlist', rutaLista);
  const reusarRuta = (rutaExistente) => { setRuta(rutaExistente); setVistaActiva('inicio'); };
  const eliminarDelHistorial = (rutaEliminar) => socket.emit('eliminar_historial', rutaEliminar);

  const reproducirCancionDeLista = (index) => {
    if (playerRef.current?.activateElement) {
      playerRef.current.activateElement();
      setAudioDesbloqueado(true);
    }
    const uris = cola.slice(0, 80).map(t => t.uri).filter(Boolean);
    if (uris.length > 0) socket.emit('reproducir_ahora', { uris, offset: index >= 80 ? 0 : index });
  };

  const handleSeek = (e) => {
    if (!reproduccion.duracion) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const porcentaje = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
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
    setTimeout(() => { cambiandoVolumenRef.current = false; }, 1200);
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
  const ipUtilizar = ipLocal && ipLocal !== '127.0.0.1' ? ipLocal : window.location.hostname;
  const urlRemotaMovil = `http://${ipUtilizar}:${puertoFrontend}`;
  const qrImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&margin=10&data=${encodeURIComponent(urlRemotaMovil)}`;

  if (esMovil) {
    return (
      <MobileView
        colorAmbiente={colorAmbiente}
        sesionAutenticada={sesionAutenticada}
        reconectandoMovil={reconectandoMovil}
        handleReconectarMovil={handleReconectarMovil}
        proximaAlarma={proximaAlarma}
        reproduccion={reproduccion}
        progresoLocal={progresoLocal}
        porcentajeProgreso={porcentajeProgreso}
        handleSeek={handleSeek}
        socket={socket}
        volumen={volumen}
        toggleMute={toggleMute}
        handleVolumenChange={handleVolumenChange}
        historial={historial}
      />
    );
  }

  return (
    <div className="modern-spotify-layout" style={{ '--ambient-rgb': colorAmbiente }}>
      <KioskOverlay
        modoKiosco={modoKiosco}
        mostrarControlesKiosco={mostrarControlesKiosco}
        cerrarKiosco={cerrarKiosco}
        horaFormateadaReloj={horaFormateadaReloj}
        reproduccion={reproduccion}
        proximaAlarma={proximaAlarma}
      />

      <QrModal
        mostrarModalQr={mostrarModalQr}
        setMostrarModalQr={setMostrarModalQr}
        qrImageUrl={qrImageUrl}
        urlRemotaMovil={urlRemotaMovil}
      />

      <div className="top-panels">
        <SidebarLeft
          vistaActiva={vistaActiva}
          setVistaActiva={setVistaActiva}
          sesionAutenticada={sesionAutenticada}
        />

        <main className="panel center-panel">
          {/* CABECERA SIN EL RELOJ (EL RELOJ AHORA VIVE EXCLUSIVAMENTE EN MODO KIOSCO) */}
          <header className="center-header">
            <div className="header-live-info">
              <div className={`next-alarm-banner ${proximaAlarma ? 'active' : ''}`}>
                {proximaAlarma ? (
                  <>
                    <span className="bell-pulse">🔔</span>
                    <span className="next-label">Próxima:</span>
                    <strong className="next-song-name">{proximaAlarma.nombre}</strong>
                    <span className="next-time-badge">{proximaAlarma.horaStr} (en {proximaAlarma.tiempoRestante})</span>
                  </>
                ) : (
                  <span className="next-empty">🔕 Sin alarmas activas programadas</span>
                )}
              </div>
            </div>

            <div className="header-right-tools">
              <button type="button" className="qr-trigger-btn" onClick={() => setMostrarModalQr(true)}>
                📱 Control Móvil
              </button>
              {errorSdk ? (
                <a href="http://127.0.0.1:3001/login" target="_blank" rel="noreferrer" className="sdk-badge warning">⚠️ {errorSdk}</a>
              ) : sdkListo ? (
                <button type="button" className={`sdk-badge ${audioDesbloqueado ? 'ready' : 'action'}`} onClick={activarAudioNavegador}>
                  {audioDesbloqueado ? '🎧 Web Player Activo' : '🔊 Activar Audio aquí'}
                </button>
              ) : (
                sesionAutenticada && window.isSecureContext && <span className="sdk-badge loading">⏳ Conectando Web Player...</span>
              )}
              <div className="header-profile"><span>H</span></div>
            </div>
          </header>

          <div className="center-content">
            {vistaActiva === 'inicio' && (
              <InicioView
                tareas={tareas}
                ruta={ruta}
                setRuta={setRuta}
                socket={socket}
                cargarListaManual={cargarListaManual}
              />
            )}

            {vistaActiva === 'historial' && (
              <HistorialView
                historial={historial}
                cargarListaManual={cargarListaManual}
                reusarRuta={reusarRuta}
                eliminarDelHistorial={eliminarDelHistorial}
              />
            )}

            {vistaActiva === 'configuracion' && (
              <ConfiguracionView
                anuncios={anuncios}
                tareas={tareas}
                historial={historial}
                vozActivada={vozActivada}
                setVozActivada={setVozActivada}
                vozTexto={vozTexto}
                setVozTexto={setVozTexto}
                vozVolumen={vozVolumen}
                setVozVolumen={setVozVolumen}
                vozNombre={vozNombre}
                setVozNombre={setVozNombre}
                vocesDisponibles={vocesDisponibles}
                mensajeGuardadoVoz={mensajeGuardadoVoz}
                handleGuardarLocutor={handleGuardarLocutor}
                hablarConClima={hablarConClima}
                clientId={clientId}
                setClientId={setClientId}
                clientSecret={clientSecret}
                setClientSecret={setClientSecret}
                socket={socket}
              />
            )}
          </div>
        </main>

        <RightPanel
          reproduccion={reproduccion}
          abrirKiosco={abrirKiosco}
          cola={cola}
          reproducirCancionDeLista={reproducirCancionDeLista}
        />
      </div>

<BottomPlayer
        reproduccion={reproduccion}
        sesionAutenticada={sesionAutenticada}
        socket={socket}
        activarAudioNavegador={activarAudioNavegador}
        progresoLocal={progresoLocal}
        porcentajeProgreso={porcentajeProgreso}
        handleSeek={handleSeek}
        dispositivoPreferido={dispositivoPreferido}
        handleCambiarDispositivo={handleCambiarDispositivo}
        dispositivos={dispositivos}
        volumen={volumen}
        toggleMute={toggleMute}
        handleVolumenChange={handleVolumenChange}
      />
    </div>
  );
}

export default App;