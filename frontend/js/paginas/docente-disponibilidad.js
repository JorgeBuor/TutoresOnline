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
 * [{ materia_id, nivel_id, tarifa, bloques: Set("dia|hora") }]. La pantalla muestra una a la vez.
 */
const claveBloque = (dia, hora) => `${dia}|${hora}`;
const materias = config.materias.map((m) => ({
  materia_id: m.materia_id,
  nivel_id: m.nivel_id,
  tarifa: Math.round(m.tarifa_hora).toLocaleString('es-CO'),
  bloques: new Set(m.disponibilidad.map((b) => claveBloque(b.dia_semana, b.hora_inicio))),
}));
// Se abre primero una materia que ya tenga horario
let activa = Math.max(0, materias.findIndex((m) => m.bloques.size));
const nuevaMateria = (materiaId, nivelId) => ({
  materia_id: materiaId,
  nivel_id: nivelId,
  tarifa: materias[activa]?.tarifa || '',   // se propone la tarifa de la materia que estaba abierta
  bloques: new Set(),
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
const horasDe = (m) => m.bloques.size * 2;
const selActiva = document.getElementById('materia-activa');
const selCopiar = document.getElementById('copiar-de');
const campoTarifa = document.getElementById('tarifa-d');
const celdas = [...document.querySelectorAll('.cuadricula input')];

/** Lista de la derecha: cada materia con sus horas marcadas y su tarifa; la abierta se resalta. */
function pintarMaterias() {
  listaMaterias.innerHTML = materias.length
    ? materias.map((m, i) => `
      <div class="pipeline-item${i === activa ? ' activa' : ''}" data-elegir="${i}" role="button" tabindex="0">
        <span class="texto"><span class="nombre">${escapar(nombreDe(m))}</span>
          ${m.bloques.size
            ? `<span class="detalle">${horasDe(m)} h por semana${m.tarifa ? ` · $${escapar(m.tarifa)}/h` : ''}</span>`
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
  for (const c of celdas) c.checked = m.bloques.has(claveBloque(c.dataset.dia, c.dataset.hora));
  pintarMaterias();
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
actualizarZona();
pintarActiva();

// La cuadrícula, la tarifa y las herramientas editan solo la materia abierta
document.querySelector('.cuadricula').addEventListener('change', (ev) => {
  const c = ev.target;
  if (!c.dataset.dia || !materias[activa]) return;
  const k = claveBloque(c.dataset.dia, c.dataset.hora);
  if (c.checked) materias[activa].bloques.add(k); else materias[activa].bloques.delete(k);
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
  materias[activa].bloques = new Set(origen.bloques);
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
const aBloque = (k) => {
  const [dia, hora] = k.split('|');
  const [h, m] = hora.split(':').map(Number);
  return { dia_semana: Number(dia), hora_inicio: hora, hora_fin: `${String(h + 2).padStart(2, '0')}:${String(m).padStart(2, '0')}` };
};
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
            disponibilidad: [...m.bloques].map(aBloque),
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
