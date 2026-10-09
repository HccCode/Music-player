import React, { useState, useEffect } from 'react';
import io from 'socket.io-client';
import './App.css';

const socket = io('http://localhost:3001');

// Función para convertir milisegundos a formato M:SS
const formatTime = (ms) => {
  if (!ms) return '0:00';
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
};

function App() {
  const [tareas, setTareas] = useState([]);
  const [hora, setHora] = useState('');
  const [ruta, setRuta] = useState('');
  const [cola, setCola] = useState([]);
  
  const [reproduccion, setReproduccion] = useState({ 
    activo: false, 
    cancion: 'Esperando música...', 
    artista: 'Spotify API', 
    imagen: 'https://i.scdn.co/image/ab6761610000e5eb55d39ab9c21d506aa52f7021',
    progreso: 0,
    duracion: 0
  });

  // Estado local para que la barra avance fluidamente cada segundo
  const [progresoLocal, setProgresoLocal] = useState(0);

  useEffect(() => {
    socket.on('tareas_actualizadas', (data) => setTareas(data));
    
    socket.on('estado_reproduccion', (data) => {
      setReproduccion(prevState => ({
        ...prevState,
        ...data
      }));
      // Sincronizar el reloj local con el de Spotify cuando llega la info
      setProgresoLocal(data.progreso || 0);
    });

    socket.on('lista_canciones_resultado', (data) => {
      setCola(data);
    });

    return () => {
      socket.off('tareas_actualizadas');
      socket.off('estado_reproduccion');
      socket.off('lista_canciones_resultado');
    };
  }, []);

  // Temporizador para que la barra se mueva 1 segundo a la vez
  useEffect(() => {
    let intervalo;
    if (reproduccion.activo) {
      intervalo = setInterval(() => {
        setProgresoLocal(prev => {
          const nuevo = prev + 1000;
          return nuevo > reproduccion.duracion ? reproduccion.duracion : nuevo;
        });
      }, 1000);
    }
    return () => clearInterval(intervalo);
  }, [reproduccion.activo, reproduccion.duracion]);

  const handleProgramar = (e) => {
    e.preventDefault();
    if (!hora || !ruta) return alert('Por favor, completa la hora y el enlace.');
    
    const [h, m] = hora.split(':');
    socket.emit('programar_musica', { hora: h, minuto: m, ruta });
    socket.emit('obtener_playlist', ruta);

    setHora('');
    setRuta('');
  };

  const cargarListaManual = (rutaLista) => {
    socket.emit('obtener_playlist', rutaLista);
  };

  const reusarRuta = (rutaExistente) => {
    setRuta(rutaExistente);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Cálculo del porcentaje para rellenar la barra blanca
  const porcentajeProgreso = reproduccion.duracion ? (progresoLocal / reproduccion.duracion) * 100 : 0;

  return (
    <div className="modern-spotify-layout">
      
      {/* PANELES SUPERIORES */}
      <div className="top-panels">
        
        {/* PANEL IZQUIERDO */}
        <aside className="panel left-panel">
          <div className="nav-container">
            <div className="nav-item">
              <span className="icon">🏠</span>
              <span>Inicio</span>
            </div>
          </div>
          <div className="library-container">
            <div className="nav-item library-header">
              <span className="icon">📚</span>
              <span>Tu Biblioteca</span>
            </div>
            <div className="auth-box">
               <p>Conexión a Spotify</p>
               <a href="http://127.0.0.1:3001/login" target="_blank" rel="noreferrer" className="pill-btn">
                 Refrescar Token
               </a>
            </div>
          </div>
        </aside>

        {/* PANEL CENTRAL */}
        <main className="panel center-panel">
          <header className="center-header">
            <div className="header-nav">
              <button className="circle-btn">❮</button>
              <button className="circle-btn">❯</button>
            </div>
            <div className="header-profile">
              <span>H</span>
            </div>
          </header>

          <div className="center-content">
            <h1 className="main-title">Panel de Control Musical</h1>
            
            <div className="glass-card">
              <h2>Programar Reproducción</h2>
              <form className="schedule-form" onSubmit={handleProgramar}>
                <div className="input-group">
                  <label>Hora</label>
                  <input 
                    type="time" 
                    value={hora} 
                    onChange={(e) => setHora(e.target.value)} 
                    required 
                  />
                </div>
                <div className="input-group stretch">
                  <label>URI o Enlace de Spotify</label>
                  <input 
                    type="text" 
                    placeholder="Ej: spotify:playlist:37i9dQZF1DXcBWIGoYBM5M" 
                    value={ruta} 
                    onChange={(e) => setRuta(e.target.value)} 
                    required 
                  />
                </div>
                <button type="submit" className="green-btn">Programar</button>
              </form>
            </div>

            <h2 className="section-title">Horarios Activos</h2>
            <div className="tasks-container">
              {tareas.length === 0 ? (
                <p className="empty-text">No hay reproducciones automáticas pendientes.</p>
              ) : (
                tareas.map((tarea) => (
                  <div className="task-row" key={tarea.id}>
                    <div className="task-time">
                      {tarea.hora.toString().padStart(2, '0')}:{tarea.minuto.toString().padStart(2, '0')}
                    </div>
                    <div className="task-uri">{tarea.ruta}</div>
                    <div className="task-actions">
                      <button className="outline-btn" onClick={() => cargarListaManual(tarea.ruta)}>
                        Ver Pista
                      </button>
                      <button className="outline-btn" onClick={() => reusarRuta(tarea.ruta)} title="Copiar enlace">
                        Volver a agregar
                      </button>
                      <button className="outline-btn danger" onClick={() => socket.emit('cancelar_tarea', tarea.id)}>
                        Cancelar
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </main>

        {/* PANEL DERECHO */}
        <aside className="panel right-panel">
          <div className="right-panel-header">
            <h3>{reproduccion.cancion}</h3>
          </div>
          
          <div className="now-playing-large">
            <img src={reproduccion.imagen} alt="Portada" className="large-cover" />
            <div className="large-info">
              <h2>{reproduccion.cancion}</h2>
              <p>{reproduccion.artista}</p>
            </div>
          </div>

          <div className="queue-container">
            <div className="queue-header">
              <h4>Siguiente en la lista</h4>
            </div>
            {cola.length === 0 ? (
              <p className="empty-queue">Carga una playlist o pista para ver la información.</p>
            ) : (
              <ul className="queue-list">
                {cola.slice(0, 15).map((track, index) => (
                  <li key={index} className="queue-item">
                    <span className="queue-icon">🎵</span>
                    <span className="queue-track-name">{track}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </aside>

      </div>

      {/* REPRODUCTOR INFERIOR */}
      <footer className="bottom-player">
        <div className="player-left">
          {reproduccion.imagen && <img src={reproduccion.imagen} alt="Cover" />}
          <div className="player-track-info">
            <span className="name">{reproduccion.cancion}</span>
            <span className="artist">{reproduccion.artista}</span>
          </div>
        </div>

        <div className="player-center">
          <div className="player-controls">
            <button className="ctrl-btn" onClick={() => socket.emit('control_anterior')}>⏮</button>
            
            {reproduccion.activo ? (
              <button className="play-btn" onClick={() => socket.emit('control_pausa')}>⏸</button>
            ) : (
              <button className="play-btn" onClick={() => socket.emit('control_play')}>▶</button>
            )}

            <button className="ctrl-btn" onClick={() => socket.emit('control_siguiente')}>⏭</button>
          </div>
          
          {/* BARRA DE PROGRESO ANIMADA */}
          <div className="progress-bar-container">
            <span className="time-text">{formatTime(progresoLocal)}</span>
            <div className="progress-bg">
              <div className="progress-fill" style={{ width: `${porcentajeProgreso}%` }}></div>
            </div>
            <span className="time-text">{formatTime(reproduccion.duracion)}</span>
          </div>
          
        </div>

        <div className="player-right">
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