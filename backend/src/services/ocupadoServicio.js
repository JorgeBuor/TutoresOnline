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
   * horariosPorDocente: Map(docenteId → [{ hora, inicio, fin }]) de un mismo día.
   * conGoogle: Set de docentes que conectaron Google (los demás no se consultan).
   */
  async filtrar(horariosPorDocente, conGoogle) {
    await Promise.all([...horariosPorDocente].map(async ([docenteId, horarios]) => {
      if (!horarios.length || !conGoogle.has(docenteId)) return;
      const desde = new Date(horarios[0].inicio);
      const hasta = new Date(horarios[horarios.length - 1].fin || new Date(horarios[horarios.length - 1].inicio).getTime() + UNA_HORA);
      const { intervalos } = await this.calendario.ocupado(docenteId, desde, hasta);
      if (!intervalos.length) return;
      horariosPorDocente.set(docenteId, horarios.filter((h) => {
        const inicio = new Date(h.inicio);
        const fin = h.fin ? new Date(h.fin) : new Date(inicio.getTime() + UNA_HORA);
        return !intervalos.some((o) => seCruzan({ inicio, fin }, o));
      }));
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
