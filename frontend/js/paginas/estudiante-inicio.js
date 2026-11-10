import { iniciarPagina, api, avatar, escapar, fechaHora, etiquetaEstado, ICONOS, vacio, conBoton, aviso, crearVentana } from '../app.js';
import { ventanaDetalle, botonChat, accionesClase } from '../clase-detalle.js';

await iniciarPagina();
const listaProximas = document.getElementById('lista-proximas');
const listaCalificar = document.getElementById('lista-calificar');
let clases = [];

/** Tarjeta de clase: toda la tarjeta abre el detalle; chat y la acción principal quedan a mano. */
function tarjetaClase(t, i) {
  const lugar = t.modalidad === 'virtual' ? 'Google Meet' : escapar(t.lugar || 'Por acordar');
  const puede = accionesClase(t, 'estudiante');
  let principal = '<button class="btn chico claro" type="button" data-ver>Detalles</button>';
  if (puede.unirse) principal = '<a class="btn chico" href="/compartidas/clases-virtuales.html?rol=estudiante">Unirse</a>';
  else if (t.estado === 'pendiente' && puede.cancelar) principal = '<button class="btn chico claro" type="button" data-ver>Cancelar</button>';
  else if (t.estado === 'completada' && !t.calificacion) principal = `<button class="btn chico" type="button" data-calificar="${t.id}" data-docente="${escapar(t.docente)}">Calificar</button>`;
  return `
    <article class="tarjeta clase" data-detalle="${i}" tabindex="0" aria-label="Ver detalle de la clase con ${escapar(t.docente)}">
      <div class="cabeza">${avatar(t.docente, t.docente_id)}
        <div class="info"><div class="titulo-persona">${escapar(t.docente)}</div><div class="subtexto">${escapar(t.materia)}</div>
          <div class="ver-detalle">Ver detalle ›</div></div>
        ${etiquetaEstado(t.estado)}
      </div>
      <div class="pie">
        <div><div class="dato">${ICONOS.reloj}${fechaHora(t.inicio)}</div>
          <div class="chip-modalidad ${t.modalidad}">${t.modalidad === 'virtual' ? 'Virtual' : 'Presencial'} · ${lugar}</div></div>
        <div class="acciones-clase">${botonChat(t, 'estudiante')}${principal}</div>
      </div>
    </article>`;
}

const vistaActual = () => document.querySelector('input[name=vista]:checked').value;

async function cargar() {
  const vista = vistaActual();
  const [lista, historial] = await Promise.all([
    api(`/tutorias?vista=${vista}`),
    api('/tutorias?vista=historial'),
  ]);
  if (vista !== vistaActual()) return;
  clases = lista;
  listaProximas.innerHTML = lista.length
    ? lista.map(tarjetaClase).join('')
    : vista === 'proximas'
      ? vacio('Todavía no tienes clases agendadas.', '<a class="btn" href="/estudiante/agendar.html">Buscar un tutor</a>')
      : vacio('Aquí verás tus clases pasadas, canceladas o rechazadas.');

  const porCalificar = historial.filter((t) => t.estado === 'completada' && !t.calificacion);
  document.getElementById('sec-calificar').hidden = !porCalificar.length;
  listaCalificar.innerHTML = porCalificar.map((t) => `
    <article class="tarjeta clase">
      <div class="cabeza">${avatar(t.docente, t.docente_id)}
        <div class="info"><div class="titulo-persona">${escapar(t.docente)}</div><div class="subtexto">${escapar(t.materia)} · ${fechaHora(t.inicio)}</div></div>
      </div>
      <div class="pie"><span class="subtexto">¿Cómo te fue en la clase?</span>
        <button class="btn chico" data-calificar="${t.id}" data-docente="${escapar(t.docente)}">Calificar</button></div>
    </article>`).join('');
}

document.querySelectorAll('input[name=vista]').forEach((r) => r.addEventListener('change', () => {
  listaProximas.innerHTML = '<div class="cargando" aria-label="Cargando"><span></span><span></span><span></span></div>';
  cargar().catch((e) => { listaProximas.innerHTML = vacio(escapar(e.message)); });
}));

function ventanaCalificar(id, docente) {
  const estrellas = [1, 2, 3, 4, 5].map((n) => `<label data-n="${n}"><input type="radio" name="estrellas" value="${n}" required>${ICONOS.estrella}<span class="oculto">${n} estrellas</span></label>`).join('');
  const ventana = crearVentana(`
    <form class="tarjeta">
      <h2>Califica a ${escapar(docente)}</h2>
      <p>Tu calificación ayuda a otros estudiantes a elegir tutor.</p>
      <div class="calificar">${estrellas}</div>
      <div class="campo izq"><textarea class="entrada" name="comentario" placeholder="Comentario opcional" maxlength="1000"></textarea></div>
      <div class="acciones"><button class="btn" type="submit">Enviar calificación</button><a class="btn claro" href="#" data-cerrar>Cancelar</a></div>
    </form>`);
  const etiquetas = ventana.querySelectorAll('.calificar label');
  ventana.querySelectorAll('input[name=estrellas]').forEach((radio) => radio.addEventListener('change', () => {
    etiquetas.forEach((l) => l.classList.toggle('activa', Number(l.dataset.n) <= Number(radio.value)));
  }));
  ventana.querySelector('form').addEventListener('submit', (ev) => {
    ev.preventDefault();
    const datos = new FormData(ev.target);
    if (!datos.get('estrellas')) return aviso('Elige de 1 a 5 estrellas', 'error');
    conBoton(ev.submitter, async () => {
      await api(`/tutorias/${id}/resena`, { metodo: 'POST', cuerpo: { estrellas: Number(datos.get('estrellas')), comentario: datos.get('comentario') } });
      ventana.remove();
      aviso('¡Gracias por calificar!', 'exito');
      await cargar();
    });
  });
}

document.addEventListener('click', (ev) => {
  const calificar = ev.target.closest('[data-calificar]');
  if (calificar) return ventanaCalificar(calificar.dataset.calificar, calificar.dataset.docente);
  if (ev.target.closest('a, button:not([data-ver])')) return;   // enlaces y otros botones hacen lo suyo
  const tarjeta = ev.target.closest('[data-detalle]');
  if (tarjeta) ventanaDetalle(clases[Number(tarjeta.dataset.detalle)], 'estudiante', cargar);
});
listaProximas.addEventListener('keydown', (ev) => {
  const tarjeta = ev.target.closest('[data-detalle]');
  if (tarjeta && ev.target === tarjeta && (ev.key === 'Enter' || ev.key === ' ')) {
    ev.preventDefault();
    ventanaDetalle(clases[Number(tarjeta.dataset.detalle)], 'estudiante', cargar);
  }
});

cargar().catch((e) => { listaProximas.innerHTML = vacio(escapar(e.message)); });
