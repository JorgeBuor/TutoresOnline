class CatalogoServicio {
  constructor({ catalogoRepositorio }) {
    this.catalogo = catalogoRepositorio;
  }

  async todo() {
    const [materias, niveles, ciudades] = await Promise.all([
      this.catalogo.materias(),
      this.catalogo.niveles(),
      this.catalogo.ciudades(),
    ]);
    return { materias, niveles, ciudades: ciudades.map((c) => c.ciudad) };
  }
}

module.exports = { CatalogoServicio };
