import React from 'react';

export default function QrModal({ mostrarModalQr, setMostrarModalQr, qrImageUrl, urlRemotaMovil }) {
  if (!mostrarModalQr) return null;

  return (
    <div className="qr-modal-overlay" onClick={() => setMostrarModalQr(false)}>
      <div className="qr-modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="qr-modal-header">
          <h3>📱 Control Remoto</h3>
          <button className="qr-close-btn" onClick={() => setMostrarModalQr(false)}>✖️</button>
        </div>
        <p className="qr-modal-desc">
          Asegúrate de que tu celular esté conectado a tu <strong>red Wi-Fi</strong> y escanea este código:
        </p>
        <div className="qr-image-wrapper">
          <img src={qrImageUrl} alt="Código QR de Red Local" className="qr-code-img" />
        </div>
        <div className="qr-url-box"><span>{urlRemotaMovil}</span></div>
        <p className="qr-modal-hint">Al abrirlo en el teléfono verás la interfaz de control simplificada.</p>
      </div>
    </div>
  );
}