/**
 * Punto de entrada de la API en Netlify Functions.
 * netlify.toml redirige todas las peticiones /api/* a esta función.
 */
const serverless = require('serverless-http');
const { crearApp } = require('../../backend/src/app');

let manejador;

exports.handler = async (evento, contexto) => {
  // Se crea una sola vez y se reutiliza mientras la función siga activa (menos conexiones a la base)
  if (!manejador) manejador = serverless(crearApp());
  return manejador(evento, contexto);
};
