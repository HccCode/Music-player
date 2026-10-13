import React from 'react';

export default function HistorialView({
  historial,
  cargarListaManual,
  reproducirItemDirecto,
  reusarRuta,
  eliminarDelHistorial
}) {
  return (
    <>
      <h1 className="main-title">Historial</h1>
      <div className="glass-card history-full-card">
        <h2>Canciones, Videos y Listas Guardadas</h2>
        <div className="tasks-container scrollable-tasks">
          {historial.length === 0 ? (
            <p className="empty-text">Aún no hay canciones o listas en tu historial.</p>
          ) : (
            historial.map((item, idx) => {
              const obj = typeof item === 'string' 
                ? { ruta: item, nombre: item, subtitulo: 'Enlace', imagen: 'https://i.scdn.co/image/ab6761610000e5eb55d39ab9c21d506aa52f7021', tipo: 'Enlace' } 
                : item;
              const esYt = obj.tipo === 'YouTube' || (obj.ruta && (obj.ruta.includes('youtube.com') || obj.ruta.includes('youtu.be')));

              return (
                <div className="task-row" key={idx}>
                  <div className="task-media">
                    <img src={obj.imagen} alt="Cover" className="task-thumb" />
                    <div className="task-meta">
                      <div className="task-title-row">
                        <span className={`media-badge ${esYt ? 'yt-badge' : ''}`}>
                          {esYt ? '▶ YouTube' : (obj.tipo || 'Spotify')}
                        </span>
                        <span className="task-name">{obj.nombre}</span>
                      </div>
                      <span className="task-sub">{obj.subtitulo}</span>
                    </div>
                  </div>
                  <div className="task-actions">
                    <button className="outline-btn" onClick={() => reproducirItemDirecto(obj.ruta)} title="Reproducir ahora">▶</button>
                    <button className="outline-btn" onClick={() => cargarListaManual(obj.ruta)}>Ver Pista</button>
                    <button className="outline-btn" onClick={() => reusarRuta(obj.ruta)}>Volver a agregar</button>
                    <button className="outline-btn danger" onClick={() => eliminarDelHistorial(obj.ruta)}>🗑️</button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </>
  );
}