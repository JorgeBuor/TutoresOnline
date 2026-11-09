import { iniciarPagina, api, avatar, escapar, fechaHora, etiquetaEstado, ICONOS, vacio, conBoton, aviso, crearVentana } from '../app.js';

await iniciarPagina();
const listaProximas = document.getElementById('lista-proximas');
const listaCalificar = document.getElementById('lista-calificar');

function tarjetaClase(t) {
  const lugar = t.modalidad === 'virtual' ? 'Google Meet' : escapar(t.lugar || 'Por acordar');
  let boton;
  if (t.estado === 'confirmada' && t.modalidad === 'virtual') {
    boton = `<a class="btn chico" href="/compartidas/clases-virtuales.html?rol=estudiante">Unirse</a>`;
  } else if (t.estado === 'pendiente') {
    boton = `<button class="btn chico claro" data-cancelar="${t.id}">Cancelar</button>`;
  } else {
    boton = `<a class="btn chico claro" href="/compartidas/chat.html?rol=estudiante&con=${t.docente_id}">Chat</a>`;
  }
  return `
    <article class="tarjeta clase">
      <div class="cabeza">${avatar(t.docente, t.docente_id)}
        <div class="info"><div class="titulo-persona">${escapar(t.docente)}</div><div class="subtexto">${escapar(t.materia)}</div></div>
        ${etiquetaEstado(t.estado)}
      </div>
      <div class="pie">
        <div><div class="dato">${ICONOS.reloj}${fechaHora(t.inicio)}</div>
          <div class="chip-modalidad ${t.modalidad}">${t.modalidad === 'virtual' ? 'Virtual' : 'Presencial'} · ${lugar}</div></div>
        ${boton}
      </div>
    </article>`;
}

async function cargar() {
  const [proximas, historial] = await Promise.all([
    api('/tutorias?vista=proximas'),
    api('/tutorias?vista=historial'),
  ]);
  listaProximas.innerHTML = proximas.length
    ? proximas.map(tarjetaClase).join('')
    : vacio('Todavía no tienes clases agendadas.', '<a class="btn" href="/estudiante/agendar.html">Buscar un tutor</a>');

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
  const cancelar = ev.target.closest('[data-cancelar]');
  if (cancelar) {
    if (!confirm('¿Cancelar esta solicitud de clase?')) return;
    conBoton(cancelar, async () => {
      await api(`/tutorias/${cancelar.dataset.cancelar}`, { metodo: 'PATCH', cuerpo: { estado: 'cancelada' } });
      aviso('Clase cancelada');
      await cargar();
    });
  }
  const calificar = ev.target.closest('[data-calificar]');
  if (calificar) ventanaCalificar(calificar.dataset.calificar, calificar.dataset.docente);
});

cargar().catch((e) => { listaProximas.innerHTML = vacio(escapar(e.message)); });
