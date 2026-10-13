import React, { useState } from 'react';
import { DIAS_SEMANA, toggleDiaEnLista } from '../../utils/helpers';

export default function InicioView({
  tareas,
  ruta,
  setRuta,
  socket,
  cargarListaManual,
  reproducirItemDirecto
}) {
  const [hora, setHora] = useState('');
  const [diasSeleccionados, setDiasSeleccionados] = useState([1, 2, 3, 4, 5, 6, 0]);
  const [fadeIn, setFadeIn] = useState(false);

  const [editandoId, setEditandoId] = useState(null);
  const [editHora, setEditHora] = useState('');
  const [editDias, setEditDias] = useState([]);
  const [editFadeIn, setEditFadeIn] = useState(false);

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
    setHora('');
    setRuta('');
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

  return (
    <>
      <h1 className="main-title">Panel de Control Musical</h1>
      <div className="glass-card fixed-top-card">
        <h2>Programar Reproducción (Spotify o YouTube)</h2>
        <form className="schedule-form-container" onSubmit={handleProgramar}>
          <div className="schedule-form">
            <div className="input-group">
              <label>Hora</label>
              <input type="time" value={hora} onChange={(e) => setHora(e.target.value)} required />
            </div>
            <div className="input-group stretch">
              <label>Enlace de Spotify o YouTube</label>
              <input 
                type="text" 
                placeholder="Pega un enlace de Spotify (canción/playlist) o de YouTube..." 
                value={ruta} 
                onChange={(e) => setRuta(e.target.value)} 
                required 
              />
            </div>
            <button type="submit" className="green-btn">Programar</button>
          </div>

          <div className="days-selector-bar">
            <div className="days-left-group">
              <span className="days-label">Repetir los días:</span>
              <div className="days-pills">
                {DIAS_SEMANA.map((d) => (
                  <button
                    type="button" key={d.id} title={d.nombre}
                    className={`day-btn ${diasSeleccionados.includes(d.id) ? 'selected' : ''}`}
                    onClick={() => toggleDiaEnLista(setDiasSeleccionados, d.id)}
                  >{d.label}</button>
                ))}
              </div>
            </div>
            <label className={`fade-toggle-pill ${fadeIn ? 'active' : ''}`} title="Inicia al 10% de volumen y sube gradualmente">
              <input type="checkbox" checked={fadeIn} onChange={(e) => setFadeIn(e.target.checked)} />
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
            const esYt = tarea.tipo === 'YouTube' || (tarea.ruta && (tarea.ruta.includes('youtube.com') || tarea.ruta.includes('youtu.be')));

            return (
              <div className={`task-row ${!activa ? 'task-disabled' : ''}`} key={tarea.id}>
                <label className="switch">
                  <input type="checkbox" checked={activa} onChange={() => socket.emit('toggle_tarea', tarea.id)} />
                  <span className="slider"></span>
                </label>

                {editandoId === tarea.id ? (
                  <div className="task-edit-mode">
                    <input type="time" value={editHora} onChange={(e) => setEditHora(e.target.value)} className="edit-time-input"/>
                    <div className="edit-days-pills">
                      {DIAS_SEMANA.map((d) => (
                        <button type="button" key={d.id} className={`day-btn mini ${editDias.includes(d.id) ? 'selected' : ''}`} onClick={() => toggleDiaEnLista(setEditDias, d.id)}>{d.label}</button>
                      ))}
                    </div>
                    <button type="button" className={`fade-mini-btn ${editFadeIn ? 'selected' : ''}`} onClick={() => setEditFadeIn(!editFadeIn)}>📈 Fade-In</button>
                    <button type="button" className="outline-btn safe" onClick={() => guardarEdicion(tarea.id)}>✔️ Guardar</button>
                    <button type="button" className="outline-btn danger" onClick={() => setEditandoId(null)}>✖️</button>
                  </div>
                ) : (
                  <>
                    <div className="task-time-block" onDoubleClick={() => iniciarEdicion(tarea)}>
                      <div className="task-time">{tarea.hora.toString().padStart(2, '0')}:{tarea.minuto.toString().padStart(2, '0')}</div>
                      <div className="task-days-mini">
                        {DIAS_SEMANA.map(d => <span key={d.id} className={`mini-day-dot ${diasTarea.includes(d.id) ? 'on' : ''}`}>{d.label}</span>)}
                      </div>
                    </div>
                    <div className="task-media">
                      <img src={tarea.imagen} alt="Cover" className="task-thumb" />
                      <div className="task-meta">
                        <div className="task-title-row">
                          <span className={`media-badge ${esYt ? 'yt-badge' : ''}`}>
                            {esYt ? '▶ YouTube' : (tarea.tipo || 'Spotify')}
                          </span>
                          {tarea.fadeIn && <span className="fade-badge">📈 Fade-In</span>}
                          <span className="task-name">{tarea.nombre || tarea.ruta}</span>
                        </div>
                        <span className="task-sub">{tarea.subtitulo || tarea.ruta}</span>
                      </div>
                    </div>
                    <div className="task-actions">
                      <button className="outline-btn" onClick={() => reproducirItemDirecto(tarea.ruta)} title="Reproducir ahora">▶</button>
                      <button className="outline-btn" onClick={() => iniciarEdicion(tarea)}>✏️</button>
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
  );
}