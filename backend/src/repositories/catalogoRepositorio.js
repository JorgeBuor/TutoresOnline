const { RepositorioBase } = require('./base');

class CatalogoRepositorio extends RepositorioBase {
  materias() {
    return this.db.consultar('select id, nombre, area from materias order by area, nombre');
  }

  niveles() {
    return this.db.consultar('select id, nombre from niveles_educativos order by id');
  }

  ciudades() {
    return this.db.consultar(
      `select distinct ciudad from perfiles where ciudad is not null and ciudad <> '' order by ciudad`,
    );
  }
}

module.exports = { CatalogoRepositorio };
