const { validar } = require('../utils/validar');
const { solicitudInvalida } = require('../utils/errores');

const aMinutos = (hora) => {
  const [h, m] = hora.split(':').map(Number);
  return h * 60 + m;
};

/** Valida los bloques de una cuadrícula y comprueba que no se crucen el mismo día. */
function validarBloques(lista, campo) {
  const bloques = validar.lista(lista ?? [], campo, { max: 100 })
    .map((b, i) => {
      const bloque = {
        dia_semana: validar.entero(b.dia_semana, `${campo}[${i}].dia_semana`, { min: 0, max: 6 }),
        hora_inicio: validar.hora(b.hora_inicio, `${campo}[${i}].hora_inicio`),
        hora_fin: validar.hora(b.hora_fin, `${campo}[${i}].hora_fin`),
        // virtual = horas virtuales (también sirven para presencial); presencial = solo presencial
        modalidad: validar.opcion(b.modalidad ?? 'virtual', `${campo}[${i}].modalidad`, ['virtual', 'presencial']),
      };
      if (aMinutos(bloque.hora_fin) <= aMinutos(bloque.hora_inicio)) {
        throw solicitudInvalida('En la disponibilidad, la hora final debe ser mayor que la inicial');
      }
      return bloque;
    })
    .sort((x, y) => x.dia_semana - y.dia_semana || aMinutos(x.hora_inicio) - aMinutos(y.hora_inicio));
  for (let i = 1; i < bloques.length; i += 1) {
    const [anterior, actual] = [bloques[i - 1], bloques[i]];
    if (anterior.dia_semana === actual.dia_semana && aMinutos(actual.hora_inicio) < aMinutos(anterior.hora_fin)) {
      throw solicitudInvalida('Hay bloques de disponibilidad que se cruzan el mismo día');
    }
  }
  return bloques;
}

/**
 * Pantalla "Disponibilidad": modalidades del docente y, por cada materia y nivel que enseña,
 * su tarifa y su propia cuadrícula semanal (como pipelines separados).
 */
class DocenteServicio {
  constructor({ db, docenteRepositorio, catalogoRepositorio, notificaciones, ocupado }) {
    this.ocupado = ocupado;
    this.db = db;
    this.docentes = docenteRepositorio;
    this.catalogo = catalogoRepositorio;
    this.notificaciones = notificaciones;
  }

  async obtenerConfiguracion(usuario) {
    const [perfil, materias, disponibilidad] = await Promise.all([
      this.docentes.obtener(usuario.id),
      this.docentes.materias(usuario.id),
      this.docentes.disponibilidad(usuario.id),
    ]);
    // Si conectó Google, se comprueba que el permiso para ver su "ocupado" siga vigente
    const google = perfil?.google_conectado && this.ocupado ? await this.ocupado.estado(usuario.id) : 'sin_conexion';
    const conCuadricula = materias.map((m) => ({
      ...m,
      disponibilidad: disponibilidad
        .filter((d) => d.materia_id === m.materia_id && d.nivel_id === m.nivel_id)
        .map(({ dia_semana, hora_inicio, hora_fin, modalidad }) => ({ dia_semana, hora_inicio, hora_fin, modalidad })),
    }));
    return { perfil, materias: conCuadricula, disponibilidad, google };
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

    // Una cuadrícula general (versión anterior de la pantalla) se aplica a las materias que no traen la suya
    const general = cuerpo.disponibilidad !== undefined ? validarBloques(cuerpo.disponibilidad, 'disponibilidad') : [];

    const vistas = new Set();
    const materias = validar.lista(cuerpo.materias ?? [], 'materias', { max: 30 }).map((m, i) => {
      const fila = {
        materia_id: validar.entero(m.materia_id, `materias[${i}].materia_id`, { min: 1 }),
        nivel_id: validar.entero(m.nivel_id, `materias[${i}].nivel_id`, { min: 1 }),
        tarifa_hora: validar.numero(m.tarifa_hora, `materias[${i}].tarifa_hora`, { min: 1000, max: 10000000 }),
        disponibilidad: m.disponibilidad !== undefined ? validarBloques(m.disponibilidad, `materias[${i}].disponibilidad`) : general,
      };
      const clave = `${fila.materia_id}-${fila.nivel_id}`;
      if (vistas.has(clave)) throw solicitudInvalida('Hay una materia repetida en el mismo nivel');
      vistas.add(clave);
      return fila;
    });
    const bloques = materias.flatMap((m) => m.disponibilidad.map((b) => ({
      ...b,
      materia_id: m.materia_id,
      nivel_id: m.nivel_id,
      // Quien solo da clases presenciales no tiene horas virtuales
      modalidad: ofreceVirtual ? b.modalidad : 'presencial',
    })));
    if (!ofrecePresencial && bloques.some((b) => b.modalidad === 'presencial')) {
      throw solicitudInvalida('Marcaste horas presenciales, pero no tienes activada la modalidad presencial');
    }

    await this.db.transaccion(async (tx) => {
      const repo = this.docentes.con(tx);
      await repo.actualizarPerfil(usuario.id, perfil);
      await repo.reemplazarMaterias(usuario.id, materias);
      await repo.reemplazarDisponibilidad(usuario.id, bloques);
    });
    const publicadas = materias.filter((m) => m.disponibilidad.length);
    if (publicadas.length) await this.avisarEstudiantes(usuario, publicadas);
    return this.obtenerConfiguracion(usuario);
  }

  /** Con materias y horarios publicados el docente ya aparece al buscar: se avisa a quienes lo esperaban. */
  async avisarEstudiantes(usuario, materias) {
    if (!this.catalogo || !this.notificaciones) return;
    try {
      const pendientes = await this.catalogo.avisosPendientes([...new Set(materias.map((m) => m.materia_id))]);
      if (!pendientes.length) return;
      await this.catalogo.marcarAvisados(pendientes.map((a) => a.id));
      await Promise.all(pendientes.map((a) => this.notificaciones.materiaDisponible(a, usuario.nombre_completo)));
    } catch (error) {
      console.error('No se pudo avisar a los estudiantes:', error.message);
    }
  }
}

module.exports = { DocenteServicio };
