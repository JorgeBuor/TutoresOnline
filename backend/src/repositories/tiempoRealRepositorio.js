const { RepositorioBase } = require('./base');

/** Solicitudes en tiempo real (estilo InDrive) y las ofertas de los docentes. */
class TiempoRealRepositorio extends RepositorioBase {
  expirarVencidas() {
    return this.db.consultar(
      `update solicitudes_tiempo_real set estado = 'expirada'
        where estado = 'abierta' and expira_en < now()`,
    );
  }

  crearSolicitud(d) {
    return this.db.uno(
      `insert into solicitudes_tiempo_real
              (estudiante_id, materia_id, tema, descripcion, tarifa_sugerida, duracion_min, modalidad, ciudad)
       values ($1, $2, $3, $4, $5, $6, $7, $8)
       returning *`,
      [d.estudianteId, d.materiaId, d.tema, d.descripcion, d.tarifaSugerida, d.duracionMin, d.modalidad, d.ciudad],
    );
  }

  obtenerSolicitud(id) {
    return this.db.uno(
      `select s.*, m.nombre as materia, p.nombre_completo as estudiante
         from solicitudes_tiempo_real s
         left join materias m on m.id = s.materia_id
         join perfiles p on p.id = s.estudiante_id
        where s.id = $1`,
      [id],
    );
  }

  solicitudesAbiertas(docenteId, { soloMisMaterias = false, ciudad = null } = {}) {
    return this.db.consultar(
      `select s.id, s.tema, s.descripcion, s.tarifa_sugerida, s.duracion_min, s.modalidad, s.ciudad,
              s.creada_en, s.expira_en, m.nombre as materia, p.nombre_completo as estudiante,
              o.tarifa_ofertada as mi_oferta
         from solicitudes_tiempo_real s
         left join materias m on m.id = s.materia_id
         join perfiles p on p.id = s.estudiante_id
         left join ofertas o on o.solicitud_id = s.id and o.docente_id = $1 and o.estado = 'enviada'
        where s.estado = 'abierta' and s.expira_en > now()
          and (not $2 or s.materia_id in (select materia_id from docente_materias where docente_id = $1))
          and ($3::text is null or s.ciudad ilike $3)
        order by s.creada_en desc
        limit 50`,
      [docenteId, soloMisMaterias, ciudad],
    );
  }

  misSolicitudes(estudianteId) {
    return this.db.consultar(
      `select s.*, m.nombre as materia,
              (select count(*)::int from ofertas o where o.solicitud_id = s.id and o.estado = 'enviada') as ofertas
         from solicitudes_tiempo_real s
         left join materias m on m.id = s.materia_id
        where s.estudiante_id = $1
        order by s.creada_en desc
        limit 10`,
      [estudianteId],
    );
  }

  ofertas(solicitudId) {
    return this.db.consultar(
      `select o.id, o.docente_id, o.tarifa_ofertada, o.minutos_llegada, o.estado, o.creada_en,
              p.nombre_completo as docente, d.calificacion_promedio, d.total_resenas
         from ofertas o
         join docentes d on d.id = o.docente_id
         join perfiles p on p.id = o.docente_id
        where o.solicitud_id = $1 and o.estado in ('enviada', 'aceptada')
        order by o.tarifa_ofertada, o.creada_en`,
      [solicitudId],
    );
  }

  crearOferta({ solicitudId, docenteId, tarifaOfertada, minutosLlegada }) {
    return this.db.uno(
      `insert into ofertas (solicitud_id, docente_id, tarifa_ofertada, minutos_llegada)
       values ($1, $2, $3, $4)
       on conflict (solicitud_id, docente_id)
       do update set tarifa_ofertada = excluded.tarifa_ofertada,
                     minutos_llegada = excluded.minutos_llegada,
                     estado = 'enviada',
                     creada_en = now()
       returning *`,
      [solicitudId, docenteId, tarifaOfertada, minutosLlegada],
    );
  }

  obtenerOferta(id) {
    return this.db.uno('select * from ofertas where id = $1', [id]);
  }

  async aceptarOferta(ofertaId, estudianteId) {
    const fila = await this.db.uno('select aceptar_oferta($1, $2) as tutoria_id', [ofertaId, estudianteId]);
    return fila.tutoria_id;
  }

  cambiarEstadoOferta(id, estado) {
    return this.db.uno('update ofertas set estado = $2 where id = $1 returning *', [id, estado]);
  }

  cambiarEstadoSolicitud(id, estado) {
    return this.db.uno('update solicitudes_tiempo_real set estado = $2 where id = $1 returning *', [id, estado]);
  }
}

module.exports = { TiempoRealRepositorio };
