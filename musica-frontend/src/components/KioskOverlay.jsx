import React from 'react';

export default function KioskOverlay({
  modoKiosco,
  mostrarControlesKiosco,
  cerrarKiosco,
  horaFormateadaReloj,
  reproduccion,
  proximaAlarma
}) {
  if (!modoKiosco) return null;

  return (
    <div className={`kiosk-overlay ${!mostrarControlesKiosco ? 'hide-cursor' : ''}`}>
      <button 
        className={`kiosk-exit-btn ${!mostrarControlesKiosco ? 'hidden' : ''}`} 
        onClick={cerrarKiosco}
      >
        ✖ Cerrar Pantalla Completa
      </button>
      <div className="kiosk-content">
        <div className="kiosk-clock">{horaFormateadaReloj}</div>
        <img src={reproduccion.imagen} alt="Portada" className="kiosk-cover" />
        <h2 className="kiosk-title">{reproduccion.cancion}</h2>
        <p className="kiosk-artist">{reproduccion.artista}</p>
        {proximaAlarma ? (
          <div className="kiosk-next-alarm">
            🔔 Próxima alarma: <strong>{proximaAlarma.nombre}</strong> a las {proximaAlarma.horaStr} (en {proximaAlarma.tiempoRestante})
          </div>
        ) : (
          <div className="kiosk-next-alarm">🔕 Sin alarmas programadas</div>
        )}
      </div>
    </div>
  );
}