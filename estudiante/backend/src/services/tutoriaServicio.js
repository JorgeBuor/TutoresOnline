const { validar } = require('../utils/validar');
const { solicitudInvalida, prohibido, noEncontrado, conflicto } = require('../utils/errores');
const { sumarMinutos } = require('../utils/fechas');

/**
 * Reglas para pasar de un estado a otro. Agregar un estado nuevo solo exige
 * agregar una regla aquí, sin tocar el resto del servicio (abierto/cerrado).
 */
const TRANSICIONES = {
  confirmada: { quien: 'docente', desde: ['pendiente'] },
  rechazada: { quien: 'docente', desde: ['pendiente'] },
  cancelada: { quien: 'ambos', desde: ['pendiente', 'confirmada'], soloAntesDelInicio: true },
  completada: { quien: 'docente', desde: ['confirmada'], soloDespuesDelInicio: true },
};

class TutoriaServicio {
  constructor({ tutoriaRepositorio, tutorRepositorio, docenteRepositorio, notificaciones, calendario, ocupado, zonaHoraria }) {
    this.ocupado = ocupado;
    this.tutorias = tutoriaRepositorio;
    this.tutores = tutorRepositorio;
    this.docentes = docenteRepositorio;
    this.notificaciones = notificaciones;
    this.calendario = calendario;
    this.zona = zonaHoraria;
  }

  /** Un estudiante reserva un horario dentro de la disponibilidad del docente. Queda pendiente de aceptación. */
  async reservar(usuario, cuerpo) {
    const docenteId = validar.uuid(cuerpo.docente_id, 'docente_id');
    const materiaId = validar.entero(cuerpo.materia_id, 'materia_id', { min: 1 });
    const nivelId = validar.entero(cuerpo.nivel_id, 'nivel_id', { min: 1, requerido: false });
    const inicio = validar.fechaHora(cuerpo.inicio, 'inicio');
    const duracion = validar.entero(cuerpo.duracion_min ?? 60, 'duracion_min', { min: 30, max: 240 });
    const modalidad = validar.opcion(cuerpo.modalidad, 'modalidad', ['virtual', 'presencial']);
    const lugarPedido = validar.texto(cuerpo.lugar, 'lugar', { requerido: false, max: 200 });

    if (duracion % 30 !== 0) throw solicitudInvalida('La duración debe ser en bloques de 30 minutos');
    if (inicio <= new Date()) throw solicitudInvalida('La clase debe ser en una fecha futura');
    if (docenteId === usuario.id) throw solicitudInvalida('No puedes reservarte una clase a ti mismo');

    const docente = await this.docentes.obtener(docenteId);
    if (!docente) throw noEncontrado('El docente no existe');
    if (modalidad === 'virtual' && !docente.ofrece_virtual) throw solicitudInvalida('Este docente no da clases virtuales');
    if (modalidad === 'presencial' && !docente.ofrece_presencial) throw solicitudInvalida('Este docente no da clases presenciales');

    const tarifa = await this.tutores.tarifa(docenteId, materiaId, nivelId);
    if (!tarifa) throw solicitudInvalida('El docente no enseña esa materia');

    const fin = sumarMinutos(inicio, duracion);
    const disponible = await this.tutores.dentroDeDisponibilidad(docenteId, inicio, fin, this.zona);
    if (!disponible) throw conflicto('Ese horario no está dentro de la disponibilidad del docente');
    if (this.ocupado && docente.google_conectado && !(await this.ocupado.estaLibre(docenteId, inicio, fin))) {
      throw conflicto('El docente tiene otro compromiso en ese horario. Elige otra hora.');
    }

    const tutoria = await this.tutorias.crear({
      estudianteId: usuario.id,
      docenteId,
      materiaId,
      inicio,
      fin,
      modalidad,
      lugar: modalidad === 'presencial' ? lugarPedido || docente.zona_presencial || 'Por acordar en el chat' : null,
      tarifaHora: tarifa.tarifa_hora,
    });

    await this.notificaciones.tutoriaSolicitada(tutoria);
    return tutoria;
  }

  listar(usuario, { vista } = {}) {
    const ahora = new Date();
    switch (vista) {
      case 'proximas':
        return this.tutorias.listar(usuario.id, { estados: ['pendiente', 'confirmada'], desde: ahora });
      case 'pendientes':
        return this.tutorias.listar(usuario.id, { estados: ['pendiente'], desde: ahora });
      case 'virtuales':
        return this.tutorias.listar(usuario.id, { estados: ['confirmada'], desde: ahora, modalidad: 'virtual' });
      case 'historial':
        return this.tutorias.listar(usuario.id, { estados: ['completada', 'confirmada'], hasta: ahora });
      default:
        return this.tutorias.listar(usuario.id);
    }
  }

  async obtener(usuario, id) {
    const tutoria = await this.tutorias.obtener(validar.entero(id, 'id', { min: 1 }));
    if (!tutoria) throw noEncontrado('La tutoría no existe');
    if (![tutoria.estudiante_id, tutoria.docente_id].includes(usuario.id)) throw prohibido();
    return tutoria;
  }

  async cambiarEstado(usuario, id, cuerpo) {
    const nuevo = validar.opcion(cuerpo.estado, 'estado', Object.keys(TRANSICIONES));
    const regla = TRANSICIONES[nuevo];
    const tutoria = await this.obtener(usuario, id);

    const esDocente = usuario.id === tutoria.docente_id;
    if (regla.quien === 'docente' && !esDocente) throw prohibido('Solo el docente puede hacer este cambio');
    if (!regla.desde.includes(tutoria.estado)) {
      throw conflicto(`No se puede pasar de "${tutoria.estado}" a "${nuevo}"`);
    }
    const yaEmpezo = new Date(tutoria.inicio) <= new Date();
    if (regla.soloAntesDelInicio && yaEmpezo) throw conflicto('La clase ya empezó, no se puede cancelar');
    if (regla.soloDespuesDelInicio && !yaEmpezo) throw conflicto('Solo puedes completar una clase que ya empezó');

    let actualizada = await this.tutorias.cambiarEstado(tutoria.id, nuevo);

    if (nuevo === 'confirmada') {
      actualizada = await this.agendarEnCalendario(actualizada);
      await this.notificaciones.tutoriaConfirmada(actualizada);
    } else if (nuevo === 'rechazada') {
      await this.notificaciones.tutoriaRechazada(actualizada);
    } else if (nuevo === 'cancelada') {
      await this.calendario.cancelarEvento(tutoria.docente_id, tutoria.google_event_id).catch((e) => console.error(e.message));
      await this.notificaciones.tutoriaCancelada(actualizada, usuario.id);
    }
    return actualizada;
  }

  /** Crea el evento en Google Calendar (con Meet si es virtual). Si falla, la tutoría sigue confirmada. */
  async agendarEnCalendario(tutoria) {
    try {
      const evento = await this.calendario.crearEvento({
        organizadorId: tutoria.docente_id,
        titulo: `Tutoría de ${tutoria.materia} · TutoresOn-Line`,
        descripcion: `Tutoría entre ${tutoria.docente} y ${tutoria.estudiante}.`,
        inicio: tutoria.inicio,
        fin: tutoria.fin,
        invitados: [tutoria.estudiante_email],
        conMeet: tutoria.modalidad === 'virtual',
      });
      if (evento) {
        await this.tutorias.guardarEvento(tutoria.id, evento);
        return this.tutorias.obtener(tutoria.id);
      }
    } catch (error) {
      console.error('No se pudo crear el evento en Google Calendar:', error.message);
    }
    return tutoria;
  }

  /** El estudiante califica de 1 a 5 estrellas una tutoría completada (reputación del docente). */
  async calificar(usuario, id, cuerpo) {
    const tutoria = await this.obtener(usuario, id);
    if (usuario.id !== tutoria.estudiante_id) throw prohibido('Solo el estudiante de la clase puede calificarla');
    if (tutoria.estado !== 'completada') throw conflicto('Solo se pueden calificar tutorías completadas');
    if (tutoria.calificacion) throw conflicto('Ya calificaste esta tutoría');

    return this.tutorias.crearResena({
      tutoriaId: tutoria.id,
      estudianteId: usuario.id,
      docenteId: tutoria.docente_id,
      estrellas: validar.entero(cuerpo.estrellas, 'estrellas', { min: 1, max: 5 }),
      comentario: validar.texto(cuerpo.comentario, 'comentario', { requerido: false, max: 1000 }),
    });
  }
}

module.exports = { TutoriaServicio };
