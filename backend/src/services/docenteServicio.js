const { validar } = require('../utils/validar');
const { solicitudInvalida } = require('../utils/errores');

const aMinutos = (hora) => {
  const [h, m] = hora.split(':').map(Number);
  return h * 60 + m;
};

/** Pantalla "Disponibilidad": modalidades, materias con tarifa y cuadrícula semanal del docente. */
class DocenteServicio {
  constructor({ db, docenteRepositorio }) {
    this.db = db;
    this.docentes = docenteRepositorio;
  }

  async obtenerConfiguracion(usuario) {
    const [perfil, materias, disponibilidad] = await Promise.all([
      this.docentes.obtener(usuario.id),
      this.docentes.materias(usuario.id),
      this.docentes.disponibilidad(usuario.id),
    ]);
    return { perfil, materias, disponibilidad };
  }

  async guardarConfiguracion(usuario, cuerpo) {
    const ofreceVirtual = Boolean(cuerpo.ofrece_virtual);
    const ofrecePresencial = Boolean(cuerpo.ofrece_presencial);
    if (!ofreceVirtual && !ofrecePresencial) throw solicitudInvalida('Elige al menos una modalidad: virtual o presencial');

    const perfil = {
      ofrece_virtual: ofreceVirtual,
      ofrece_presencial: ofrecePresencial,
      zona_presencial: validar.texto(cuerpo.zona_presencial, 'zona_presencial', { requerido: false, max: 120 }),
      biografia: validar.texto(cuerpo.biografia, 'biografia', { requerido: false, max: 1000 }),
    };

    const vistas = new Set();
    const materias = validar.lista(cuerpo.materias ?? [], 'materias', { max: 30 }).map((m, i) => {
      const fila = {
        materia_id: validar.entero(m.materia_id, `materias[${i}].materia_id`, { min: 1 }),
        nivel_id: validar.entero(m.nivel_id, `materias[${i}].nivel_id`, { min: 1 }),
        tarifa_hora: validar.numero(m.tarifa_hora, `materias[${i}].tarifa_hora`, { min: 1000, max: 10000000 }),
      };
      const clave = `${fila.materia_id}-${fila.nivel_id}`;
      if (vistas.has(clave)) throw solicitudInvalida('Hay una materia repetida en el mismo nivel');
      vistas.add(clave);
      return fila;
    });

    const bloques = validar.lista(cuerpo.disponibilidad ?? [], 'disponibilidad', { max: 100 })
      .map((b, i) => {
        const bloque = {
          dia_semana: validar.entero(b.dia_semana, `disponibilidad[${i}].dia_semana`, { min: 0, max: 6 }),
          hora_inicio: validar.hora(b.hora_inicio, `disponibilidad[${i}].hora_inicio`),
          hora_fin: validar.hora(b.hora_fin, `disponibilidad[${i}].hora_fin`),
        };
        if (aMinutos(bloque.hora_fin) <= aMinutos(bloque.hora_inicio)) {
          throw solicitudInvalida('En la disponibilidad, la hora final debe ser mayor que la inicial');
        }
        return bloque;
      })
      .sort((a, b) => a.dia_semana - b.dia_semana || aMinutos(a.hora_inicio) - aMinutos(b.hora_inicio));

    for (let i = 1; i < bloques.length; i += 1) {
      const [anterior, actual] = [bloques[i - 1], bloques[i]];
      if (anterior.dia_semana === actual.dia_semana && aMinutos(actual.hora_inicio) < aMinutos(anterior.hora_fin)) {
        throw solicitudInvalida('Hay bloques de disponibilidad que se cruzan el mismo día');
      }
    }

    await this.db.transaccion(async (tx) => {
      const repo = this.docentes.con(tx);
      await repo.actualizarPerfil(usuario.id, perfil);
      await repo.reemplazarMaterias(usuario.id, materias);
      await repo.reemplazarDisponibilidad(usuario.id, bloques);
    });
    return this.obtenerConfiguracion(usuario);
  }
}

module.exports = { DocenteServicio };
