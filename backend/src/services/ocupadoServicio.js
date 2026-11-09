/**
 * Cruza los horarios libres de la plataforma con el Google Calendar de cada docente:
 * si el docente tiene otro compromiso en su calendario, ese horario no se ofrece.
 * Si Google no responde, la búsqueda sigue funcionando con los horarios de la plataforma.
 */
const UNA_HORA = 60 * 60 * 1000;
const seCruzan = (a, b) => a.inicio < b.fin && b.inicio < a.fin;

class OcupadoServicio {
  constructor({ calendario }) {
    this.calendario = calendario;
  }

  /**
   * horariosPorDocente: Map(clave → [{ hora, inicio, fin }]) de un mismo día; la clave empieza por el id
   * del docente ("docente" o "docente|materia|nivel").
   * conGoogle: Set de docentes que conectaron Google (los demás no se consultan).
   */
  async filtrar(horariosPorDocente, conGoogle) {
    // Se pregunta a Google una sola vez por docente, cubriendo todas sus materias de ese día
    const porDocente = new Map();
    for (const [clave, horarios] of horariosPorDocente) {
      const docenteId = String(clave).split('|')[0];
      if (!horarios.length || !conGoogle.has(docenteId)) continue;
      if (!porDocente.has(docenteId)) porDocente.set(docenteId, []);
      porDocente.get(docenteId).push(clave);
    }
    const finDe = (h) => new Date(h.fin || new Date(h.inicio).getTime() + UNA_HORA);
    await Promise.all([...porDocente].map(async ([docenteId, claves]) => {
      const todos = claves.flatMap((c) => horariosPorDocente.get(c));
      const desde = new Date(Math.min(...todos.map((h) => new Date(h.inicio).getTime())));
      const hasta = new Date(Math.max(...todos.map((h) => finDe(h).getTime())));
      const { intervalos } = await this.calendario.ocupado(docenteId, desde, hasta);
      if (!intervalos.length) return;
      for (const clave of claves) {
        horariosPorDocente.set(clave, horariosPorDocente.get(clave).filter((h) => {
          const inicio = new Date(h.inicio);
          return !intervalos.some((o) => seCruzan({ inicio, fin: finDe(h) }, o));
        }));
      }
    }));
    return horariosPorDocente;
  }

  /** ¿El docente está libre en su Google Calendar en ese rango? (true si no conectó Google o si Google no responde) */
  async estaLibre(docenteId, inicio, fin) {
    const { intervalos } = await this.calendario.ocupado(docenteId, inicio, fin);
    return !intervalos.some((o) => seCruzan({ inicio: new Date(inicio), fin: new Date(fin) }, o));
  }

  /** Estado del permiso para mostrarlo al docente: 'ok', 'sin_permiso', 'sin_conexion' o 'error'. */
  async estado(docenteId) {
    const ahora = new Date();
    return (await this.calendario.ocupado(docenteId, ahora, new Date(ahora.getTime() + UNA_HORA))).estado;
  }
}

module.exports = { OcupadoServicio };
