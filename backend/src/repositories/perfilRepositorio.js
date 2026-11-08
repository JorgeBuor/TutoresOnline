const { RepositorioBase } = require('./base');

class PerfilRepositorio extends RepositorioBase {
  obtener(id) {
    return this.db.uno(
      `select p.id, p.rol, p.rol_confirmado, p.nombre_completo, p.email, p.telefono, p.ciudad, p.foto_url,
              coalesce(d.google_conectado, false) as google_conectado
         from perfiles p
         left join docentes d on d.id = p.id
        where p.id = $1`,
      [id],
    );
  }

  async confirmarRol(id, rol) {
    const perfil = await this.db.uno(
      `update perfiles set rol = $2, rol_confirmado = true
        where id = $1 and rol_confirmado = false
        returning id`,
      [id, rol],
    );
    if (!perfil) return null;
    if (rol === 'docente') {
      await this.db.consultar('insert into docentes (id) values ($1) on conflict (id) do nothing', [id]);
    } else {
      await this.db.consultar('delete from docentes where id = $1', [id]);
    }
    return this.obtener(id);
  }

  actualizar(id, { nombre_completo, telefono, ciudad }) {
    return this.db.uno(
      `update perfiles
          set nombre_completo = coalesce($2, nombre_completo),
              telefono        = coalesce($3, telefono),
              ciudad          = coalesce($4, ciudad)
        where id = $1
        returning id`,
      [id, nombre_completo, telefono, ciudad],
    );
  }
}

module.exports = { PerfilRepositorio };
