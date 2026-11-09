const { RepositorioBase } = require('./base');

/** Configuración propia del docente: modalidades, materias con tarifa y disponibilidad semanal. */
class DocenteRepositorio extends RepositorioBase {
  obtener(id) {
    return this.db.uno(
      `select id, biografia, ofrece_virtual, ofrece_presencial, zona_presencial,
              calificacion_promedio, total_resenas, google_conectado
         from docentes where id = $1`,
      [id],
    );
  }

  materias(id) {
    return this.db.consultar(
      `select dm.materia_id, m.nombre as materia, m.area, dm.nivel_id, n.nombre as nivel, dm.tarifa_hora
         from docente_materias dm
         join materias m on m.id = dm.materia_id
         join niveles_educativos n on n.id = dm.nivel_id
        where dm.docente_id = $1
        order by m.nombre, n.id`,
      [id],
    );
  }

  disponibilidad(id) {
    return this.db.consultar(
      `select materia_id, nivel_id, dia_semana,
              to_char(hora_inicio, 'HH24:MI') as hora_inicio, to_char(hora_fin, 'HH24:MI') as hora_fin
         from disponibilidad
        where docente_id = $1
        order by materia_id, nivel_id, dia_semana, hora_inicio`,
      [id],
    );
  }

  actualizarPerfil(id, { biografia, ofrece_virtual, ofrece_presencial, zona_presencial }) {
    return this.db.uno(
      `update docentes
          set biografia         = $2,
              ofrece_virtual    = $3,
              ofrece_presencial = $4,
              zona_presencial   = $5
        where id = $1
        returning id`,
      [id, biografia, ofrece_virtual, ofrece_presencial, zona_presencial],
    );
  }

  async reemplazarMaterias(id, materias) {
    await this.db.consultar('delete from docente_materias where docente_id = $1', [id]);
    if (!materias.length) return;
    await this.db.consultar(
      `insert into docente_materias (docente_id, materia_id, nivel_id, tarifa_hora)
       select $1, x.materia_id, x.nivel_id, x.tarifa_hora
         from jsonb_to_recordset($2::jsonb) as x(materia_id int, nivel_id smallint, tarifa_hora numeric)`,
      [id, JSON.stringify(materias)],
    );
  }

  async reemplazarDisponibilidad(id, bloques) {
    await this.db.consultar('delete from disponibilidad where docente_id = $1', [id]);
    if (!bloques.length) return;
    await this.db.consultar(
      `insert into disponibilidad (docente_id, materia_id, nivel_id, dia_semana, hora_inicio, hora_fin)
       select $1, x.materia_id, x.nivel_id, x.dia_semana, x.hora_inicio, x.hora_fin
         from jsonb_to_recordset($2::jsonb)
           as x(materia_id int, nivel_id smallint, dia_semana smallint, hora_inicio time, hora_fin time)`,
      [id, JSON.stringify(bloques)],
    );
  }

  marcarGoogle(id, conectado) {
    return this.db.consultar('update docentes set google_conectado = $2 where id = $1', [id, conectado]);
  }
}

module.exports = { DocenteRepositorio };
