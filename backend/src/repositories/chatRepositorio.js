const { RepositorioBase } = require('./base');

class ChatRepositorio extends RepositorioBase {
  conversaciones(usuarioId) {
    return this.db.consultar(
      `select c.id, c.estudiante_id, c.docente_id,
              case when c.estudiante_id = $1 then c.docente_id else c.estudiante_id end as contraparte_id,
              case when c.estudiante_id = $1 then pd.nombre_completo else pe.nombre_completo end as contraparte,
              um.contenido as ultimo_mensaje, um.enviado_en as ultimo_envio,
              (select count(*)::int from mensajes m
                where m.conversacion_id = c.id and m.remitente_id <> $1 and not m.leido) as no_leidos
         from conversaciones c
         join perfiles pe on pe.id = c.estudiante_id
         join perfiles pd on pd.id = c.docente_id
         left join lateral (
               select contenido, enviado_en from mensajes m
                where m.conversacion_id = c.id
                order by enviado_en desc, id desc limit 1) um on true
        where $1 in (c.estudiante_id, c.docente_id)
        order by coalesce(um.enviado_en, c.creada_en) desc`,
      [usuarioId],
    );
  }

  obtener(id) {
    return this.db.uno('select id, estudiante_id, docente_id from conversaciones where id = $1', [id]);
  }

  buscarOCrear(estudianteId, docenteId) {
    return this.db.uno(
      `insert into conversaciones (estudiante_id, docente_id) values ($1, $2)
       on conflict (estudiante_id, docente_id) do update set estudiante_id = excluded.estudiante_id
       returning id, estudiante_id, docente_id`,
      [estudianteId, docenteId],
    );
  }

  mensajes(conversacionId, despuesDeId = null) {
    return this.db.consultar(
      `select id, remitente_id, contenido, adjunto_url, leido, enviado_en
         from mensajes
        where conversacion_id = $1 and ($2::bigint is null or id > $2)
        order by id
        limit 200`,
      [conversacionId, despuesDeId],
    );
  }

  marcarLeidos(conversacionId, lectorId) {
    return this.db.consultar(
      'update mensajes set leido = true where conversacion_id = $1 and remitente_id <> $2 and not leido',
      [conversacionId, lectorId],
    );
  }

  crearMensaje(conversacionId, remitenteId, contenido) {
    return this.db.uno(
      `insert into mensajes (conversacion_id, remitente_id, contenido) values ($1, $2, $3)
       returning id, remitente_id, contenido, adjunto_url, leido, enviado_en`,
      [conversacionId, remitenteId, contenido],
    );
  }
}

module.exports = { ChatRepositorio };
