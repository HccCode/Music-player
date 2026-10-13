import React from 'react';
import { formatTime } from '../utils/helpers';

export default function MobileView({
  colorAmbiente,
  sesionAutenticada,
  reconectandoMovil,
  handleReconectarMovil,
  proximaAlarma,
  reproduccion,
  progresoLocal,
  porcentajeProgreso,
  handleSeek,
  socket,
  volumen,
  toggleMute,
  handleVolumenChange,
  historial
}) {
  return (
    <div className="mobile-simple-app" style={{ '--ambient-rgb': colorAmbiente }}>
      <header className="mobile-top-bar">
        <div className="mobile-status-badge">
          <span className="auth-dot" style={{ backgroundColor: sesionAutenticada ? '#1ed760' : '#f59e0b' }}></span>
          <span>{sesionAutenticada ? 'Spotify Conectado' : 'Sin Sesión'}</span>
        </div>
        <button type="button" className="mobile-reconnect-btn" onClick={handleReconectarMovil}>
          {reconectandoMovil ? '⏳ Conectando...' : '🔄 Reconectar'}
        </button>
      </header>

      <div className={`mobile-next-pill ${proximaAlarma ? 'active' : ''}`}>
        {proximaAlarma ? (
          <>
            <span className="bell-pulse">🔔</span>
            <span className="next-label">Próxima:</span>
            <strong className="mobile-next-name">{proximaAlarma.nombre}</strong>
            <span className="next-time-badge">{proximaAlarma.horaStr} (en {proximaAlarma.tiempoRestante})</span>
          </>
        ) : (
          <span className="next-empty">🔕 Sin alarmas programadas</span>
        )}
      </div>

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
            min="0" max="100" 
            value={volumen} 
            onChange={handleVolumenChange} 
            className="volume-slider mobile-vol-slider"
            style={{ background: `linear-gradient(90deg, #1ed760 ${volumen}%, rgba(255,255,255,0.16) ${volumen}%)` }}
          />
          <span className="vol-percent">{volumen}%</span>
        </div>
      </section>

      <section className="mobile-history-section">
        <h3 className="mobile-section-title">🕒 Historial de Reproducción</h3>
        <div className="mobile-history-list">
          {historial.length === 0 ? (
            <p className="empty-text">No hay elementos en el historial.</p>
          ) : (
            historial.map((item, idx) => {
              const obj = typeof item === 'string' 
                ? { ruta: item, nombre: item, subtitulo: 'Enlace', imagen: 'https://i.scdn.co/image/ab6761610000e5eb55d39ab9c21d506aa52f7021', tipo: 'Enlace' } 
                : item;
              return (
                <div className="mobile-history-item" key={idx}>
                  <img src={obj.imagen} alt="Cover" className="mobile-hist-thumb" />
                  <div className="mobile-hist-info">
                    <span className="mobile-hist-name">{obj.nombre}</span>
                    <span className="mobile-hist-sub">{obj.tipo || 'Spotify'} • {obj.subtitulo}</span>
                  </div>
                  <button type="button" className="mobile-hist-play-btn" onClick={() => socket.emit('reproducir_item_directo', obj.ruta)}>▶</button>
                </div>
              );
            })
          )}
        </div>
      </section>
    </div>
  );
}