const { RepositorioBase } = require('./base');

const SELECT_TUTORIA = `
  select t.id, t.estudiante_id, t.docente_id, t.materia_id, t.inicio, t.fin, t.modalidad, t.lugar,
         t.tarifa_hora, t.estado, t.origen, t.meet_url, t.google_event_id, t.creada_en,
         m.nombre as materia,
         pe.nombre_completo as estudiante, pe.email as estudiante_email,
         pd.nombre_completo as docente, pd.email as docente_email,
         r.estrellas as calificacion
    from tutorias t
    join materias m  on m.id  = t.materia_id
    join perfiles pe on pe.id = t.estudiante_id
    join perfiles pd on pd.id = t.docente_id
    left join resenas r on r.tutoria_id = t.id`;

class TutoriaRepositorio extends RepositorioBase {
  async crear(datos) {
    const fila = await this.db.uno(
      `insert into tutorias (estudiante_id, docente_id, materia_id, inicio, fin, modalidad, lugar, tarifa_hora, estado, origen)
       values ($1, $2, $3, $4, $5, $6, $7, $8, 'pendiente', 'agenda')
       returning id`,
      [datos.estudianteId, datos.docenteId, datos.materiaId, datos.inicio, datos.fin,
        datos.modalidad, datos.lugar, datos.tarifaHora],
    );
    return this.obtener(fila.id);
  }

  obtener(id) {
    return this.db.uno(`${SELECT_TUTORIA} where t.id = $1`, [id]);
  }

  listar(usuarioId, { estados = null, desde = null, hasta = null, modalidad = null } = {}) {
    return this.db.consultar(
      `${SELECT_TUTORIA}
        where $1 in (t.estudiante_id, t.docente_id)
          and ($2::estado_tutoria[] is null or t.estado = any($2::estado_tutoria[]))
          and ($3::timestamptz is null or t.fin >= $3)
          and ($4::timestamptz is null or t.inicio <= $4)
          and ($5::modalidad_clase is null or t.modalidad = $5)
        order by t.inicio
        limit 100`,
      [usuarioId, estados, desde, hasta, modalidad],
    );
  }

  async cambiarEstado(id, estado) {
    await this.db.consultar('update tutorias set estado = $2 where id = $1', [id, estado]);
    return this.obtener(id);
  }

  guardarEvento(id, { eventId, meetUrl }) {
    return this.db.consultar(
      'update tutorias set google_event_id = $2, meet_url = coalesce($3, meet_url) where id = $1',
      [id, eventId, meetUrl],
    );
  }

  crearResena({ tutoriaId, estudianteId, docenteId, estrellas, comentario }) {
    return this.db.uno(
      `insert into resenas (tutoria_id, estudiante_id, docente_id, estrellas, comentario)
       values ($1, $2, $3, $4, $5)
       returning id, estrellas, comentario, creada_en`,
      [tutoriaId, estudianteId, docenteId, estrellas, comentario],
    );
  }
}

module.exports = { TutoriaRepositorio };
