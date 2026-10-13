import React from 'react';

export default function SidebarLeft({ vistaActiva, setVistaActiva }) {
  return (
    <aside className="panel left-panel">
      <div className="nav-container">
        <div className={`nav-item ${vistaActiva === 'inicio' ? 'active' : ''}`} onClick={() => setVistaActiva('inicio')}>
          <span className="icon">🏠</span><span>Inicio</span>
        </div>
        <div className={`nav-item ${vistaActiva === 'configuracion' ? 'active' : ''}`} onClick={() => setVistaActiva('configuracion')}>
          <span className="icon">⚙️</span><span>Configuración</span>
        </div>
      </div>
      <div className="library-container">
        <div className={`nav-item library-header ${vistaActiva === 'historial' ? 'active' : ''}`} onClick={() => setVistaActiva('historial')}>
          <span className="icon">🕒</span><span>Historial</span>
        </div>
      </div>
    </aside>
  );
}