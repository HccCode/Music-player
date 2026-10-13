export const DIAS_SEMANA = [
  { id: 1, label: 'L', nombre: 'Lunes' },
  { id: 2, label: 'M', nombre: 'Martes' },
  { id: 3, label: 'X', nombre: 'Miércoles' },
  { id: 4, label: 'J', nombre: 'Jueves' },
  { id: 5, label: 'V', nombre: 'Viernes' },
  { id: 6, label: 'S', nombre: 'Sábado' },
  { id: 0, label: 'D', nombre: 'Domingo' }
];

export const formatTime = (ms) => {
  if (!ms) return '0:00';
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
};

export const toggleDiaEnLista = (setter, diaId) => {
  setter(prev => {
    if (prev.includes(diaId)) {
      if (prev.length === 1) return prev;
      return prev.filter(d => d !== diaId);
    }
    return [...prev, diaId];
  });
};

export const obtenerProximaAlarma = (tareas, ahora) => {
  const activas = tareas.filter(t => t.activa !== false);
  if (activas.length === 0) return null;

  let menorDiffMs = Infinity;
  let tareaMasProxima = null;

  activas.forEach(tarea => {
    const h = parseInt(tarea.hora, 10);
    const m = parseInt(tarea.minuto, 10);
    if (isNaN(h) || isNaN(m)) return;

    const diasValidos = Array.isArray(tarea.dias) && tarea.dias.length > 0
      ? tarea.dias
      : [1, 2, 3, 4, 5, 6, 0];

    for (let offset = 0; offset <= 7; offset++) {
      const candidato = new Date(ahora);
      candidato.setDate(ahora.getDate() + offset);
      candidato.setHours(h, m, 0, 0);

      if (candidato <= ahora) continue;

      if (diasValidos.includes(candidato.getDay())) {
        const diff = candidato - ahora;
        if (diff < menorDiffMs) {
          menorDiffMs = diff;
          tareaMasProxima = tarea;
        }
        break;
      }
    }
  });

  if (!tareaMasProxima || menorDiffMs === Infinity) return null;

  const totalSeconds = Math.floor(menorDiffMs / 1000);
  const dias = Math.floor(totalSeconds / 86400);
  const horas = Math.floor((totalSeconds % 86400) / 3600);
  const minutos = Math.floor((totalSeconds % 3600) / 60);
  const segundos = totalSeconds % 60;

  let partes = [];
  if (dias > 0) partes.push(`${dias}d`);
  if (horas > 0) partes.push(`${horas}h`);
  if (minutos > 0) partes.push(`${minutos}m`);
  if (dias === 0 && horas === 0 && minutos === 0) {
    partes.push(`${segundos}s`);
  }

  return {
    nombre: tareaMasProxima.nombre || tareaMasProxima.ruta,
    horaStr: `${tareaMasProxima.hora.toString().padStart(2, '0')}:${tareaMasProxima.minuto.toString().padStart(2, '0')}`,
    tiempoRestante: partes.join(' ')
  };
};

// Motor del locutor: Hora + Clima + Audio Ducking (10% música / % regulado voz)
export const ejecutarLocutorConClima = async ({
  textoPersonalizado,
  opciones = {},
  socket,
  playerRef,
  vozVolumenDefault = 50,
  vozNombreDefault = ''
}) => {
  if (!('speechSynthesis' in window)) {
    alert("Tu navegador no soporta el asistente de voz.");
    return;
  }
  window.speechSynthesis.cancel();

  const textoLimpiado = typeof textoPersonalizado === 'string' ? textoPersonalizado : '';
  const esAlarmaMusical = Boolean(opciones.esAlarmaMusical);
  const fadeInAlTerminar = Boolean(opciones.fadeInAlTerminar);
  const nivelVolumenVoz = opciones.volumenVoz !== undefined ? opciones.volumenVoz : vozVolumenDefault;
  const nombreVozElegida = opciones.vozNombre !== undefined ? opciones.vozNombre : vozNombreDefault;

  socket.emit('duck_audio_inicio', { esAlarmaMusical });
  if (playerRef?.current) {
    playerRef.current.setVolume(0.10).catch(() => {});
  }

  let climaTexto = "";
  try {
    const res = await fetch('https://api.open-meteo.com/v1/forecast?latitude=32.6278&longitude=-115.4545&current_weather=true');
    const data = await res.json();
    const temperatura = Math.round(data.current_weather.temperature);
    climaTexto = `La temperatura actual es de ${temperatura} grados.`;
  } catch (e) {
    console.error("No se pudo obtener el clima:", e);
  }

  const horaLocal = new Date();
  const hora12 = horaLocal.getHours() % 12 || 12;
  const minutos = horaLocal.getMinutes();
  const minutosStr = minutos === 0 ? "en punto" : `con ${minutos} minutos`;
  const preHora = hora12 === 1 ? "Es la una" : `Son las ${hora12}`;
  
  const mensajeAmigable = `¡Hola! ${preHora} ${minutosStr}. ${climaTexto} ${textoLimpiado}`;

  const utterance = new SpeechSynthesisUtterance(mensajeAmigable);
  utterance.lang = 'es-MX';
  utterance.rate = 0.96;
  utterance.pitch = 1.08;
  utterance.volume = Math.max(0.1, Math.min(1, nivelVolumenVoz / 100));

  const voces = window.speechSynthesis.getVoices();
  let vozIdeal = null;

  if (nombreVozElegida) {
    vozIdeal = voces.find(v => v.name === nombreVozElegida);
  }

  if (!vozIdeal) {
    const nombresFemeninos = ['sabina', 'paulina', 'dalia', 'monica', 'mia', 'lucia', 'gloria', 'laura', 'helena', 'paloma', 'google español'];
    vozIdeal = voces.find(v => v.lang.includes('es') && nombresFemeninos.some(n => v.name.toLowerCase().includes(n)));
  }
  if (!vozIdeal) vozIdeal = voces.find(v => v.lang === 'es-MX' && v.name.toLowerCase().includes('female'));
  if (!vozIdeal) vozIdeal = voces.find(v => v.lang === 'es-MX');
  if (!vozIdeal) vozIdeal = voces.find(v => v.lang.startsWith('es'));

  if (vozIdeal) {
    utterance.voice = vozIdeal;
    utterance.lang = vozIdeal.lang || 'es-MX';
  }

  const restaurarMusica = () => {
    socket.emit('duck_audio_fin', { esAlarmaMusical, fadeInAlTerminar });
    if (playerRef?.current && !fadeInAlTerminar) {
      playerRef.current.setVolume(0.80).catch(() => {});
    }
  };

  utterance.onend = restaurarMusica;
  utterance.onerror = restaurarMusica;

  window.speechSynthesis.speak(utterance);
};