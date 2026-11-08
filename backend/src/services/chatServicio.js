const { validar } = require('../utils/validar');
const { noEncontrado, prohibido, solicitudInvalida } = require('../utils/errores');

/** Mensajería entre estudiante y docente para coordinar cada tutoría. */
class ChatServicio {
  constructor({ chatRepositorio, perfilRepositorio }) {
    this.chat = chatRepositorio;
    this.perfiles = perfilRepositorio;
  }

  conversaciones(usuario) {
    return this.chat.conversaciones(usuario.id);
  }

  /** Abre (o reutiliza) la conversación con otra persona. Siempre es entre un estudiante y un docente. */
  async abrir(usuario, cuerpo) {
    const otroId = validar.uuid(cuerpo.con_usuario_id, 'con_usuario_id');
    const otro = await this.perfiles.obtener(otroId);
    if (!otro) throw noEncontrado('La persona no existe');
    if (otro.rol === usuario.rol) throw solicitudInvalida('El chat es entre un estudiante y un docente');
    const [estudianteId, docenteId] = usuario.rol === 'estudiante' ? [usuario.id, otroId] : [otroId, usuario.id];
    return this.chat.buscarOCrear(estudianteId, docenteId);
  }

  async conversacionPropia(usuario, id) {
    const conversacion = await this.chat.obtener(validar.entero(id, 'id', { min: 1 }));
    if (!conversacion) throw noEncontrado('La conversación no existe');
    if (![conversacion.estudiante_id, conversacion.docente_id].includes(usuario.id)) throw prohibido();
    return conversacion;
  }

  async mensajes(usuario, id, consulta = {}) {
    const conversacion = await this.conversacionPropia(usuario, id);
    const despuesDe = validar.entero(consulta.despues_de, 'despues_de', { min: 0, requerido: false });
    await this.chat.marcarLeidos(conversacion.id, usuario.id);
    return this.chat.mensajes(conversacion.id, despuesDe);
  }

  async enviar(usuario, id, cuerpo) {
    const conversacion = await this.conversacionPropia(usuario, id);
    const contenido = validar.texto(cuerpo.contenido, 'contenido', { max: 2000 });
    return this.chat.crearMensaje(conversacion.id, usuario.id, contenido);
  }
}

module.exports = { ChatServicio };
