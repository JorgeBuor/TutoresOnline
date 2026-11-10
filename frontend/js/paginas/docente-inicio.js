import { iniciarPagina, api, avatar, escapar, fechaHora, fechaClave, etiquetaEstado, ICONOS, vacio, conBoton, aviso, dinero } from '../app.js';
import { ventanaDetalle, botonChat } from '../clase-detalle.js';

const porId = new Map();   // clases cargadas, para abrir su detalle

await iniciarPagina();
const listaPendientes = document.getElementById('lista-pendientes');
const listaAgenda = document.getElementById('lista-agenda');
const listaCerrar = document.getElementById('lista-cerrar');

function tarjeta(t, botones) {
  porId.set(t.id, t);
  const lugar = t.modalidad === 'virtual' ? 'Google Meet' : escapar(t.lugar || 'Por acordar');
  return `
    <article class="tarjeta clase" data-detalle="${t.id}" tabindex="0" aria-label="Ver detalle de la clase con ${escapar(t.estudiante)}">
      <div class="cabeza">${avatar(t.estudiante, t.estudiante_id)}
        <div class="info"><div class="titulo-persona">${escapar(t.estudiante)}</div><div class="subtexto">${escapar(t.materia)} · ${dinero(t.tarifa_hora)}/h</div>
          <div class="ver-detalle">Ver detalle ›</div></div>
        ${etiquetaEstado(t.estado)}
      </div>
      <div class="pie">
        <div><div class="dato">${ICONOS.reloj}${fechaHora(t.inicio)}</div>
          <div class="chip-modalidad ${t.modalidad}">${t.modalidad === 'virtual' ? 'Virtual' : 'Presencial'} · ${lugar}</div></div>
        <div class="acciones-clase">${botonChat(t, 'docente')}${botones}</div>
      </div>
    </article>`;
}

async function cargar() {
  const vista = document.querySelector('input[name=vista]:checked').value;
  const [proximas, historial, solicitudes, pasadas] = await Promise.all([
    api('/tutorias?vista=proximas'),
    api('/tutorias?vista=historial'),
    api('/solicitudes').catch(() => []),
    vista === 'pasadas' ? api('/tutorias?vista=pasadas') : [],
  ]);
  const pendientes = proximas.filter((t) => t.estado === 'pendiente');
  const confirmadas = proximas.filter((t) => t.estado === 'confirmada');
  const porCerrar = historial.filter((t) => t.estado === 'confirmada');
  const hoy = confirmadas.filter((t) => fechaClave(new Date(t.inicio)) === fechaClave()).length;

  document.getElementById('resumen-docente').textContent =
    `Tienes ${hoy} ${hoy === 1 ? 'clase' : 'clases'} para hoy, ${pendientes.length} por aceptar y ${solicitudes.length} solicitudes en tiempo real.`;
  const insignia = document.getElementById('badge-solicitudes');
  insignia.hidden = !solicitudes.length;
  insignia.textContent = `${solicitudes.length} ACT`;

  document.getElementById('sec-pendientes').hidden = !pendientes.length;
  listaPendientes.innerHTML = pendientes.map((t) => tarjeta(t, `
    <button class="btn chico claro" data-estado="rechazada" data-id="${t.id}">Rechazar</button>
    <button class="btn chico" data-estado="confirmada" data-id="${t.id}">Aceptar</button>`)).join('');

  if (vista === 'pasadas') {
    listaAgenda.innerHTML = pasadas.length
      ? pasadas.map((t) => tarjeta(t, '<button class="btn chico claro" type="button" data-ver>Detalles</button>')).join('')
      : vacio('Aquí verás tus clases pasadas, canceladas o rechazadas.');
  } else {
    listaAgenda.innerHTML = confirmadas.length
      ? confirmadas.map((t) => tarjeta(t, t.modalidad === 'virtual'
        ? '<a class="btn chico" href="/compartidas/clases-virtuales.html?rol=docente">Iniciar clase</a>'
        : '<button class="btn chico claro" type="button" data-ver>Detalles</button>')).join('')
      : vacio('No tienes clases confirmadas próximamente.', '<a class="btn" href="/docente/disponibilidad.html">Revisar mi disponibilidad</a>');
  }

  document.getElementById('sec-cerrar').hidden = !porCerrar.length;
  listaCerrar.innerHTML = porCerrar.map((t) => tarjeta(t, `<button class="btn chico" data-estado="completada" data-id="${t.id}">Marcar como dictada</button>`)).join('');
}

document.querySelectorAll('input[name=vista]').forEach((r) => r.addEventListener('change', () => {
  listaAgenda.innerHTML = '<div class="cargando" aria-label="Cargando"><span></span><span></span><span></span></div>';
  cargar().catch((e) => { listaAgenda.innerHTML = vacio(escapar(e.message)); });
}));

// Toda la tarjeta abre el detalle de la clase (los enlaces y botones hacen lo suyo)
const abrirDetalle = (el) => ventanaDetalle(porId.get(Number(el.dataset.detalle)), 'docente', cargar);
document.addEventListener('click', (ev) => {
  if (ev.target.closest('a, button:not([data-ver])')) return;
  const tarjeta = ev.target.closest('[data-detalle]');
  if (tarjeta) abrirDetalle(tarjeta);
});
document.addEventListener('keydown', (ev) => {
  const tarjeta = ev.target.closest?.('[data-detalle]');
  if (tarjeta && ev.target === tarjeta && (ev.key === 'Enter' || ev.key === ' ')) { ev.preventDefault(); abrirDetalle(tarjeta); }
});

document.addEventListener('click', (ev) => {
  const boton = ev.target.closest('[data-estado]');
  if (!boton) return;
  const textos = { confirmada: 'Clase aceptada. Avisamos al estudiante', rechazada: 'Solicitud rechazada', completada: 'Clase marcada como dictada' };
  if (boton.dataset.estado === 'rechazada' && !confirm('¿Rechazar esta solicitud de clase?')) return;
  conBoton(boton, async () => {
    await api(`/tutorias/${boton.dataset.id}`, { metodo: 'PATCH', cuerpo: { estado: boton.dataset.estado } });
    aviso(textos[boton.dataset.estado], 'exito');
    await cargar();
  });
});

cargar().catch((e) => { listaAgenda.innerHTML = vacio(escapar(e.message)); });
