import React from 'react';

export default function SidebarLeft({ vistaActiva, setVistaActiva }) {
  return (
    <aside className="panel left-panel">
      <div className="nav-container">
        <div className={`nav-item ${vistaActiva === 'inicio' ? 'active' : ''}`} onClick={() => setVistaActiva('inicio')}>
          <span className="icon">🏠</span><span>Inicio</span>
        </div>
        <div className={`nav-item ${vistaActiva === 'locutor' ? 'active' : ''}`} onClick={() => setVistaActiva('locutor')}>
          <span className="icon">🎙️</span><span>Locutor y Anuncios</span>
        </div>
        <div className={`nav-item ${vistaActiva === 'luces' ? 'active' : ''}`} onClick={() => setVistaActiva('luces')}>
          <span className="icon">💡</span><span>Luces</span>
        </div>
        <div className={`nav-item ${vistaActiva === 'configuracion' ? 'active' : ''}`} onClick={() => setVistaActiva('configuracion')}>
          <span className="icon">⚙️</span><span>Configuración</span>
        </div>
      </div>
      <div className="library-container">
        <div className={`nav-item library-header ${vistaActiva === 'historial' ? 'active' : ''}`} onClick={() => setVistaActiva('historial')}>
          <span className="icon">🕒</span><span>Historial de Musica</span>
        </div>
        <div className={`nav-item ${vistaActiva === 'cajanegra' ? 'active' : ''}`} onClick={() => setVistaActiva('cajanegra')}>
          <span className="icon">📋</span><span>Logs</span>
        </div>
      </div>
    </aside>
  );
}