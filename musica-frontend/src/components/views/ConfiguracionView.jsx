import React, { useState, useRef } from 'react';

export default function ConfiguracionView({
  tareas,
  anuncios,
  historial,
  clientId,
  setClientId,
  clientSecret,
  setClientSecret,
  socket
}) {
  const [tabConfig, setTabConfig] = useState('credenciales');
  const fileInputRef = useRef(null);

  const handleGuardarCredencialesSpotify = (e) => {
    e.preventDefault();
    if (!clientId || !clientSecret) return;
    socket.emit('guardar_configuracion', { clientId, clientSecret });
  };

  const exportarBackup = () => {
    const backup = {
      fechaExportacion: new Date().toISOString(),
      tareas, anuncios, historial
    };
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `spotify-scheduler-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const importarBackupArchivo = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const contenido = JSON.parse(ev.target.result);
        if (!contenido.tareas && !contenido.historial && !contenido.anuncios) {
          return alert('⚠️ El archivo seleccionado no tiene un formato de backup válido.');
        }
        socket.emit('importar_backup', contenido);
      } catch (err) {
        alert('❌ Error al leer el archivo JSON.');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  return (
    <div className="config-scroll-wrapper">
      <h1 className="main-title">Configuración del Sistema</h1>

      <div className="config-tabs-bar">
        <button
          type="button"
          className={`config-tab-btn ${tabConfig === 'credenciales' ? 'active' : ''}`}
          onClick={() => setTabConfig('credenciales')}
        >
          🔑 Credenciales de Spotify
        </button>
        <button
          type="button"
          className={`config-tab-btn ${tabConfig === 'backup' ? 'active' : ''}`}
          onClick={() => setTabConfig('backup')}
        >
          💾 Copia de Seguridad
        </button>
      </div>

      {tabConfig === 'credenciales' && (
        <div className="glass-card">
          <h2>🔑 Credenciales de Spotify API</h2>
          <p className="config-desc">
            Modifica estos datos únicamente si cambiaste de aplicación en el panel de desarrolladores de Spotify.
          </p>
          <form className="config-form" onSubmit={handleGuardarCredencialesSpotify}>
            <div className="input-group stretch"><label>Client ID</label><input type="text" value={clientId} onChange={(e) => setClientId(e.target.value)} required /></div>
            <div className="input-group stretch" style={{ marginTop: '20px' }}><label>Client Secret</label><input type="password" value={clientSecret} onChange={(e) => setClientSecret(e.target.value)} required /></div>
            <div style={{ marginTop: '30px' }}><button type="submit" className="green-btn">Actualizar Credenciales de Spotify</button></div>
          </form>
        </div>
      )}

      {tabConfig === 'backup' && (
        <div className="glass-card">
          <h2>💾 Copia de Seguridad (Horarios, Anuncios e Historial)</h2>
          <p className="config-desc">
            Descarga un archivo JSON con todos tus horarios musicales, anuncios de voz programados e historial, o restaura una copia anterior.
          </p>
          <div className="backup-actions-row">
            <button type="button" className="green-btn" onClick={exportarBackup}>💾 Descargar Backup (.json)</button>
            <button type="button" className="outline-btn backup-upload-btn" onClick={() => fileInputRef.current?.click()}>📂 Importar Backup (.json)</button>
            <input type="file" accept=".json" ref={fileInputRef} onChange={importarBackupArchivo} style={{ display: 'none' }} />
          </div>
        </div>
      )}
    </div>
  );
}