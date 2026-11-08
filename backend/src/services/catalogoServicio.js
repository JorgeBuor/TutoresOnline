const { validar } = require('../utils/validar');
const { solicitudInvalida } = require('../utils/errores');

/** "  cálculo   de varias variables " → "Cálculo de varias variables" */
const limpiarNombre = (texto) => {
  const t = texto.replace(/\s+/g, ' ').trim();
  return t.charAt(0).toLocaleUpperCase('es-CO') + t.slice(1);
};

/**
 * Catálogos (materias, niveles, ciudades) y el catálogo abierto:
 * los docentes agregan materias nuevas y los estudiantes piden que les avisen
 * cuando haya un tutor de la materia que buscan.
 */
class CatalogoServicio {
  constructor({ catalogoRepositorio, db }) {
    this.catalogo = catalogoRepositorio;
    this.db = db;
  }

  async todo() {
    const [materias, niveles, ciudades] = await Promise.all([
      this.catalogo.materias(),
      this.catalogo.niveles(),
      this.catalogo.ciudades(),
    ]);
    const areas = [...new Set(materias.map((m) => m.area))].sort((a, b) => a.localeCompare(b, 'es'));
    return { materias, areas, niveles, ciudades: ciudades.map((c) => c.ciudad) };
  }

  /** El docente agrega una materia que no estaba. Si ya existe (aunque esté escrita distinto), se devuelve la existente. */
  async crearMateria(usuario, cuerpo) {
    const nombre = limpiarNombre(validar.texto(cuerpo.nombre, 'nombre', { min: 3, max: 60 }));
    const areaEscrita = limpiarNombre(validar.texto(cuerpo.area, 'area', { min: 3, max: 40 }));
    if (!/[a-záéíóúñ]/i.test(nombre)) throw solicitudInvalida('Escribe un nombre de materia válido');

    const existente = await this.catalogo.materiaPorNombre(nombre);
    if (existente) return { materia: existente, nueva: false };

    // Si el área ya existe con otra escritura, se usa la existente para no duplicar grupos
    const area = (await this.catalogo.areaPorNombre(areaEscrita))?.area || areaEscrita;
    const creada = await this.catalogo.crearMateria({ nombre, area, creadaPor: usuario.id });
    if (!creada) return { materia: await this.catalogo.materiaPorNombre(nombre), nueva: false };

    await this.catalogo.vincularAvisosPorTexto(creada);
    return { materia: creada, nueva: true };
  }

  misAvisos(usuario) {
    return this.catalogo.misAvisos(usuario.id);
  }

  /** El estudiante pide que le avisen: por una materia del catálogo o escribiendo una que no existe. */
  async crearAviso(usuario, cuerpo) {
    let materiaId = validar.entero(cuerpo.materia_id, 'materia_id', { min: 1, requerido: false });
    let texto = null;
    if (!materiaId) {
      texto = limpiarNombre(validar.texto(cuerpo.texto, 'texto', { min: 3, max: 60 }));
      // Si lo que escribió ya existe en el catálogo, el aviso queda en esa materia
      const existente = await this.catalogo.materiaPorNombre(texto);
      if (existente) { materiaId = existente.id; texto = null; }
    }
    await this.catalogo.crearAviso({ estudianteId: usuario.id, materiaId, texto });
    return { materia_id: materiaId, texto, registrado: true };
  }
}

module.exports = { CatalogoServicio };
