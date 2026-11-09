const { validar } = require('../utils/validar');
const { conflicto, prohibido } = require('../utils/errores');

class PerfilServicio {
  constructor({ db, perfilRepositorio, docenteRepositorio, integracionRepositorio }) {
    this.db = db;
    this.perfiles = perfilRepositorio;
    this.docentes = docenteRepositorio;
    this.integraciones = integracionRepositorio;
  }

  yo(usuario) {
    return this.perfiles.obtener(usuario.id);
  }

  /** Quien entra por primera vez con Google elige si es estudiante o docente (una sola vez). */
  async confirmarRol(usuario, cuerpo) {
    const rol = validar.opcion(cuerpo.rol, 'rol', ['estudiante', 'docente']);
    if (usuario.rol_confirmado) throw conflicto('Tu rol ya fue definido');
    const perfil = await this.db.transaccion((tx) => this.perfiles.con(tx).confirmarRol(usuario.id, rol));
    if (!perfil) throw conflicto('Tu rol ya fue definido');
    return perfil;
  }

  async actualizar(usuario, cuerpo) {
    await this.perfiles.actualizar(usuario.id, {
      nombre_completo: validar.texto(cuerpo.nombre_completo, 'nombre_completo', { requerido: false, min: 3, max: 120 }),
      telefono: validar.texto(cuerpo.telefono, 'telefono', { requerido: false, max: 30 }),
      ciudad: validar.texto(cuerpo.ciudad, 'ciudad', { requerido: false, max: 80 }),
    });
    return this.perfiles.obtener(usuario.id);
  }

  /** Guarda el permiso de Google Calendar que el docente dio al entrar con Google. */
  async conectarGoogle(usuario, cuerpo) {
    if (usuario.rol !== 'docente') throw prohibido('Solo los docentes conectan Google Calendar');
    const token = validar.texto(cuerpo.refresh_token, 'refresh_token', { max: 2000 });
    await this.db.transaccion(async (tx) => {
      await this.integraciones.con(tx).guardarTokenGoogle(usuario.id, token);
      await this.docentes.con(tx).marcarGoogle(usuario.id, true);
    });
    return this.perfiles.obtener(usuario.id);
  }

  async desconectarGoogle(usuario) {
    await this.db.transaccion(async (tx) => {
      await this.integraciones.con(tx).eliminarTokenGoogle(usuario.id);
      await this.docentes.con(tx).marcarGoogle(usuario.id, false);
    });
    return this.perfiles.obtener(usuario.id);
  }
}

module.exports = { PerfilServicio };
