const { RepositorioBase } = require('./base');

const CAMPOS_TUTOR = `
  d.id as docente_id, p.nombre_completo, p.foto_url, p.ciudad,
  d.ofrece_virtual, d.ofrece_presencial, d.zona_presencial,
  d.calificacion_promedio, d.total_resenas, d.google_conectado`;

/** Consultas de lectura para buscar tutores y calcular sus horarios libres. */
class TutorRepositorio extends RepositorioBase {
  buscar({ materiaId, nivelId, area, modalidad, ciudad, texto }) {
    return this.db.consultar(
      `select ${CAMPOS_TUTOR},
              json_agg(json_build_object(
                'materia_id', m.id, 'materia', m.nombre, 'area', m.area,
                'nivel_id', n.id, 'nivel', n.nombre, 'tarifa_hora', dm.tarifa_hora
              ) order by m.nombre, n.id) as materias,
              min(dm.tarifa_hora) as tarifa_desde
         from docentes d
         join perfiles p           on p.id = d.id
         join docente_materias dm  on dm.docente_id = d.id
         join materias m           on m.id = dm.materia_id
         join niveles_educativos n on n.id = dm.nivel_id
        where ($1::int is null or dm.materia_id = $1)
          and ($2::int is null or dm.nivel_id = $2)
          and ($3::text is null or m.area = $3)
          and ($4::text is null
               or ($4 = 'virtual' and d.ofrece_virtual)
               or ($4 = 'presencial' and d.ofrece_presencial))
          and ($5::text is null or p.ciudad ilike $5)
          and ($6::text is null or p.nombre_completo ilike '%' || $6 || '%' or m.nombre ilike '%' || $6 || '%')
        group by d.id, p.id
        order by d.calificacion_promedio desc, d.total_resenas desc, p.nombre_completo
        limit 50`,
      [materiaId, nivelId, area, modalidad, ciudad, texto],
    );
  }

  obtener(docenteId) {
    return this.db.uno(
      `select ${CAMPOS_TUTOR}, d.biografia,
              coalesce((select json_agg(json_build_object(
                         'materia_id', m.id, 'materia', m.nombre, 'area', m.area,
                         'nivel_id', n.id, 'nivel', n.nombre, 'tarifa_hora', dm.tarifa_hora
                       ) order by m.nombre, n.id)
                  from docente_materias dm
                  join materias m on m.id = dm.materia_id
                  join niveles_educativos n on n.id = dm.nivel_id
                 where dm.docente_id = d.id), '[]') as materias
         from docentes d
         join perfiles p on p.id = d.id
        where d.id = $1`,
      [docenteId],
    );
  }

  resenas(docenteId, limite = 10) {
    return this.db.consultar(
      `select r.estrellas, r.comentario, r.creada_en, p.nombre_completo as estudiante
         from resenas r
         join perfiles p on p.id = r.estudiante_id
        where r.docente_id = $1
        order by r.creada_en desc
        limit $2`,
      [docenteId, limite],
    );
  }

  /**
   * Bloques de una hora que siguen libres en una fecha, para cada docente.
   * Parte de la disponibilidad semanal y descuenta las clases pendientes o confirmadas.
   */
  horariosLibres(docenteIds, fecha, zonaHoraria) {
    if (!docenteIds.length) return [];
    return this.db.consultar(
      `select d.docente_id,
              to_char(s.inicio at time zone $3, 'HH24:MI') as hora,
              s.inicio
         from disponibilidad d
         cross join lateral generate_series(
                ($2::date + d.hora_inicio),
                ($2::date + d.hora_fin - interval '1 hour'),
                interval '1 hour') as g(local)
         cross join lateral (select (g.local at time zone $3) as inicio) s
        where d.docente_id = any($1::uuid[])
          and d.dia_semana = extract(dow from $2::date)
          and s.inicio > now()
          and not exists (
                select 1 from tutorias t
                 where t.docente_id = d.docente_id
                   and t.estado in ('pendiente', 'confirmada')
                   and tstzrange(t.inicio, t.fin) && tstzrange(s.inicio, s.inicio + interval '1 hour'))
        order by d.docente_id, s.inicio`,
      [docenteIds, fecha, zonaHoraria],
    );
  }

  tarifa(docenteId, materiaId, nivelId) {
    return this.db.uno(
      `select materia_id, nivel_id, tarifa_hora
         from docente_materias
        where docente_id = $1 and materia_id = $2 and ($3::int is null or nivel_id = $3)
        order by tarifa_hora
        limit 1`,
      [docenteId, materiaId, nivelId],
    );
  }

  async dentroDeDisponibilidad(docenteId, inicio, fin, zonaHoraria) {
    const fila = await this.db.uno(
      `select exists (
         select 1 from disponibilidad d
          where d.docente_id = $1
            and d.dia_semana = extract(dow from ($2::timestamptz at time zone $4))
            and ($2::timestamptz at time zone $4)::date = ($3::timestamptz at time zone $4)::date
            and d.hora_inicio <= ($2::timestamptz at time zone $4)::time
            and d.hora_fin    >= ($3::timestamptz at time zone $4)::time
       ) as ok`,
      [docenteId, inicio, fin, zonaHoraria],
    );
    return fila.ok;
  }
}

module.exports = { TutorRepositorio };
