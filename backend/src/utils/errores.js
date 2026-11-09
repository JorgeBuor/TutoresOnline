/** Error de negocio con código HTTP. Los servicios lanzan estos errores y el middleware los traduce. */
class ErrorApp extends Error {
  constructor(status, mensaje, codigo) {
    super(mensaje);
    this.status = status;
    this.codigo = codigo || 'error';
  }
}

const solicitudInvalida = (m) => new ErrorApp(400, m, 'solicitud_invalida');
const noAutenticado = (m = 'Debes iniciar sesión') => new ErrorApp(401, m, 'no_autenticado');
const prohibido = (m = 'No tienes permiso para esta acción') => new ErrorApp(403, m, 'prohibido');
const noEncontrado = (m = 'No encontrado') => new ErrorApp(404, m, 'no_encontrado');
const conflicto = (m) => new ErrorApp(409, m, 'conflicto');

module.exports = { ErrorApp, solicitudInvalida, noAutenticado, prohibido, noEncontrado, conflicto };
