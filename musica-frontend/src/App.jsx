import { useState, useEffect } from 'react';
import { io } from 'socket.io-client';
import './diseno.css'; // <-- Importamos nuestro nuevo diseño

const socket = io('http://localhost:3001');

function App() {
  const [horaLocal, setHoraLocal] = useState('');
  const [rutaArchivo, setRutaArchivo] = useState('');
  const [tareas, setTareas] = useState([]);

  useEffect(() => {
    socket.on('tareas_actualizadas', (data) => {
      setTareas(data);
    });

    socket.on('reproduciendo', (data) => {
      alert(`¡Es la hora! Reproduciendo: ${data.ruta}`);
    });

    return () => {
      socket.off('tareas_actualizadas');
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

  const handleCancelar = (id) => {
    socket.emit('cancelar_tarea', id);
  };

  return (
    <div className="dashboard-container">
      
      <header className="dashboard-header">
        <h2>Panel de Control Musical</h2>
        <p>Programa y administra tus horarios de reproducción automatizada</p>
      </header>
      
      <div className="tarjeta">
        <form onSubmit={handleProgramar} className="formulario-programar">
          <div className="grupo-input" style={{ flex: '0 1 150px' }}>
            <label>Hora de ejecución</label>
            <input 
              type="time" 
              value={horaLocal} 
              onChange={(e) => setHoraLocal(e.target.value)} 
              required
            />
          </div>
          
          <div className="grupo-input">
            <label>Ruta del archivo de audio</label>
            <input 
              type="text" 
              placeholder="Ej: C:\Musica\alarma.mp3" 
              value={rutaArchivo} 
              onChange={(e) => setRutaArchivo(e.target.value)} 
              required
            />
          </div>
          
          <button type="submit" className="btn btn-primario">
            Programar Tarea
          </button>
        </form>
      </div>

      <div className="tarjeta">
        <h3 style={{ marginTop: 0, marginBottom: '20px' }}>Horarios Activos</h3>
        
        {tareas.length === 0 ? (
          <div className="estado-vacio">
            No hay música programada en este momento.
          </div>
        ) : (
          <ul className="lista-tareas">
            {tareas.map((tarea) => (
              <li key={tarea.id} className="tarea-item">
                <div className="tarea-info">
                  <span className="tarea-hora">
                    {tarea.hora}:{tarea.minuto.padStart(2, '0')}
                  </span>
                  <span className="tarea-ruta">{tarea.ruta}</span>
                </div>
                <button 
                  onClick={() => handleCancelar(tarea.id)}
                  className="btn btn-peligro"
                >
                  Cancelar
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

    </div>
  );
}

export default App;