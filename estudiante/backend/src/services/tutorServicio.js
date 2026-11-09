const { validar } = require('../utils/validar');
const { noEncontrado, solicitudInvalida } = require('../utils/errores');
const { hoyEnZona } = require('../utils/fechas');

const DIAS_A_REVISAR = 14;
const sumarDias = (fecha, n) => {
  const d = new Date(`${fecha}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

/** Búsqueda de tutores por materia, nivel, área geográfica y disponibilidad. */
class TutorServicio {
  constructor({ tutorRepositorio, ocupado, zonaHoraria }) {
    this.tutores = tutorRepositorio;
    this.ocupado = ocupado;
    this.zona = zonaHoraria;
  }

  /** Horarios libres de cada docente en una fecha: plataforma (disponibilidad menos clases) y Google Calendar. */
  async horariosDelDia(tutores, fecha, duracion = 60) {
    const libres = await this.tutores.horariosLibres(tutores.map((t) => t.docente_id), fecha, this.zona, duracion);
    const porDocente = new Map(tutores.map((t) => [t.docente_id, []]));
    for (const h of libres) porDocente.get(h.docente_id)?.push({ hora: h.hora, inicio: h.inicio, fin: h.fin });
    if (this.ocupado) {
      await this.ocupado.filtrar(porDocente, new Set(tutores.filter((t) => t.google_conectado).map((t) => t.docente_id)));
    }
    return porDocente;
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
    const duracion = validar.entero(consulta.duracion_min ?? 60, 'duracion_min', { min: 60, max: 240 });
    if (duracion % 30 !== 0) throw solicitudInvalida('La duración debe ser en bloques de 30 minutos');

    const tutores = await this.tutores.buscar(filtros);
    const porDocente = await this.horariosDelDia(tutores, fecha, duracion);
    const resultado = tutores
      .map(({ google_conectado: _g, ...t }) => ({ ...t, horarios: porDocente.get(t.docente_id) || [] }))
      .filter((t) => !soloConHorario || t.horarios.length > 0);

    // Si ese día nadie tiene horarios, se busca el próximo día que sí tenga, para ofrecerlo al estudiante
    let proximaFecha = null;
    if (consulta.proximo === 'true' && tutores.length && !resultado.some((t) => t.horarios.length)) {
      for (let n = 1; n <= DIAS_A_REVISAR && !proximaFecha; n += 1) {
        const dia = sumarDias(fecha, n);
        const horarios = await this.horariosDelDia(tutores, dia, duracion);
        if ([...horarios.values()].some((h) => h.length)) proximaFecha = dia;
      }
    }
    return { fecha, duracion_min: duracion, tutores: resultado, total_materia: tutores.length, proxima_fecha: proximaFecha };
  }

  async detalle(docenteId, consulta = {}) {
    const id = validar.uuid(docenteId, 'id');
    const fecha = validar.fecha(consulta.fecha, 'fecha', { requerido: false }) || hoyEnZona(this.zona);
    const tutor = await this.tutores.obtener(id);
    if (!tutor) throw noEncontrado('El tutor no existe');
    const [resenas, horarios] = await Promise.all([
      this.tutores.resenas(id),
      this.horariosDelDia([tutor], fecha),
    ]);
    const { google_conectado: _g, ...publico } = tutor;
    return { ...publico, fecha, resenas, horarios: horarios.get(id) || [] };
  }
}

module.exports = { TutorServicio };
