const os = require('os');

function obtenerIpLocal() {
    const interfaces = os.networkInterfaces();
    let ipFallback = '127.0.0.1';
    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
            if (iface.family === 'IPv4' && !iface.internal) {
                if (iface.address.startsWith('192.168.') || iface.address.startsWith('10.')) {
                    return iface.address;
                }
                ipFallback = iface.address;
            }
        }
    }
    return ipFallback;
}

function lanzarAlertaFocos(appConfig) {
    if (!appConfig.lucesActivadas || !appConfig.lucesWebhook) return;
    try {
        const { URL } = require('url');
        const targetUrl = appConfig.lucesWebhook + (appConfig.lucesWebhook.includes('?') ? '&' : '?') + 'alerta=true';
        const target = new URL(targetUrl);
        const lib = target.protocol === 'https:' ? require('https') : require('http');
        const req = lib.request(target, { method: 'POST' });
        req.on('error', () => {}); 
        req.end();
    } catch(e) {}
}

function parseYoutubeId(input) {
    if (!input || typeof input !== 'string') return null;
    const url = input.trim();
    const regex = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?|shorts|live)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/i;
    const match = url.match(regex);
    return match ? match[1] : null;
}

function parseSpotifyUri(input) {
    let uri = input.trim();
    if (uri.includes('spotify.com')) {
        const match = uri.match(/(track|playlist|album)\/([a-zA-Z0-9]+)/);
        if (match) return `spotify:${match[1]}:${match[2]}`;
    }
    return uri;
}

const esperar = (ms) => new Promise(resolve => setTimeout(resolve, ms));

module.exports = { obtenerIpLocal, lanzarAlertaFocos, parseYoutubeId, parseSpotifyUri, esperar };