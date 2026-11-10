import { iniciarPagina, api, auth, escapar, aviso, conBoton, abrirVentana, cerrarVentana, mostrarError, ICONOS, ALCANCE_CALENDARIO, dinero } from '../app.js';

const yo = await iniciarPagina();
const listaMaterias = document.getElementById('lista-materias');
const estadoGoogle = document.getElementById('estado-google');
const lado = document.querySelector('.lado');

const [catalogos, config, publica] = await Promise.all([
  api('/catalogos'),
  api('/docente/configuracion'),
  fetch('/api/configuracion').then((r) => r.json()),
]);
const nombreMateria = new Map(catalogos.materias.map((m) => [m.id, m.nombre]));
const nombreNivel = new Map(catalogos.niveles.map((n) => [n.id, n.nombre]));

/*
 * Cada materia y nivel es un "pipeline" con su propia tarifa y su propia cuadrícula:
 * [{ materia_id, nivel_id, tarifa, bloques: Map("dia|hora" → 'virtual' | 'presencial') }]. La pantalla muestra una a la vez.
 * Horas virtuales sirven para clases virtuales y presenciales; las presenciales, solo para presenciales.
 */
const claveBloque = (dia, hora) => `${dia}|${hora}`;
const dosDigitos = (n) => String(n).padStart(2, '0');
const HORAS = Array.from({ length: 16 }, (_, i) => `${dosDigitos(6 + i)}:00`);   // casillas de una hora: 06:00 a 21:00

/** Un bloque guardado (por ejemplo 08:00 a 10:00) se muestra como sus casillas de una hora. */
function casillasDe(b) {
  const [hi] = b.hora_inicio.split(':').map(Number);
  const [hf, mf] = b.hora_fin.split(':').map(Number);
  const fin = hf + (mf > 0 ? 1 : 0);
  return Array.from({ length: Math.max(0, fin - hi) }, (_, i) => [claveBloque(b.dia_semana, `${dosDigitos(hi + i)}:00`), b.modalidad || 'virtual']);
}
const materias = config.materias.map((m) => ({
  materia_id: m.materia_id,
  nivel_id: m.nivel_id,
  tarifa: Math.round(m.tarifa_hora).toLocaleString('es-CO'),
  bloques: new Map(m.disponibilidad.flatMap(casillasDe)),
}));
// Se abre primero una materia que ya tenga horario
let activa = Math.max(0, materias.findIndex((m) => m.bloques.size));
const nuevaMateria = (materiaId, nivelId) => ({
  materia_id: materiaId,
  nivel_id: nivelId,
  tarifa: materias[activa]?.tarifa || '',   // se propone la tarifa de la materia que estaba abierta
  bloques: new Map(),
});

// Compara nombres sin importar mayúsculas, tildes ni espacios
const clave = (t) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
const universitario = catalogos.niveles.find((n) => n.nombre === 'Universitario')?.id || catalogos.niveles[0].id;

// Si se registró escribiendo sus materias: las que están en la lista se agregan solas
// y las que no están se le proponen como materias nuevas, una por una.
const porCrear = [];
if (!materias.length) {
  let sugeridas = '';
  try { sugeridas = localStorage.getItem('tutores-materias-sugeridas') || ''; } catch { /* sin almacenamiento */ }
  for (const texto of sugeridas.split(',').map((t) => t.trim()).filter(Boolean)) {
    const k = clave(texto);
    const m = catalogos.materias.find((x) => clave(x.nombre) === k)
      || catalogos.materias.find((x) => clave(x.nombre).includes(k) || k.includes(clave(x.nombre)));
    if (m) {
      if (!materias.some((x) => x.materia_id === m.id)) materias.push(nuevaMateria(m.id, universitario));
    } else {
      porCrear.push(texto);
    }
  }
  if (materias.length) aviso('Agregamos las materias que escribiste al registrarte. Revisa y guarda.');
}

const nombreDe = (m) => `${nombreMateria.get(m.materia_id)} · ${nombreNivel.get(m.nivel_id)}`;
const horasDe = (m) => m.bloques.size;
const horasPresencialesDe = (m) => [...m.bloques.values()].filter((v) => v === 'presencial').length;
const selActiva = document.getElementById('materia-activa');
const selCopiar = document.getElementById('copiar-de');
const campoTarifa = document.getElementById('tarifa-d');
// La cuadrícula se arma aquí: 7 días por 16 horas, cada casilla es una hora
const DIAS = [['Lun', 1], ['Mar', 2], ['Mié', 3], ['Jue', 4], ['Vie', 5], ['Sáb', 6], ['Dom', 0]];
const cuadricula = document.querySelector('.cuadricula');
cuadricula.innerHTML = '<div></div>' + DIAS.map(([d]) => `<div class="dia">${d}</div>`).join('')
  + HORAS.map((h) => `<div class="hora">${h}</div>` + DIAS.map(([d, n]) => `<button type="button" class="celda" data-dia="${n}" data-hora="${h}" aria-label="${d} ${h} a ${dosDigitos(Number(h.slice(0, 2)) + 1)}:00" aria-pressed="false">${ICONOS.check}</button>`).join('')).join('');
const celdas = [...cuadricula.querySelectorAll('.celda')];

/** Lista de la derecha: cada materia con sus horas marcadas y su tarifa; la abierta se resalta. */
function pintarMaterias() {
  listaMaterias.innerHTML = materias.length
    ? materias.map((m, i) => `
      <div class="pipeline-item${i === activa ? ' activa' : ''}" data-elegir="${i}" role="button" tabindex="0">
        <span class="texto"><span class="nombre">${escapar(nombreDe(m))}</span>
          ${m.bloques.size
            ? `<span class="detalle">${horasDe(m)} h por semana${horasPresencialesDe(m) ? ` (${horasPresencialesDe(m)} h solo presencial)` : ''}${m.tarifa ? ` · $${escapar(m.tarifa)}/h` : ''}</span>`
            : '<span class="detalle alerta">Sin horario: no aparece en la búsqueda</span>'}</span>
        <button type="button" class="quitar" data-quitar="${i}" aria-label="Quitar ${escapar(nombreDe(m))}">${ICONOS.x}</button>
      </div>`).join('')
    : '<span class="ayuda">Agrega al menos una materia para aparecer en las búsquedas</span>';
}

/** Cuadrícula y tarifa de la materia abierta. */
function pintarActiva() {
  const hay = materias.length > 0;
  document.getElementById('pipeline').hidden = !hay;
  document.getElementById('titulo-cuadricula').hidden = !hay;
  document.querySelector('.cuadricula').hidden = !hay;
  document.getElementById('sin-materias').hidden = hay;
  if (!hay) { pintarMaterias(); return; }
  activa = Math.min(activa, materias.length - 1);
  const m = materias[activa];
  selActiva.innerHTML = materias.map((x, i) => `<option value="${i}"${i === activa ? ' selected' : ''}>${escapar(nombreDe(x))}</option>`).join('');
  selCopiar.innerHTML = '<option value="">Copiar horario de…</option>' + materias
    .map((x, i) => (i === activa || !x.bloques.size ? '' : `<option value="${i}">${escapar(nombreDe(x))}</option>`)).join('');
  selCopiar.hidden = selCopiar.options.length === 1;
  campoTarifa.value = m.tarifa;
  // Horas que ya están marcadas en otras materias: se señalan para que el docente lo sepa
  const enOtras = new Map();
  materias.forEach((x, i) => {
    if (i === activa) return;
    for (const k of x.bloques.keys()) {
      if (!enOtras.has(k)) enOtras.set(k, []);
      enOtras.get(k).push(nombreMateria.get(x.materia_id));
    }
  });
  for (const c of celdas) {
    const k = claveBloque(c.dataset.dia, c.dataset.hora);
    marcarOtras(c, enOtras.get(k) || []);
    pintarCelda(c, m.bloques.get(k));
  }
  document.getElementById('leyenda-otras').hidden = !enOtras.size;
  pintarMaterias();
}

/** Una casilla: vacía, horas virtuales (ámbar) u horas solo presenciales (violeta). */
/** Etiqueta pequeña en la casilla con las otras materias que usan esa hora (ej: "Fís" o "Fís+1"). */
function marcarOtras(c, nombres) {
  c.classList.toggle('en-otra', nombres.length > 0);
  c.querySelector('.otra')?.remove();
  if (!nombres.length) return;
  const corto = nombres[0].normalize('NFC').slice(0, 3);
  c.insertAdjacentHTML('beforeend', `<span class="otra" aria-hidden="true">${escapar(corto)}${nombres.length > 1 ? `+${nombres.length - 1}` : ''}</span>`);
  c.dataset.otras = `También marcada en: ${nombres.join(', ')}`;
}

function pintarCelda(c, modo) {
  c.classList.toggle('marcada', Boolean(modo));
  c.classList.toggle('presencial', modo === 'presencial');
  c.setAttribute('aria-pressed', String(Boolean(modo)));
  c.title = (modo === 'presencial' ? 'Solo presencial' : modo ? 'Horas virtuales (también presencial)' : 'Libre')
    + (c.classList.contains('en-otra') && c.dataset.otras ? `. ${c.dataset.otras}` : '');
}

const ofreceVirtual = () => document.getElementById('mod-virtual').checked;
const ofrecePresencial = () => document.getElementById('mod-presencial').checked;

/** Orden al tocar: vacía → virtual → solo presencial → vacía (según las modalidades que ofrece). */
function siguienteModo(actual) {
  const ciclo = [null, ofreceVirtual() && 'virtual', ofrecePresencial() && 'presencial'].filter((v, i) => i === 0 || v);
  return ciclo[(ciclo.indexOf(actual ?? null) + 1) % ciclo.length];
}

function elegir(i) {
  activa = i;
  pintarActiva();
}

function pintarGoogle(conectado, permiso) {
  if (conectado && permiso === 'sin_permiso') {
    estadoGoogle.innerHTML = '<button type="button" class="google-desconectado" id="conectar-google">Actualizar permiso de Google</button>';
  } else if (conectado) {
    estadoGoogle.innerHTML = `<span class="ok" title="Tus eventos de Google Calendar bloquean esos horarios automáticamente">${ICONOS.check} Google Calendar conectado</span>`;
  } else if (publica.googleCalendar) {
    estadoGoogle.innerHTML = '<button type="button" class="google-desconectado" id="conectar-google">Conectar Google Calendar</button>';
  } else {
    estadoGoogle.innerHTML = '';
  }
}

// Llenar el formulario con lo guardado
document.getElementById('mod-virtual').checked = config.perfil.ofrece_virtual;
document.getElementById('mod-presencial').checked = config.perfil.ofrece_presencial;
document.getElementById('zona-d').value = config.perfil.zona_presencial || '';
const campoZona = document.getElementById('campo-zona');
const actualizarZona = () => { campoZona.hidden = !document.getElementById('mod-presencial').checked; };
document.getElementById('mod-presencial').addEventListener('change', actualizarZona);

// Si cambia las modalidades, las casillas se ajustan: sin presencial no hay horas "solo presencial"
// y sin virtual todas las horas son presenciales
function ajustarModos() {
  let cambio = false;
  for (const m of materias) {
    for (const [k, v] of m.bloques) {
      const nuevo = !ofrecePresencial() ? 'virtual' : !ofreceVirtual() ? 'presencial' : v;
      if (nuevo !== v) { m.bloques.set(k, nuevo); cambio = true; }
    }
  }
  if (cambio) {
    pintarActiva();
    aviso(ofrecePresencial() ? 'Todas tus horas quedaron como presenciales.' : 'Tus horas solo presenciales pasaron a ser horas virtuales.');
  }
  document.getElementById('leyenda-presencial').hidden = !ofrecePresencial() || !ofreceVirtual();
}
document.getElementById('mod-presencial').addEventListener('change', ajustarModos);
document.getElementById('mod-virtual').addEventListener('change', ajustarModos);
actualizarZona();
pintarActiva();
document.getElementById('leyenda-presencial').hidden = !ofrecePresencial() || !ofreceVirtual();

// La cuadrícula, la tarifa y las herramientas editan solo la materia abierta
function aplicar(c, modo) {
  const k = claveBloque(c.dataset.dia, c.dataset.hora);
  if (modo) materias[activa].bloques.set(k, modo); else materias[activa].bloques.delete(k);
  pintarCelda(c, modo);
}
// Tocar una casilla la cambia (libre → virtual → solo presencial → libre).
// Con el mouse, además, se puede arrastrar para pintar varias casillas con el mismo estado.
let pintando;          // estado que se está pintando mientras se arrastra (undefined = no arrastra)
let ignorarClic = false;
cuadricula.addEventListener('pointerdown', (ev) => {
  const c = ev.target.closest('.celda');
  if (!c || !materias[activa] || ev.pointerType !== 'mouse' || ev.button !== 0) return;
  ev.preventDefault();
  pintando = siguienteModo(materias[activa].bloques.get(claveBloque(c.dataset.dia, c.dataset.hora))) || null;
  aplicar(c, pintando);
  ignorarClic = true;
});
cuadricula.addEventListener('pointerover', (ev) => {
  const c = ev.target.closest('.celda');
  if (c && pintando !== undefined) aplicar(c, pintando);
});
document.addEventListener('pointerup', () => {
  if (pintando !== undefined) { pintando = undefined; pintarMaterias(); }
});
cuadricula.addEventListener('click', (ev) => {
  const c = ev.target.closest('.celda');
  if (!c || !materias[activa]) return;
  if (ignorarClic) { ignorarClic = false; return; }   // ya lo hizo el mouse
  aplicar(c, siguienteModo(materias[activa].bloques.get(claveBloque(c.dataset.dia, c.dataset.hora))));
  pintarMaterias();
});
campoTarifa.addEventListener('input', () => {
  if (!materias[activa]) return;
  materias[activa].tarifa = campoTarifa.value;
  pintarMaterias();
});
selActiva.addEventListener('change', () => elegir(Number(selActiva.value)));
selCopiar.addEventListener('change', () => {
  const origen = materias[Number(selCopiar.value)];
  if (!origen) return;
  materias[activa].bloques = new Map(origen.bloques);
  pintarActiva();
  aviso(`Copiamos el horario de ${nombreDe(origen)}. Ajústalo si quieres y guarda.`);
});
document.getElementById('limpiar').addEventListener('click', () => {
  if (!materias[activa]) return;
  materias[activa].bloques.clear();
  pintarActiva();
});
pintarGoogle(yo.google_conectado, config.google);
if (yo.google_conectado && config.google === 'sin_permiso') {
  aviso('Actualiza el permiso de Google para que tus eventos del calendario bloqueen horarios automáticamente.');
}

// Materias: agregar (de la lista o una nueva) y quitar
const selMateria = document.getElementById('am-m');
const zonaNueva = document.getElementById('am-nueva');
const campoNombre = document.getElementById('am-nombre');
const campoArea = document.getElementById('am-area');
const formMateria = document.getElementById('form-materia');

function pintarOpcionesMaterias() {
  const grupos = new Map();
  for (const m of catalogos.materias) {
    if (!grupos.has(m.area)) grupos.set(m.area, []);
    grupos.get(m.area).push(m);
  }
  selMateria.innerHTML = [...grupos].map(([area, lista]) => `<optgroup label="${escapar(area)}">${
    lista.map((m) => `<option value="${m.id}">${escapar(m.nombre)}</option>`).join('')}</optgroup>`).join('')
    + '<option value="nueva">+ Otra materia (no está en la lista)</option>';
  document.getElementById('am-areas').innerHTML = catalogos.areas.map((a) => `<option value="${escapar(a)}">`).join('');
}

function modoNueva(activo) {
  zonaNueva.hidden = !activo;
  campoNombre.required = activo;
  campoArea.required = activo;
}

/** Abre la ventana directo en "Otra materia" con el nombre ya escrito. */
function proponerNueva(nombre) {
  selMateria.value = 'nueva';
  modoNueva(true);
  campoNombre.value = nombre;
  campoArea.value = '';
  abrirVentana('agregar-materia');
  aviso(`"${nombre}" no está en la lista. Elige su área y agrégala.`);
}

pintarOpcionesMaterias();
modoNueva(false);
document.getElementById('am-n').innerHTML = catalogos.niveles.map((n) => `<option value="${n.id}"${n.nombre === 'Universitario' ? ' selected' : ''}>${escapar(n.nombre)}</option>`).join('');
selMateria.addEventListener('change', () => {
  modoNueva(selMateria.value === 'nueva');
  if (selMateria.value === 'nueva') campoNombre.focus();
});

function agregarALista(materiaId) {
  const nivelId = Number(document.getElementById('am-n').value);
  const existente = materias.findIndex((m) => m.materia_id === materiaId && m.nivel_id === nivelId);
  if (existente >= 0) {
    aviso('Esa materia ya está en tu lista', 'error');
    elegir(existente);
    return;
  }
  materias.push(nuevaMateria(materiaId, nivelId));
  elegir(materias.length - 1);
  aviso(`Ahora marca el horario y la tarifa de ${nombreDe(materias[activa])}.`);
}

function terminarAgregar() {
  cerrarVentana('agregar-materia');
  formMateria.reset();
  pintarOpcionesMaterias();
  modoNueva(false);
  if (porCrear.length) setTimeout(() => proponerNueva(porCrear.shift()), 300);
}

formMateria.addEventListener('submit', (ev) => {
  ev.preventDefault();
  mostrarError(formMateria, '');
  if (selMateria.value !== 'nueva') {
    agregarALista(Number(selMateria.value));
    terminarAgregar();
    return;
  }
  conBoton(ev.submitter, async () => {
    try {
      const { materia, nueva } = await api('/materias', { metodo: 'POST', cuerpo: { nombre: campoNombre.value, area: campoArea.value } });
      if (!catalogos.materias.some((m) => m.id === materia.id)) {
        catalogos.materias.push({ ...materia, tutores: 0 });
        catalogos.materias.sort((a, b) => a.area.localeCompare(b.area, 'es') || a.nombre.localeCompare(b.nombre, 'es'));
        if (!catalogos.areas.includes(materia.area)) catalogos.areas.push(materia.area);
      }
      nombreMateria.set(materia.id, materia.nombre);
      agregarALista(materia.id);
      aviso(nueva
        ? `Creamos "${materia.nombre}" en ${materia.area}. Guarda los cambios para aparecer en la búsqueda.`
        : `"${materia.nombre}" ya estaba en la lista; la agregamos a tus materias.`, 'exito');
      terminarAgregar();
    } catch (error) {
      mostrarError(formMateria, error.message);
    }
  });
});
document.querySelector('#agregar-materia [data-cerrar]').addEventListener('click', () => {
  formMateria.reset();
  modoNueva(false);
  porCrear.length = 0;
});
if (porCrear.length) setTimeout(() => proponerNueva(porCrear.shift()), 600);
listaMaterias.addEventListener('click', (ev) => {
  const quitar = ev.target.closest('[data-quitar]');
  if (quitar) {
    const i = Number(quitar.dataset.quitar);
    materias.splice(i, 1);
    if (activa >= i && activa > 0) activa -= 1;
    pintarActiva();
    return;
  }
  const item = ev.target.closest('[data-elegir]');
  if (item) elegir(Number(item.dataset.elegir));
});
listaMaterias.addEventListener('keydown', (ev) => {
  const item = ev.target.closest('[data-elegir]');
  if (item && (ev.key === 'Enter' || ev.key === ' ')) { ev.preventDefault(); elegir(Number(item.dataset.elegir)); }
});

// Conectar Google Calendar a una cuenta creada con correo
estadoGoogle.addEventListener('click', (ev) => {
  if (!ev.target.closest('#conectar-google')) return;
  conBoton(ev.target, async () => {
    const a = await auth();
    const { error } = await a.linkIdentity({
      provider: 'google',
      options: { redirectTo: location.href, scopes: ALCANCE_CALENDARIO, queryParams: { access_type: 'offline', prompt: 'consent' } },
    });
    if (error) throw error;
  });
});

// Guardar todo: cada materia con su tarifa y su cuadrícula
/** Junta las casillas seguidas del mismo día y estado en un solo bloque (8, 9 y 10 → 08:00 a 11:00). */
function aBloques(bloques) {
  const lista = [...bloques].map(([k, modalidad]) => {
    const [dia, hora] = k.split('|');
    return { dia: Number(dia), h: Number(hora.slice(0, 2)), modalidad };
  }).sort((a, b) => a.dia - b.dia || a.h - b.h);
  const salida = [];
  for (const c of lista) {
    const ultimo = salida[salida.length - 1];
    if (ultimo && ultimo.dia === c.dia && ultimo.hasta === c.h && ultimo.modalidad === c.modalidad) ultimo.hasta += 1;
    else salida.push({ dia: c.dia, desde: c.h, hasta: c.h + 1, modalidad: c.modalidad });
  }
  return salida.map((b) => ({ dia_semana: b.dia, hora_inicio: `${dosDigitos(b.desde)}:00`, hora_fin: `${dosDigitos(b.hasta)}:00`, modalidad: b.modalidad }));
}
document.getElementById('guardar').addEventListener('click', (ev) => {
  mostrarError(lado, '');
  const sinTarifa = materias.findIndex((m) => !m.tarifa);
  if (sinTarifa >= 0) {
    elegir(sinTarifa);
    campoTarifa.focus();
    return mostrarError(lado, `Escribe la tarifa por hora de ${nombreDe(materias[sinTarifa])}`);
  }

  conBoton(ev.currentTarget, async () => {
    try {
      const guardado = await api('/docente/configuracion', {
        metodo: 'PUT',
        cuerpo: {
          ofrece_virtual: document.getElementById('mod-virtual').checked,
          ofrece_presencial: document.getElementById('mod-presencial').checked,
          zona_presencial: document.getElementById('zona-d').value,
          materias: materias.map((m) => ({
            materia_id: m.materia_id,
            nivel_id: m.nivel_id,
            tarifa_hora: m.tarifa,
            disponibilidad: aBloques(m.bloques),
          })),
        },
      });
      try { localStorage.removeItem('tutores-materias-sugeridas'); } catch { /* sin almacenamiento */ }
      const conHorario = guardado.materias.filter((m) => m.disponibilidad.length).length;
      const sinHorario = guardado.materias.length - conHorario;
      aviso(conHorario
        ? `Guardado: ${conHorario} ${conHorario === 1 ? 'materia publicada' : 'materias publicadas'} en la búsqueda${sinHorario ? `; ${sinHorario} sin horario todavía` : ''}.`
        : 'Guardado. Marca el horario de al menos una materia para aparecer en la búsqueda.', conHorario ? 'exito' : '');
    } catch (error) {
      mostrarError(lado, error.message);
    }
  });
});
