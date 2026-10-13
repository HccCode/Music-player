import React, { useState } from 'react';
import { DIAS_SEMANA, toggleDiaEnLista } from '../../utils/helpers';

export default function LocutorView({
  anuncios,
  vozActivada,
  setVozActivada,
  vozTexto,
  setVozTexto,
  vozVolumen,
  setVozVolumen,
  vozNombre,
  setVozNombre,
  vocesDisponibles,
  mensajeGuardadoVoz,
  handleGuardarLocutor,
  hablarConClima,
  socket
}) {
  const [horaAnuncio, setHoraAnuncio] = useState('');
  const [textoNuevoAnuncio, setTextoNuevoAnuncio] = useState('');
  const [diasAnuncio, setDiasAnuncio] = useState([1, 2, 3, 4, 5, 6, 0]);

  const [editAnuncioId, setEditAnuncioId] = useState(null);
  const [editAnuncioHora, setEditAnuncioHora] = useState('');
  const [editAnuncioTexto, setEditAnuncioTexto] = useState('');
  const [editAnuncioDias, setEditAnuncioDias] = useState([]);

  const handleProgramarAnuncio = (e) => {
    e.preventDefault();
    if (!horaAnuncio || !textoNuevoAnuncio.trim()) return alert('Completa la hora y el mensaje del anuncio.');
    const [h, m] = horaAnuncio.split(':');
    socket.emit('programar_anuncio', {
      hora: h,
      minuto: m,
      texto: textoNuevoAnuncio.trim(),
      dias: diasAnuncio
    });
    setHoraAnuncio('');
    setTextoNuevoAnuncio('');
  };

  const iniciarEdicionAnuncio = (anuncio) => {
    setEditAnuncioId(anuncio.id);
    setEditAnuncioHora(`${anuncio.hora.toString().padStart(2, '0')}:${anuncio.minuto.toString().padStart(2, '0')}`);
    setEditAnuncioTexto(anuncio.texto);
    setEditAnuncioDias(Array.isArray(anuncio.dias) && anuncio.dias.length > 0 ? anuncio.dias : [1, 2, 3, 4, 5, 6, 0]);
  };

  const guardarEdicionAnuncio = (id) => {
    if (!editAnuncioHora || !editAnuncioTexto.trim()) return;
    const [h, m] = editAnuncioHora.split(':');
    socket.emit('editar_anuncio', {
      id,
      nuevaHora: h,
      nuevoMinuto: m,
      nuevoTexto: editAnuncioTexto.trim(),
      nuevosDias: editAnuncioDias
    });
    setEditAnuncioId(null);
  };

  return (
    <div className="config-scroll-wrapper">
      <h1 className="main-title">Locutor y Anuncios</h1>

      <div className="glass-card">
        <h2>🎙️ Ajustes de Voz y Audio Ducking</h2>
        <p className="config-desc">
          Mientras el locutor da un aviso, la música bajará automáticamente al 10% y la voz se escuchará al volumen regulado.
        </p>

        <div className="config-form" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '18px' }}>
          <div className="voice-controls-top-row">
            <label className={`fade-toggle-pill ${vozActivada ? 'active' : ''}`} style={{ cursor: 'pointer' }}>
              <input 
                type="checkbox" 
                checked={vozActivada} 
                onChange={(e) => {
                  const nuevoEstado = e.target.checked;
                  setVozActivada(nuevoEstado);
                  handleGuardarLocutor(nuevoEstado, vozTexto, vozVolumen, vozNombre);
                }} 
              />
              <span>{vozActivada ? '🟢 Hablar también al sonar Alarmas Musicales' : '⚪ No hablar en Alarmas Musicales'}</span>
            </label>

            <div className="voice-volume-box">
              <span className="days-label">🔉 Volumen del Anuncio ({vozVolumen}%):</span>
              <input
                type="range"
                min="10"
                max="100"
                value={vozVolumen}
                onChange={(e) => setVozVolumen(Number(e.target.value))}
                onMouseUp={() => handleGuardarLocutor(vozActivada, vozTexto, vozVolumen, vozNombre)}
                className="volume-slider"
                style={{ width: '130px', background: `linear-gradient(90deg, #1ed760 ${vozVolumen}%, rgba(255,255,255,0.16) ${vozVolumen}%)` }}
              />
            </div>
          </div>

          <div className="input-group stretch" style={{ width: '100%' }}>
            <label>🗣️ Seleccionar Voz del Locutor</label>
            <select
              className="voice-select"
              value={vozNombre}
              onChange={(e) => {
                const nuevaVoz = e.target.value;
                setVozNombre(nuevaVoz);
                handleGuardarLocutor(vozActivada, vozTexto, vozVolumen, nuevaVoz);
              }}
            >
              <option value="">✨ Automática (Voz femenina recomendada)</option>
              {vocesDisponibles.map((v, i) => (
                <option key={`${v.name}-${i}`} value={v.name}>
                  {v.lang.toLowerCase().startsWith('es') ? '🇲🇽/🇪🇸 ' : '🌐 '}
                  {v.name} ({v.lang})
                </option>
              ))}
            </select>
          </div>

          <div className="input-group stretch" style={{ width: '100%' }}>
            <label>Mensaje general al despertar con Alarmas Musicales</label>
            <textarea
              className="config-textarea"
              value={vozTexto}
              onChange={(e) => setVozTexto(e.target.value)}
              placeholder="Ej. ¡Es hora de despertar y comenzar con energía!"
              rows="2"
            ></textarea>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
            <button type="button" className="green-btn" onClick={() => handleGuardarLocutor(vozActivada, vozTexto, vozVolumen, vozNombre)}>
              💾 Guardar Ajustes de Voz
            </button>
            <button type="button" className="outline-btn" onClick={() => hablarConClima(vozTexto, { volumenVoz: vozVolumen, vozNombre })} style={{ height: '44px', padding: '0 22px' }}>
              ▶ Probar Voz Seleccionada
            </button>
            {mensajeGuardadoVoz && <span style={{ color: '#1ed760', fontWeight: 700, fontSize: '0.85rem' }}>✅ ¡Guardado con éxito!</span>}
          </div>
        </div>
      </div>

      <div className="glass-card">
        <h2>⏰ Programar Anuncio por Hora</h2>
        <p className="config-desc">
          Programa avisos a cualquier hora del día sin interrumpir tu música.
        </p>

        <form className="schedule-form-container" onSubmit={handleProgramarAnuncio}>
          <div className="schedule-form">
            <div className="input-group">
              <label>Hora del Anuncio</label>
              <input type="time" value={horaAnuncio} onChange={(e) => setHoraAnuncio(e.target.value)} required />
            </div>
            <div className="input-group stretch">
              <label>Mensaje que dirá el locutor</label>
              <input 
                type="text" 
                placeholder="Ej. Recuerda revisar tus pendientes de las 10..." 
                value={textoNuevoAnuncio} 
                onChange={(e) => setTextoNuevoAnuncio(e.target.value)} 
                required 
              />
            </div>
            <button type="submit" className="green-btn">Programar Anuncio</button>
          </div>

          <div className="days-selector-bar">
            <div className="days-left-group">
              <span className="days-label">Repetir los días:</span>
              <div className="days-pills">
                {DIAS_SEMANA.map((d) => (
                  <button
                    type="button" key={d.id} title={d.nombre}
                    className={`day-btn ${diasAnuncio.includes(d.id) ? 'selected' : ''}`}
                    onClick={() => toggleDiaEnLista(setDiasAnuncio, d.id)}
                  >{d.label}</button>
                ))}
              </div>
            </div>
          </div>
        </form>

        <h3 style={{ marginTop: '24px', marginBottom: '12px', fontSize: '1rem' }}>
          Anuncios Programados ({anuncios.length})
        </h3>

        <div className="tasks-container">
          {anuncios.length === 0 ? (
            <p className="empty-text">No tienes anuncios de voz programados todavía.</p>
          ) : (
            anuncios.map((anuncio) => {
              const activa = anuncio.activa !== undefined ? anuncio.activa : true;
              const diasItem = Array.isArray(anuncio.dias) && anuncio.dias.length > 0 ? anuncio.dias : [1, 2, 3, 4, 5, 6, 0];

              return (
                <div className={`task-row ${!activa ? 'task-disabled' : ''}`} key={anuncio.id}>
                  <label className="switch">
                    <input type="checkbox" checked={activa} onChange={() => socket.emit('toggle_anuncio', anuncio.id)} />
                    <span className="slider"></span>
                  </label>

                  {editAnuncioId === anuncio.id ? (
                    <div className="task-edit-mode">
                      <input type="time" value={editAnuncioHora} onChange={(e) => setEditAnuncioHora(e.target.value)} className="edit-time-input" />
                      <input type="text" value={editAnuncioTexto} onChange={(e) => setEditAnuncioTexto(e.target.value)} className="edit-text-input" />
                      <div className="edit-days-pills">
                        {DIAS_SEMANA.map((d) => (
                          <button type="button" key={d.id} className={`day-btn mini ${editAnuncioDias.includes(d.id) ? 'selected' : ''}`} onClick={() => toggleDiaEnLista(setEditAnuncioDias, d.id)}>{d.label}</button>
                        ))}
                      </div>
                      <button type="button" className="outline-btn safe" onClick={() => guardarEdicionAnuncio(anuncio.id)}>✔️ Guardar</button>
                      <button type="button" className="outline-btn danger" onClick={() => setEditAnuncioId(null)}>✖️</button>
                    </div>
                  ) : (
                    <>
                      <div className="task-time-block" onDoubleClick={() => iniciarEdicionAnuncio(anuncio)}>
                        <div className="task-time">{anuncio.hora.toString().padStart(2, '0')}:{anuncio.minuto.toString().padStart(2, '0')}</div>
                        <div className="task-days-mini">
                          {DIAS_SEMANA.map(d => <span key={d.id} className={`mini-day-dot ${diasItem.includes(d.id) ? 'on' : ''}`}>{d.label}</span>)}
                        </div>
                      </div>
                      <div className="task-media">
                        <div className="task-meta">
                          <div className="task-title-row">
                            <span className="media-badge">🎙️ Voz ({vozVolumen}%)</span>
                            <span className="fade-badge">🔉 Música 10%</span>
                            <span className="task-name">{anuncio.texto}</span>
                          </div>
                          <span className="task-sub">Anuncia hora + clima + mensaje</span>
                        </div>
                      </div>
                      <div className="task-actions">
                        <button className="outline-btn" onClick={() => hablarConClima(anuncio.texto, { volumenVoz: vozVolumen, vozNombre })}>🔊 Probar</button>
                        <button className="outline-btn" onClick={() => iniciarEdicionAnuncio(anuncio)}>✏️</button>
                        <button className="outline-btn danger" onClick={() => socket.emit('eliminar_anuncio', anuncio.id)}>🗑️</button>
                      </div>
                    </>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}