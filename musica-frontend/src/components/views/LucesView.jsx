import React from 'react';

export default function LucesView({
  lucesActivadas,
  setLucesActivadas,
  lucesWebhook,
  setLucesWebhook,
  tuyaId,
  setTuyaId,
  tuyaKey,
  setTuyaKey,
  socket
}) {
  
  const guardarAjustes = () => {
    socket.emit('guardar_luces', { 
      lucesActivadas, 
      lucesWebhook, 
      tuyaId, 
      tuyaKey 
    });
    alert('Ajustes de iluminación guardados exitosamente.');
  };

  return (
    <div className="config-scroll-wrapper">
      <h1 className="main-title">Luces Inteligentes (Ambilight)</h1>
      
      <div className="glass-card">
        <h2>💡 Sincronización RGB (Tuya / Lloyd's)</h2>
        <p className="config-desc">
          Sincroniza tus focos Wi-Fi para que cambien al color de la portada de la canción y recibas pulsos de luz con el locutor.
        </p>

        <div className="config-form" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '22px' }}>
          
          <label className={`fade-toggle-pill ${lucesActivadas ? 'active' : ''}`} style={{ cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={lucesActivadas}
              onChange={(e) => {
                const nuevoEstado = e.target.checked;
                setLucesActivadas(nuevoEstado);
                socket.emit('guardar_luces', { lucesActivadas: nuevoEstado, lucesWebhook, tuyaId, tuyaKey });
              }}
            />
            <span>{lucesActivadas ? '🟢 Sincronización Activada' : '⚪ Sincronización Desactivada'}</span>
          </label>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '15px', width: '100%' }}>
            <div className="input-group stretch" style={{ flex: '1 1 200px' }}>
              <label>Device ID (Tuya/Lloyd's)</label>
              <input
                type="text"
                placeholder="Ej. eb1234567890abcdef"
                value={tuyaId}
                onChange={(e) => setTuyaId(e.target.value)}
              />
            </div>

            <div className="input-group stretch" style={{ flex: '1 1 200px' }}>
              <label>Local Key</label>
              <input
                type="text"
                placeholder="Ej. 1234abcd5678efgh"
                value={tuyaKey}
                onChange={(e) => setTuyaKey(e.target.value)}
              />
            </div>
          </div>

          <div className="input-group stretch" style={{ width: '100%' }}>
            <label>URL del Puente Local (Opcional si usas webhook externo)</label>
            <input
              type="text"
              placeholder="Ej. http://127.0.0.1:1880/luces-rgb"
              value={lucesWebhook}
              onChange={(e) => setLucesWebhook(e.target.value)}
            />
          </div>

          <button
            type="button"
            className="green-btn"
            onClick={guardarAjustes}
          >
            💾 Guardar Ajustes de Luces
          </button>
        </div>
      </div>

      <div className="glass-card" style={{ marginTop: '20px' }}>
        <h3>🔍 ¿Cómo obtener mi ID y Local Key?</h3>
        <p className="config-desc" style={{ fontSize: '0.9rem', lineHeight: '1.6' }}>
          Para que el control por red local funcione sin retrasos, el panel necesita las llaves de encriptación de tus focos Lloyd's. <br/><br/>
          1. Crea una cuenta gratuita en la plataforma para desarrolladores <strong>iot.tuya.com</strong>.<br/>
          2. Vincula tu aplicación de Smart Life (o Lloyd's Smart).<br/>
          3. Utiliza la herramienta de terminal <code>tuya-cli wizard</code> en tu PC para extraer la lista de tus focos junto con sus llaves locales (Local Key).
        </p>
      </div>
    </div>
  );
}