const express = require('express');
const { crearContenedor } = require('./contenedor');
const { crearControladores } = require('./controllers/controladores');
const { crearRutas } = require('./routes/rutas');
const { requiereSesion } = require('./middlewares/autenticacion');
const { manejarErrores, rutaNoEncontrada } = require('./middlewares/errores');

/** Construye la aplicación Express. La misma app corre en Netlify (función) y en local (server.js). */
function crearApp(contenedor = crearContenedor()) {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '100kb' }));

  // CORS: necesario solo cuando las pantallas y la API están en dominios distintos (desarrollo local)
  app.use((req, res, next) => {
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    res.set('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
  });

  const rutas = crearRutas({
    c: crearControladores(contenedor.servicios),
    sesion: requiereSesion({
      verificarToken: contenedor.verificarToken,
      perfilRepositorio: contenedor.repos.perfilRepositorio,
    }),
  });

  // En Netlify la petición puede llegar como /api/... o como /.netlify/functions/api/...
  app.use(['/api', '/.netlify/functions/api'], rutas, rutaNoEncontrada);
  app.use(manejarErrores);
  return app;
}

module.exports = { crearApp };
