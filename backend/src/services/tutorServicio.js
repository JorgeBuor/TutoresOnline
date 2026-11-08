const { validar } = require('../utils/validar');
const { noEncontrado } = require('../utils/errores');
const { hoyEnZona } = require('../utils/fechas');

/** Búsqueda de tutores por materia, nivel, área geográfica y disponibilidad. */
class TutorServicio {
  constructor({ tutorRepositorio, zonaHoraria }) {
    this.tutores = tutorRepositorio;
    this.zona = zonaHoraria;
  }

  async buscar(consulta) {
    const fecha = validar.fecha(consulta.fecha, 'fecha', { requerido: false }) || hoyEnZona(this.zona);
    const filtros = {
      materiaId: validar.entero(consulta.materia_id, 'materia_id', { min: 1, requerido: false }),
      nivelId: validar.entero(consulta.nivel_id, 'nivel_id', { min: 1, requerido: false }),
      area: validar.texto(consulta.area, 'area', { requerido: false, max: 60 }),
      modalidad: validar.opcion(consulta.modalidad, 'modalidad', ['virtual', 'presencial'], { requerido: false }),
      ciudad: validar.texto(consulta.ciudad, 'ciudad', { requerido: false, max: 80 }),
      texto: validar.texto(consulta.texto, 'texto', { requerido: false, max: 80 }),
    };
    const soloConHorario = consulta.solo_disponibles === 'true';

    const tutores = await this.tutores.buscar(filtros);
    const libres = await this.tutores.horariosLibres(tutores.map((t) => t.docente_id), fecha, this.zona);
    const porDocente = new Map();
    for (const h of libres) {
      if (!porDocente.has(h.docente_id)) porDocente.set(h.docente_id, []);
      porDocente.get(h.docente_id).push({ hora: h.hora, inicio: h.inicio });
    }

    const resultado = tutores
      .map((t) => ({ ...t, horarios: porDocente.get(t.docente_id) || [] }))
      .filter((t) => !soloConHorario || t.horarios.length > 0);
    return { fecha, tutores: resultado };
  }

  async detalle(docenteId, consulta = {}) {
    const id = validar.uuid(docenteId, 'id');
    const fecha = validar.fecha(consulta.fecha, 'fecha', { requerido: false }) || hoyEnZona(this.zona);
    const tutor = await this.tutores.obtener(id);
    if (!tutor) throw noEncontrado('El tutor no existe');
    const [resenas, horarios] = await Promise.all([
      this.tutores.resenas(id),
      this.tutores.horariosLibres([id], fecha, this.zona),
    ]);
    return { ...tutor, fecha, resenas, horarios: horarios.map(({ hora, inicio }) => ({ hora, inicio })) };
  }
}

module.exports = { TutorServicio };
