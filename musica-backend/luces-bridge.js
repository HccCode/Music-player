const express = require('express');
const TuyaDevice = require('tuyapi');

const app = express();
app.use(express.json());

const foco = new TuyaDevice({
  id: 'ID_DE_TU_FOCO_LLOYDS',
  key: 'LLAVE_LOCAL_EXTRAIDA'
});

foco.find().then(() => foco.connect());

app.post('/luces-rgb', async (req, res) => {
    const { r, g, b } = req.body;
    // Convierte el RGB de tu panel al formato HSV que usa Tuya
    // y envía el comando localmente en milisegundos
    await foco.set({
        multiple: true,
        data: {
            '24': convertRgbToTuyaHsv(r, g, b), // ID del color en Tuya
            '20': true // Encender
        }
    });
    res.sendStatus(200);
});

app.listen(1880, () => console.log('Puente de luces local activo en el puerto 1880'));