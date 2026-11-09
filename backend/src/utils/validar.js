const { solicitudInvalida } = require('./errores');

/**
 * Validaciones pequeñas y reutilizables. Cada función devuelve el valor ya limpio
 * o lanza un error 400 con un mensaje claro para el usuario.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function opcional(valor) {
  return valor === undefined || valor === null || valor === '';
}

const validar = {
  entero(valor, campo, { min = -Infinity, max = Infinity, requerido = true } = {}) {
    if (opcional(valor)) {
      if (requerido) throw solicitudInvalida(`Falta el campo ${campo}`);
      return null;
    }
    const n = Number(valor);
    if (!Number.isInteger(n) || n < min || n > max) throw solicitudInvalida(`El campo ${campo} no es válido`);
    return n;
  },

  numero(valor, campo, { min = -Infinity, max = Infinity, requerido = true } = {}) {
    if (opcional(valor)) {
      if (requerido) throw solicitudInvalida(`Falta el campo ${campo}`);
      return null;
    }
    // Acepta 25000, "25000", "25000.50", "25.000" (miles con punto) y "25000,5" (decimal con coma)
    let texto = String(valor).trim();
    if (/^\d{1,3}(\.\d{3})+$/.test(texto)) texto = texto.replace(/\./g, '');
    const n = typeof valor === 'number' ? valor : Number(texto.replace(',', '.'));
    if (!Number.isFinite(n) || n < min || n > max) throw solicitudInvalida(`El campo ${campo} no es válido`);
    return n;
  },

  texto(valor, campo, { min = 1, max = 500, requerido = true } = {}) {
    if (opcional(valor) || String(valor).trim() === '') {
      if (requerido) throw solicitudInvalida(`Falta el campo ${campo}`);
      return null;
    }
    const t = String(valor).trim();
    if (t.length < min || t.length > max) throw solicitudInvalida(`El campo ${campo} debe tener entre ${min} y ${max} caracteres`);
    return t;
  },

  uuid(valor, campo, { requerido = true } = {}) {
    if (opcional(valor)) {
      if (requerido) throw solicitudInvalida(`Falta el campo ${campo}`);
      return null;
    }
    if (!UUID.test(String(valor))) throw solicitudInvalida(`El campo ${campo} no es válido`);
    return String(valor);
  },

  opcion(valor, campo, opciones, { requerido = true } = {}) {
    if (opcional(valor)) {
      if (requerido) throw solicitudInvalida(`Falta el campo ${campo}`);
      return null;
    }
    if (!opciones.includes(valor)) throw solicitudInvalida(`El campo ${campo} debe ser: ${opciones.join(', ')}`);
    return valor;
  },

  fechaHora(valor, campo, { requerido = true } = {}) {
    if (opcional(valor)) {
      if (requerido) throw solicitudInvalida(`Falta el campo ${campo}`);
      return null;
    }
    const d = new Date(valor);
    if (Number.isNaN(d.getTime())) throw solicitudInvalida(`El campo ${campo} no es una fecha válida`);
    return d;
  },

  fecha(valor, campo, { requerido = true } = {}) {
    if (opcional(valor)) {
      if (requerido) throw solicitudInvalida(`Falta el campo ${campo}`);
      return null;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(valor))) throw solicitudInvalida(`El campo ${campo} debe tener el formato AAAA-MM-DD`);
    return String(valor);
  },

  hora(valor, campo) {
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(String(valor || ''))) throw solicitudInvalida(`El campo ${campo} debe tener el formato HH:MM`);
    return String(valor);
  },

  lista(valor, campo, { max = 200 } = {}) {
    if (!Array.isArray(valor)) throw solicitudInvalida(`El campo ${campo} debe ser una lista`);
    if (valor.length > max) throw solicitudInvalida(`El campo ${campo} tiene demasiados elementos`);
    return valor;
  },
};

module.exports = { validar };
