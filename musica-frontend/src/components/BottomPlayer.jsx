import React from 'react';
import { formatTime } from '../utils/helpers';

export default function BottomPlayer({
  reproduccion,
  sesionAutenticada,
  socket,
  activarAudioNavegador,
  progresoLocal,
  porcentajeProgreso,
  handleSeek,
  dispositivoPreferido,
  handleCambiarDispositivo,
  dispositivos,
  volumen,
  toggleMute,
  handleVolumenChange
}) {
  return (
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
            <button className="play-btn" onClick={() => { activarAudioNavegador(); socket.emit('control_play'); }}>▶</button>
          )}
          <button className="ctrl-btn" onClick={() => socket.emit('control_siguiente')}>⏭</button>
        </div>
        
        <div className="progress-bar-container">
          <span className="time-text">{formatTime(progresoLocal)}</span>
          <div className="progress-bg clickable" onClick={handleSeek}>
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
          >
            <option value="">💻 Auto (Panel Web / Activo)</option>
            {dispositivos.map(d => (
              <option key={d.id} value={d.id}>
                {d.is_active ? '🟢 ' : '⚪ '}{d.name}
              </option>
            ))}
          </select>
          <button className="device-refresh-btn" onClick={() => socket.emit('obtener_dispositivos')}>🔄</button>
        </div>

        <div className="volume-control">
          <button className="vol-btn" onClick={toggleMute}>
            {volumen === 0 ? '🔇' : volumen < 50 ? '🔉' : '🔊'}
          </button>
          <input 
            type="range" 
            min="0" max="100" 
            value={volumen} 
            onChange={handleVolumenChange} 
            className="volume-slider"
            style={{ background: `linear-gradient(90deg, #1ed760 ${volumen}%, rgba(255,255,255,0.16) ${volumen}%)` }}
          />
          <span className="vol-percent">{volumen}%</span>
        </div>

        {/* COLUNA VERTICAL: SESIÓN ACTIVA EM CIMA E BOTÃO RECONECTAR EMBAIXO */}
        <div className="session-stack">
          <span className="status-indicator">
            <span className="dot" style={{ backgroundColor: sesionAutenticada ? '#1ed760' : '#f59e0b' }}></span>
            {sesionAutenticada ? 'Online' : 'Offline'}
          </span>
          <a 
            href="http://127.0.0.1:3001/login" 
            target="_blank" 
            rel="noreferrer" 
            className="reconnect-mini-btn"
          >
            {sesionAutenticada ? 'Reconectar' : 'Iniciar Sesión'}
          </a>
        </div>
      </div>
    </footer>
  );
}