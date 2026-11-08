const { validar } = require('../utils/validar');
const { noEncontrado, prohibido, conflicto, solicitudInvalida } = require('../utils/errores');

/**
 * Reserva en tiempo real estilo InDrive (funcionalidad opcional del enunciado):
 * el estudiante publica tema y precio sugerido, los docentes ofertan y el estudiante elige.
 */
class TiempoRealServicio {
  constructor({ db, tiempoRealRepositorio, tutoriaRepositorio, docenteRepositorio, tutoriaServicio, notificaciones }) {
    this.db = db;
    this.repo = tiempoRealRepositorio;
    this.tutorias = tutoriaRepositorio;
    this.docentes = docenteRepositorio;
    this.tutoriaServicio = tutoriaServicio;
    this.notificaciones = notificaciones;
  }

  crearSolicitud(usuario, cuerpo) {
    const modalidad = validar.opcion(cuerpo.modalidad ?? 'virtual', 'modalidad', ['virtual', 'presencial']);
    const ciudad = validar.texto(cuerpo.ciudad, 'ciudad', { requerido: false, max: 80 }) || usuario.ciudad || null;
    if (modalidad === 'presencial' && !ciudad) throw solicitudInvalida('Para una clase presencial indica la ciudad');
    return this.repo.crearSolicitud({
      estudianteId: usuario.id,
      materiaId: validar.entero(cuerpo.materia_id, 'materia_id', { min: 1 }),
      tema: validar.texto(cuerpo.tema, 'tema', { min: 3, max: 200 }),
      descripcion: validar.texto(cuerpo.descripcion, 'descripcion', { requerido: false, max: 1000 }),
      tarifaSugerida: validar.numero(cuerpo.tarifa_sugerida, 'tarifa_sugerida', { min: 1000, max: 10000000 }),
      duracionMin: validar.entero(cuerpo.duracion_min ?? 60, 'duracion_min', { min: 30, max: 240 }),
      modalidad,
      ciudad,
    });
  }

  async listar(usuario, consulta = {}) {
    await this.repo.expirarVencidas();
    if (usuario.rol === 'estudiante') return this.repo.misSolicitudes(usuario.id);
    const filtro = validar.opcion(consulta.filtro, 'filtro', ['todas', 'mis_materias', 'cercanas'], { requerido: false });
    return this.repo.solicitudesAbiertas(usuario.id, {
      soloMisMaterias: filtro === 'mis_materias',
      ciudad: filtro === 'cercanas' ? usuario.ciudad || '' : null,
    });
  }

  async detalle(usuario, id) {
    const solicitud = await this.repo.obtenerSolicitud(validar.entero(id, 'id', { min: 1 }));
    if (!solicitud) throw noEncontrado('La solicitud no existe');
    if (usuario.rol === 'estudiante') {
      if (solicitud.estudiante_id !== usuario.id) throw prohibido();
      return { ...solicitud, ofertas: await this.repo.ofertas(solicitud.id) };
    }
    if (solicitud.estado !== 'abierta') throw conflicto('Esta solicitud ya no está disponible');
    return solicitud;
  }

  async ofertar(usuario, id, cuerpo) {
    const solicitud = await this.repo.obtenerSolicitud(validar.entero(id, 'id', { min: 1 }));
    if (!solicitud) throw noEncontrado('La solicitud no existe');
    if (solicitud.estado !== 'abierta' || new Date(solicitud.expira_en) <= new Date()) {
      throw conflicto('Esta solicitud ya no recibe ofertas');
    }
    const docente = await this.docentes.obtener(usuario.id);
    const ofreceModalidad = solicitud.modalidad === 'virtual' ? docente.ofrece_virtual : docente.ofrece_presencial;
    if (!ofreceModalidad) throw solicitudInvalida(`No ofreces clases en modalidad ${solicitud.modalidad}`);

    return this.repo.crearOferta({
      solicitudId: solicitud.id,
      docenteId: usuario.id,
      tarifaOfertada: validar.numero(cuerpo.tarifa_ofertada ?? solicitud.tarifa_sugerida, 'tarifa_ofertada', { min: 1000, max: 10000000 }),
      minutosLlegada: validar.entero(cuerpo.minutos_llegada ?? 5, 'minutos_llegada', { min: 1, max: 120 }),
    });
  }

  /** El estudiante acepta una oferta (crea la tutoría) o el docente retira la suya. */
  async cambiarOferta(usuario, id, cuerpo) {
    const estado = validar.opcion(cuerpo.estado, 'estado', ['aceptada', 'retirada']);
    const oferta = await this.repo.obtenerOferta(validar.entero(id, 'id', { min: 1 }));
    if (!oferta) throw noEncontrado('La oferta no existe');

    if (estado === 'retirada') {
      if (oferta.docente_id !== usuario.id) throw prohibido();
      if (oferta.estado !== 'enviada') throw conflicto('Esta oferta ya no se puede retirar');
      return { oferta: await this.repo.cambiarEstadoOferta(oferta.id, 'retirada') };
    }

    if (usuario.rol !== 'estudiante') throw prohibido('Solo el estudiante puede aceptar ofertas');
    const tutoriaId = await this.db.transaccion((tx) => this.repo.con(tx).aceptarOferta(oferta.id, usuario.id));
    let tutoria = await this.tutorias.obtener(tutoriaId);
    tutoria = await this.tutoriaServicio.agendarEnCalendario(tutoria);
    await this.notificaciones.tutoriaConfirmada(tutoria);
    return { tutoria };
  }

  async cancelarSolicitud(usuario, id) {
    const solicitud = await this.repo.obtenerSolicitud(validar.entero(id, 'id', { min: 1 }));
    if (!solicitud) throw noEncontrado('La solicitud no existe');
    if (solicitud.estudiante_id !== usuario.id) throw prohibido();
    if (solicitud.estado !== 'abierta') throw conflicto('Esta solicitud ya no está abierta');
    return this.repo.cambiarEstadoSolicitud(solicitud.id, 'cancelada');
  }
}

module.exports = { TiempoRealServicio };
