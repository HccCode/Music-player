import React from 'react';

export default function SidebarLeft({ vistaActiva, setVistaActiva, sesionAutenticada }) {
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
        <div className="auth-box">
          <div className="auth-status-row">
            <span className="auth-dot" style={{ backgroundColor: sesionAutenticada ? '#1ed760' : '#f59e0b' }}></span>
            <p>{sesionAutenticada ? 'Sesión Activa (Auto-Login)' : 'Sesión Pendiente'}</p>
          </div>
          <a href="http://127.0.0.1:3001/login" target="_blank" rel="noreferrer" className="pill-btn">
            {sesionAutenticada ? 'Reconectar' : 'Iniciar Sesión'}
          </a>
        </div>
      </div>
    </aside>
  );
}