const { ErrorApp } = require('../utils/errores');

/**
 * Traduce cualquier error a una respuesta JSON uniforme: { error: { codigo, mensaje } }.
 * Los errores de reglas que cuida la base de datos se convierten en mensajes claros.
 */
function manejarErrores(error, _req, res, _next) {
  if (error instanceof ErrorApp) {
    return res.status(error.status).json({ error: { codigo: error.codigo, mensaje: error.message } });
  }

  if (error.type === 'entity.parse.failed') {
    return res.status(400).json({ error: { codigo: 'solicitud_invalida', mensaje: 'El cuerpo de la petición no es JSON válido' } });
  }

  switch (error.code) {
    case '23P01': // restricción de exclusión: cruce de horarios
      return res.status(409).json({ error: { codigo: 'conflicto', mensaje: 'El docente ya tiene una clase en ese horario' } });
    case '23505': // valor repetido
      return res.status(409).json({ error: { codigo: 'conflicto', mensaje: 'Ese registro ya existe' } });
    case '23503': // referencia inexistente
      return res.status(400).json({ error: { codigo: 'solicitud_invalida', mensaje: 'Alguno de los datos enviados no existe' } });
    case '23514': // regla de validación de la tabla
      return res.status(400).json({ error: { codigo: 'solicitud_invalida', mensaje: 'Los datos no cumplen las reglas de la plataforma' } });
    case 'P0001': // excepción lanzada por una función de la base
      return res.status(400).json({ error: { codigo: 'regla_de_negocio', mensaje: error.message } });
    default:
      console.error(error);
      return res.status(500).json({ error: { codigo: 'error_interno', mensaje: 'Ocurrió un error inesperado' } });
  }
}

function rutaNoEncontrada(_req, res) {
  res.status(404).json({ error: { codigo: 'no_encontrado', mensaje: 'Esa dirección de la API no existe' } });
}

module.exports = { manejarErrores, rutaNoEncontrada };
