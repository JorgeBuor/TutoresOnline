/** Utilidades de fecha en la zona horaria de la plataforma (Colombia por defecto). */
function hoyEnZona(zonaHoraria, fecha = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: zonaHoraria, year: 'numeric', month: '2-digit', day: '2-digit' })
    .format(fecha);
}

function textoFechaHora(fecha, zonaHoraria) {
  return new Intl.DateTimeFormat('es-CO', {
    timeZone: zonaHoraria, weekday: 'long', day: 'numeric', month: 'long', hour: 'numeric', minute: '2-digit',
  }).format(new Date(fecha));
}

function sumarMinutos(fecha, minutos) {
  return new Date(new Date(fecha).getTime() + minutos * 60000);
}

module.exports = { hoyEnZona, textoFechaHora, sumarMinutos };
