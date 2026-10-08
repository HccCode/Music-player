import { useState, useEffect } from 'react';
import { io } from 'socket.io-client';
import './diseno.css';

const socket = io('http://localhost:3001');

function App() {
  const [horaLocal, setHoraLocal] = useState('');
  const [rutaArchivo, setRutaArchivo] = useState('');
  const [tareas, setTareas] = useState([]);
  const [playlist, setPlaylist] = useState([]);

  useEffect(() => {
    socket.on('tareas_actualizadas', (data) => setTareas(data));
    socket.on('lista_canciones_resultado', (data) => setPlaylist(data));
    socket.on('reproduciendo', (data) => alert(`¡Es la hora! Reproduciendo música.`));

    return () => {
      socket.off('tareas_actualizadas');
      socket.off('lista_canciones_resultado');
      socket.off('reproduciendo');
    };
  }, []);

  const handleProgramar = (e) => {
    e.preventDefault();
    if (!horaLocal || !rutaArchivo) return;
    const [hora, minuto] = horaLocal.split(':');
    socket.emit('programar_musica', { hora, minuto, ruta: rutaArchivo });
    setHoraLocal('');
    setRutaArchivo('');
  };

  return (
    <div className="dashboard-container">
      <header className="dashboard-header">
        <h2>Panel de Control Musical</h2>
        <p>Programa y administra tus horarios de reproducción automatizada</p>
      </header>

      {/* NUEVA TARJETA: Controles de Reproducción */}
      <div className="tarjeta controles-tarjeta">
        <h3 style={{ marginTop: 0, textAlign: 'center' }}>Controles en Vivo</h3>
        <div className="controles-reproduccion">
          <button className="btn-control" onClick={() => socket.emit('control_anterior')}>⏮ Anterior</button>
          <button className="btn-control" onClick={() => socket.emit('control_pausa')}>⏸ Pausa</button>
          <button className="btn-control btn-play" onClick={() => socket.emit('control_play')}>▶ Play</button>
          <button className="btn-control" onClick={() => socket.emit('control_siguiente')}>⏭ Siguiente</button>
        </div>
      </div>
      
      <div className="tarjeta">
        <form onSubmit={handleProgramar} className="formulario-programar">
          <div className="grupo-input" style={{ flex: '0 1 150px' }}>
            <label>Hora de ejecución</label>
            <input type="time" value={horaLocal} onChange={(e) => setHoraLocal(e.target.value)} required />
          </div>
          <div className="grupo-input">
            <label>Enlace o URI de Spotify</label>
            <input type="text" placeholder="Ej: https://open.spotify.com/playlist/..." value={rutaArchivo} onChange={(e) => setRutaArchivo(e.target.value)} required />
          </div>
          <button type="submit" className="btn btn-primario">Programar Tarea</button>
        </form>
      </div>

      <div className="tarjeta">
        <h3 style={{ marginTop: 0, marginBottom: '20px' }}>Horarios Activos</h3>
        {tareas.length === 0 ? (
          <div className="estado-vacio">No hay música programada.</div>
        ) : (
          <ul className="lista-tareas">
            {tareas.map((tarea) => (
              <li key={tarea.id} className="tarea-item">
                <div className="tarea-info">
                  <span className="tarea-hora">{tarea.hora}:{tarea.minuto.padStart(2, '0')}</span>
                  <span className="tarea-ruta">{tarea.ruta}</span>
                </div>
                <div className="tarea-acciones">
                  <button onClick={() => socket.emit('obtener_playlist', tarea.ruta)} className="btn btn-secundario" style={{marginRight: '10px'}}>
                    Ver Lista
                  </button>
                  <button onClick={() => socket.emit('cancelar_tarea', tarea.id)} className="btn btn-peligro">
                    Cancelar
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* NUEVA TARJETA: Visor de Playlist */}
      {playlist.length > 0 && (
        <div className="tarjeta visor-playlist">
          <h3 style={{ marginTop: 0 }}>Contenido del Enlace</h3>
          <ul className="lista-canciones-interna">
            {playlist.map((cancion, index) => (
              <li key={index}>{cancion}</li>
            ))}
          </ul>
          <button onClick={() => setPlaylist([])} className="btn btn-secundario" style={{marginTop: '15px', width: '100%'}}>Cerrar Lista</button>
        </div>
      )}
    </div>
  );
}

export default App;