import { iniciarPagina, api, auth, escapar, aviso, conBoton, cerrarVentana, mostrarError, ICONOS, ALCANCE_CALENDARIO, dinero } from '../app.js';

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

// Si se registró escribiendo sus materias, se proponen las que coinciden con el catálogo
if (!materias.length) {
  let sugeridas = '';
  try { sugeridas = localStorage.getItem('tutores-materias-sugeridas') || ''; } catch { /* sin almacenamiento */ }
  const universitario = catalogos.niveles.find((n) => n.nombre === 'Universitario')?.id || catalogos.niveles[0].id;
  for (const texto of sugeridas.split(',').map((t) => t.trim().toLowerCase()).filter(Boolean)) {
    const m = catalogos.materias.find((x) => x.nombre.toLowerCase().includes(texto) || texto.includes(x.nombre.toLowerCase()));
    if (m && !materias.some((x) => x.materia_id === m.id)) materias.push({ materia_id: m.id, nivel_id: universitario });
  }
  if (materias.length) aviso('Agregamos las materias que escribiste al registrarte. Revisa y guarda.');
}

function pintarMaterias() {
  listaMaterias.innerHTML = materias.length
    ? materias.map((m, i) => `<span class="etiqueta-materia">${escapar(nombreMateria.get(m.materia_id))} · ${escapar(nombreNivel.get(m.nivel_id))}
        <button type="button" data-quitar="${i}" aria-label="Quitar materia">${ICONOS.x}</button></span>`).join('')
    : '<span class="ayuda">Agrega al menos una materia para aparecer en las búsquedas</span>';
}

function pintarGoogle(conectado) {
  if (conectado) {
    estadoGoogle.innerHTML = `<span class="ok">${ICONOS.check} Google Calendar conectado</span>`;
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
pintarGoogle(yo.google_conectado);

// Materias: agregar y quitar
document.getElementById('am-m').innerHTML = catalogos.materias.map((m) => `<option value="${m.id}">${escapar(m.nombre)}</option>`).join('');
document.getElementById('am-n').innerHTML = catalogos.niveles.map((n) => `<option value="${n.id}"${n.nombre === 'Universitario' ? ' selected' : ''}>${escapar(n.nombre)}</option>`).join('');
document.getElementById('form-materia').addEventListener('submit', (ev) => {
  ev.preventDefault();
  const nueva = { materia_id: Number(document.getElementById('am-m').value), nivel_id: Number(document.getElementById('am-n').value) };
  if (materias.some((m) => m.materia_id === nueva.materia_id && m.nivel_id === nueva.nivel_id)) {
    aviso('Esa materia ya está en tu lista', 'error');
  } else {
    materias.push(nueva);
    pintarMaterias();
  }
  cerrarVentana('agregar-materia');
});
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
