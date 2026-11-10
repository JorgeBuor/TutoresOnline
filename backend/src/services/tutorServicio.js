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

  /**
   * Horarios libres de una fecha por cada oferta (docente + materia + nivel), según la cuadrícula de esa
   * materia, las clases ya tomadas y el Google Calendar del docente. Clave: "docente|materia|nivel".
   */
  async horariosDelDia(tutores, fecha, duracion = 60, filtro = {}) {
    const libres = await this.tutores.horariosLibres(tutores.map((t) => t.docente_id), fecha, this.zona, duracion, filtro);
    const porOferta = new Map();
    for (const h of libres) {
      const clave = `${h.docente_id}|${h.materia_id}|${h.nivel_id}`;
      if (!porOferta.has(clave)) porOferta.set(clave, []);
      porOferta.get(clave).push({ hora: h.hora, inicio: h.inicio, fin: h.fin, permite_virtual: h.permite_virtual });
    }
    if (this.ocupado) {
      await this.ocupado.filtrar(porOferta, new Set(tutores.filter((t) => t.google_conectado).map((t) => t.docente_id)));
    }
    return porOferta;
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
    const filtroHorario = { materiaId: filtros.materiaId, nivelId: filtros.nivelId, modalidad: filtros.modalidad };

    // Cada materia y nivel del docente es una oferta con su propia tarifa y sus propios horarios
    // Horas solo presenciales: no sirven si el docente dejó de ofrecer presencial
    const armar = (porOferta) => tutores.flatMap(({ google_conectado: _g, ...t }) => t.materias.map((m) => ({
      ...t,
      materias: [m],
      horarios: (porOferta.get(`${t.docente_id}|${m.materia_id}|${m.nivel_id}`) || [])
        .map((h) => ({ ...h, permite_virtual: h.permite_virtual && t.ofrece_virtual }))
        .filter((h) => h.permite_virtual || t.ofrece_presencial),
    })));

    const resultado = armar(await this.horariosDelDia(tutores, fecha, duracion, filtroHorario))
      .filter((o) => !soloConHorario || o.horarios.length > 0);

    // Si ese día nadie tiene horarios, se busca el próximo día que sí tenga, para ofrecerlo al estudiante
    let proximaFecha = null;
    if (consulta.proximo === 'true' && tutores.length && !resultado.some((o) => o.horarios.length)) {
      for (let n = 1; n <= DIAS_A_REVISAR && !proximaFecha; n += 1) {
        const dia = sumarDias(fecha, n);
        if (armar(await this.horariosDelDia(tutores, dia, duracion, filtroHorario)).some((o) => o.horarios.length)) proximaFecha = dia;
      }
    }
    return { fecha, duracion_min: duracion, tutores: resultado, total_materia: tutores.length, proxima_fecha: proximaFecha };
  }

  async detalle(docenteId, consulta = {}) {
    const id = validar.uuid(docenteId, 'id');
    const fecha = validar.fecha(consulta.fecha, 'fecha', { requerido: false }) || hoyEnZona(this.zona);
    const tutor = await this.tutores.obtener(id);
    if (!tutor) throw noEncontrado('El tutor no existe');
    const [resenas, porOferta] = await Promise.all([
      this.tutores.resenas(id),
      this.horariosDelDia([tutor], fecha),
    ]);
    const { google_conectado: _g, ...publico } = tutor;
    const materias = publico.materias.map((m) => ({ ...m, horarios: porOferta.get(`${id}|${m.materia_id}|${m.nivel_id}`) || [] }));
    // Todos los horarios del día, sin repetir, para quien no filtra por materia
    const vistos = new Set();
    const horarios = materias.flatMap((m) => m.horarios)
      .filter((h) => !vistos.has(h.hora) && vistos.add(h.hora))
      .sort((a, b) => new Date(a.inicio) - new Date(b.inicio));
    return { ...publico, materias, horarios, fecha, resenas };
  }
}

module.exports = { TutorServicio };
