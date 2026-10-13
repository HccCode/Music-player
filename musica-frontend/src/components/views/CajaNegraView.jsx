import React from 'react';

export default function CajaNegraView({ cajaNegra, socket }) {
  return (
    <div className="config-scroll-wrapper">
      <h1 className="main-title">Registro de Eventos (Caja Negra)</h1>
      <div className="glass-card history-full-card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px', flexWrap: 'wrap', gap: '10px' }}>
          <h2>Bitácora en Vivo del Servidor</h2>
          <button 
            type="button" 
            className="outline-btn danger" 
            onClick={() => {
              if(window.confirm('¿Seguro que quieres limpiar todo el registro del sistema?')) {
                socket.emit('limpiar_caja_negra');
              }
            }}
          >
            🗑️ Limpiar Registro
          </button>
        </div>
        
        <div className="tasks-container scrollable-tasks" style={{ maxHeight: '65vh', overflowY: 'auto', paddingRight: '10px' }}>
          {cajaNegra.length === 0 ? (
            <p className="empty-text">No hay eventos registrados recientemente en el sistema.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {cajaNegra.map((log) => (
                <div key={log.id} style={{
                  backgroundColor: 'rgba(255, 255, 255, 0.03)',
                  border: '1px solid rgba(255, 255, 255, 0.05)',
                  borderRadius: '8px',
                  padding: '12px 16px',
                  display: 'flex',
                  gap: '15px',
                  alignItems: 'center',
                  fontSize: '0.85rem'
                }}>
                  <span style={{ color: 'var(--text-muted)', whiteSpace: 'nowrap', fontFamily: 'monospace' }}>
                    [{log.fecha} {log.hora}]
                  </span>
                  <span style={{
                    color: log.tipo === 'success' ? '#1ed760' :
                           log.tipo === 'warning' ? '#f59e0b' :
                           log.tipo === 'error' ? '#ff4d6d' : '#3b82f6',
                    fontSize: '1.2rem',
                    lineHeight: 1
                  }}>
                    {log.tipo === 'success' ? '✅' : log.tipo === 'warning' ? '⚠️' : log.tipo === 'error' ? '❌' : 'ℹ️'}
                  </span>
                  <span style={{ color: 'var(--text-main)', flex: 1 }}>{log.evento}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}