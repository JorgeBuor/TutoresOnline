/**
 * Controladores: traducen HTTP a llamadas de servicio y la respuesta del servicio a JSON.
 * No contienen reglas de negocio; por eso son tan cortos.
 */
const responder = (accion, status = 200) => async (req, res, next) => {
  try {
    const datos = await accion(req);
    res.status(status).json(datos);
  } catch (error) {
    next(error);
  }
};

const crearControladores = (s) => ({
  sistema: {
    salud: responder(async () => ({ estado: 'ok', hora: new Date().toISOString() })),
    configuracionPublica: responder(async () => s.configuracionPublica),
  },
  catalogos: {
    todo: responder(() => s.catalogo.todo()),
  },
  perfil: {
    yo: responder((req) => s.perfil.yo(req.usuario)),
    actualizar: responder((req) => s.perfil.actualizar(req.usuario, req.body)),
    confirmarRol: responder((req) => s.perfil.confirmarRol(req.usuario, req.body)),
    conectarGoogle: responder((req) => s.perfil.conectarGoogle(req.usuario, req.body)),
    desconectarGoogle: responder((req) => s.perfil.desconectarGoogle(req.usuario)),
  },
  tutores: {
    buscar: responder((req) => s.tutores.buscar(req.query)),
    detalle: responder((req) => s.tutores.detalle(req.params.id, req.query)),
  },
  docente: {
    obtenerConfiguracion: responder((req) => s.docente.obtenerConfiguracion(req.usuario)),
    guardarConfiguracion: responder((req) => s.docente.guardarConfiguracion(req.usuario, req.body)),
  },
  tutorias: {
    listar: responder((req) => s.tutorias.listar(req.usuario, req.query)),
    obtener: responder((req) => s.tutorias.obtener(req.usuario, req.params.id)),
    reservar: responder((req) => s.tutorias.reservar(req.usuario, req.body), 201),
    cambiarEstado: responder((req) => s.tutorias.cambiarEstado(req.usuario, req.params.id, req.body)),
    calificar: responder((req) => s.tutorias.calificar(req.usuario, req.params.id, req.body), 201),
  },
  chat: {
    conversaciones: responder((req) => s.chat.conversaciones(req.usuario)),
    abrir: responder((req) => s.chat.abrir(req.usuario, req.body), 201),
    mensajes: responder((req) => s.chat.mensajes(req.usuario, req.params.id, req.query)),
    enviar: responder((req) => s.chat.enviar(req.usuario, req.params.id, req.body), 201),
  },
  tiempoReal: {
    crearSolicitud: responder((req) => s.tiempoReal.crearSolicitud(req.usuario, req.body), 201),
    listar: responder((req) => s.tiempoReal.listar(req.usuario, req.query)),
    detalle: responder((req) => s.tiempoReal.detalle(req.usuario, req.params.id)),
    cancelar: responder((req) => s.tiempoReal.cancelarSolicitud(req.usuario, req.params.id)),
    ofertar: responder((req) => s.tiempoReal.ofertar(req.usuario, req.params.id, req.body), 201),
    cambiarOferta: responder((req) => s.tiempoReal.cambiarOferta(req.usuario, req.params.id, req.body)),
  },
});

module.exports = { crearControladores };
