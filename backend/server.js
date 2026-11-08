/**
 * Servidor para desarrollo local: sirve las pantallas (carpeta frontend) y la API en el mismo puerto.
 * Uso: npm run dev   →   http://localhost:8888
 */
const path = require('path');
const fs = require('fs');
const express = require('express');

// Carga variables desde .env si existe (sin librerías extra)
const archivoEnv = path.join(__dirname, '..', '.env');
if (fs.existsSync(archivoEnv)) {
  for (const linea of fs.readFileSync(archivoEnv, 'utf8').split('\n')) {
    const m = linea.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, '');
  }
}

const { crearApp } = require('./src/app');

const puerto = Number(process.env.PORT) || 8888;
const servidor = express();
servidor.use(crearApp());
servidor.use(express.static(path.join(__dirname, '..', 'frontend'), { extensions: ['html'] }));
servidor.listen(puerto, () => console.log(`TutoresOn-Line en http://localhost:${puerto}`));
