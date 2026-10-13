import React from 'react';

export default function RightPanel({ reproduccion, abrirKiosco, cola, reproducirCancionDeLista }) {
  return (
    <aside className="panel right-panel">
      <div className="right-panel-header">
        <h3>{reproduccion.cancion}</h3>
        <button type="button" className="kiosk-trigger-btn-right" onClick={abrirKiosco}>
          ⛶ Kiosco
        </button>
      </div>
      <div className="now-playing-large">
        <img src={reproduccion.imagen} alt="Portada" className="large-cover" />
        <div className="large-info">
          <h2>{reproduccion.cancion}</h2>
          <p>{reproduccion.artista}</p>
        </div>
      </div>
      <div className="queue-container">
        <div className="queue-header"><h4>Siguiente en la lista</h4></div>
        {cola.length === 0 ? (
          <p className="empty-queue">Carga una playlist o video.</p>
        ) : typeof cola[0] === 'string' ? (
          <p className="empty-queue">{cola[0]}</p>
        ) : (
          <ul className="queue-list">
            {cola.map((track, index) => (
              <li key={index} className="queue-item" onDoubleClick={() => reproducirCancionDeLista(index)}>
                <div className="queue-track-info">
                  <span className="queue-icon">{track.youtubeUrl ? '▶' : '🎵'}</span>
                  <div className="queue-text-block">
                    <span className="queue-track-name">{track.nombre}</span>
                    <span className="queue-track-artist">{track.artista}</span>
                  </div>
                </div>
                {(track.uri || track.youtubeUrl) && (
                  <button
                    className="queue-play-btn"
                    onClick={(e) => { e.stopPropagation(); reproducirCancionDeLista(index); }}
                  >
                    ▶
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </aside>
  );
}