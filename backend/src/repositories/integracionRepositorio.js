const { RepositorioBase } = require('./base');

/** Notificaciones enviadas y permisos de Google Calendar guardados por usuario. */
class IntegracionRepositorio extends RepositorioBase {
  crearNotificacion({ usuarioId, tutoriaId, canal, asunto }) {
    return this.db.uno(
      `insert into notificaciones (usuario_id, tutoria_id, canal, asunto)
       values ($1, $2, $3, $4) returning id`,
      [usuarioId, tutoriaId, canal, asunto],
    );
  }

  marcarNotificacion(id, estado) {
    return this.db.consultar(
      'update notificaciones set estado = $2, enviada_en = case when $3 then now() end where id = $1',
      [id, estado, estado === 'enviada'],
    );
  }

  guardarTokenGoogle(usuarioId, refreshToken) {
    return this.db.consultar(
      `insert into integraciones_google (usuario_id, refresh_token) values ($1, $2)
       on conflict (usuario_id) do update set refresh_token = excluded.refresh_token, conectado_en = now()`,
      [usuarioId, refreshToken],
    );
  }

  async tokenGoogle(usuarioId) {
    const fila = await this.db.uno('select refresh_token from integraciones_google where usuario_id = $1', [usuarioId]);
    return fila?.refresh_token || null;
  }

  eliminarTokenGoogle(usuarioId) {
    return this.db.consultar('delete from integraciones_google where usuario_id = $1', [usuarioId]);
  }
}

module.exports = { IntegracionRepositorio };
