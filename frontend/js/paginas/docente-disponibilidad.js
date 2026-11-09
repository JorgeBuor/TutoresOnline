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

// Materias elegidas: [{ materia_id, nivel_id }]
let materias = config.materias.map(({ materia_id, nivel_id }) => ({ materia_id, nivel_id }));

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
      if (!materias.some((x) => x.materia_id === m.id)) materias.push({ materia_id: m.id, nivel_id: universitario });
    } else {
      porCrear.push(texto);
    }
  }
  if (materias.length) aviso('Agregamos las materias que escribiste al registrarte. Revisa y guarda.');
}

function pintarMaterias() {
  listaMaterias.innerHTML = materias.length
    ? materias.map((m, i) => `<span class="etiqueta-materia">${escapar(nombreMateria.get(m.materia_id))} · ${escapar(nombreNivel.get(m.nivel_id))}
        <button type="button" data-quitar="${i}" aria-label="Quitar materia">${ICONOS.x}</button></span>`).join('')
    : '<span class="ayuda">Agrega al menos una materia para aparecer en las búsquedas</span>';
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
if (config.materias.length) document.getElementById('tarifa-d').value = Math.round(config.materias[0].tarifa_hora).toLocaleString('es-CO');
for (const b of config.disponibilidad) {
  const celda = document.querySelector(`input[data-dia="${b.dia_semana}"][data-hora="${b.hora_inicio}"]`);
  if (celda) celda.checked = true;
}
const campoZona = document.getElementById('campo-zona');
const actualizarZona = () => { campoZona.hidden = !document.getElementById('mod-presencial').checked; };
document.getElementById('mod-presencial').addEventListener('change', actualizarZona);
actualizarZona();
pintarMaterias();
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
  const nueva = { materia_id: materiaId, nivel_id: Number(document.getElementById('am-n').value) };
  if (materias.some((m) => m.materia_id === nueva.materia_id && m.nivel_id === nueva.nivel_id)) {
    aviso('Esa materia ya está en tu lista', 'error');
    return;
  }
  materias.push(nueva);
  pintarMaterias();
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
  if (!quitar) return;
  materias.splice(Number(quitar.dataset.quitar), 1);
  pintarMaterias();
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

// Guardar todo
document.getElementById('guardar').addEventListener('click', (ev) => {
  mostrarError(lado, '');
  const tarifa = document.getElementById('tarifa-d').value;
  const bloques = [...document.querySelectorAll('.cuadricula input:checked')].map((c) => {
    const [h, m] = c.dataset.hora.split(':').map(Number);
    return { dia_semana: Number(c.dataset.dia), hora_inicio: c.dataset.hora, hora_fin: `${String(h + 2).padStart(2, '0')}:${String(m).padStart(2, '0')}` };
  });
  if (materias.length && !tarifa) return mostrarError(lado, 'Escribe tu tarifa por hora');

  conBoton(ev.currentTarget, async () => {
    try {
      const guardado = await api('/docente/configuracion', {
        metodo: 'PUT',
        cuerpo: {
          ofrece_virtual: document.getElementById('mod-virtual').checked,
          ofrece_presencial: document.getElementById('mod-presencial').checked,
          zona_presencial: document.getElementById('zona-d').value,
          materias: materias.map((m) => ({ ...m, tarifa_hora: tarifa })),
          disponibilidad: bloques,
        },
      });
      try { localStorage.removeItem('tutores-materias-sugeridas'); } catch { /* sin almacenamiento */ }
      const t = guardado.materias[0]?.tarifa_hora;
      aviso(`Guardado: ${guardado.materias.length} materias${t ? ` a ${dinero(t)}/h` : ''} y ${guardado.disponibilidad.length} bloques. Ya apareces en la búsqueda.`, 'exito');
    } catch (error) {
      mostrarError(lado, error.message);
    }
  });
});
