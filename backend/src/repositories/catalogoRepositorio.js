const { RepositorioBase } = require('./base');

class CatalogoRepositorio extends RepositorioBase {
  /** Materias con cuántos tutores la enseñan y tienen horarios publicados (los que aparecen al buscar). */
  materias() {
    return this.db.consultar(
      `select m.id, m.nombre, m.area,
              count(distinct dm.docente_id) filter (
                where exists (select 1 from disponibilidad d
                               where d.docente_id = dm.docente_id and d.materia_id = dm.materia_id and d.nivel_id = dm.nivel_id)
              )::int as tutores
         from materias m
         left join docente_materias dm on dm.materia_id = m.id
        group by m.id
        order by m.area, m.nombre`,
    );
  }

  niveles() {
    return this.db.consultar('select id, nombre from niveles_educativos order by id');
  }

  ciudades() {
    return this.db.consultar(
      `select distinct ciudad from perfiles where ciudad is not null and ciudad <> '' order by ciudad`,
    );
  }

  materiaPorNombre(nombre) {
    return this.db.uno('select id, nombre, area from materias where clave_texto(nombre) = clave_texto($1)', [nombre]);
  }

  areaPorNombre(area) {
    return this.db.uno('select area from materias where clave_texto(area) = clave_texto($1) limit 1', [area]);
  }

  /** Crea la materia; si otra persona la creó al mismo tiempo, devuelve null. */
  crearMateria({ nombre, area, creadaPor }) {
    return this.db.uno(
      `insert into materias (nombre, area, creada_por) values ($1, $2, $3)
       on conflict do nothing
       returning id, nombre, area`,
      [nombre, area, creadaPor],
    );
  }

  /** Los avisos que se pidieron escribiendo el nombre quedan unidos a la materia recién creada. */
  vincularAvisosPorTexto(materia) {
    return this.db.consultar(
      `update avisos_materia a set materia_id = $1
        where a.materia_id is null and a.avisado_en is null
          and clave_texto(a.texto) = clave_texto($2)
          and not exists (select 1 from avisos_materia b
                           where b.estudiante_id = a.estudiante_id and b.materia_id = $1 and b.avisado_en is null)`,
      [materia.id, materia.nombre],
    );
  }

  misAvisos(estudianteId) {
    return this.db.consultar(
      `select a.id, a.materia_id, coalesce(m.nombre, a.texto) as materia, a.creado_en
         from avisos_materia a left join materias m on m.id = a.materia_id
        where a.estudiante_id = $1 and a.avisado_en is null
        order by a.creado_en desc`,
      [estudianteId],
    );
  }

  /** Registra el aviso; si ya estaba pedido, no lo duplica. */
  crearAviso({ estudianteId, materiaId, texto }) {
    return this.db.uno(
      `insert into avisos_materia (estudiante_id, materia_id, texto) values ($1, $2, $3)
       on conflict do nothing returning id`,
      [estudianteId, materiaId, texto],
    );
  }

  /** Avisos pendientes de las materias dadas, listos para enviar el correo. */
  avisosPendientes(materiaIds) {
    return this.db.consultar(
      `select a.id, a.estudiante_id, p.email, p.nombre_completo, m.id as materia_id, m.nombre as materia
         from avisos_materia a
         join perfiles p on p.id = a.estudiante_id
         join materias m on m.id = a.materia_id
        where a.avisado_en is null and a.materia_id = any($1::int[])`,
      [materiaIds],
    );
  }

  marcarAvisados(ids) {
    return this.db.consultar('update avisos_materia set avisado_en = now() where id = any($1::bigint[])', [ids]);
  }
}

module.exports = { CatalogoRepositorio };
