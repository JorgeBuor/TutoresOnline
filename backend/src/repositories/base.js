/**
 * Base de todos los repositorios. Un repositorio solo sabe leer y escribir en la base;
 * no conoce reglas de negocio ni HTTP (principio de responsabilidad única).
 * con(tx) devuelve el mismo repositorio trabajando dentro de una transacción.
 */
class RepositorioBase {
  constructor(db) {
    this.db = db;
  }

  con(transaccion) {
    return new this.constructor(transaccion);
  }
}

module.exports = { RepositorioBase };
