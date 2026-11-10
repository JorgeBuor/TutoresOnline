import { iniciarPagina, api, avatar, escapar, dinero, estrellas, vacio, conBoton, aviso, crearVentana, mostrarError, ICONOS } from '../app.js';

/*
 * Tiempo real (estilo InDrive): el estudiante publica UNA solicitud y se abre una ventana de espera
 * donde llegan las ofertas en vivo. Desde ahí acepta una, cambia la solicitud o la cancela.
 */
await iniciarPagina();
const formulario = document.getElementById('form-solicitud');

const { materias } = await api('/catalogos');
document.getElementById('materia-tr').insertAdjacentHTML('beforeend',
  materias.map((m) => `<option value="${m.id}">${escapar(m.nombre)}</option>`).join(''));

const mostrarCiudad = () => {
  document.getElementById('campo-ciudad').hidden = formulario.querySelector('input[name=mod-tr]:checked').value !== 'presencial';
};
formulario.querySelectorAll('input[name=mod-tr]').forEach((r) => r.addEventListener('change', mostrarCiudad));

const textoDuracion = (min) => (min < 60 ? `${min} minutos` : min === 60 ? '1 hora' : `${min / 60} horas`);

/* ---------- Ventana de espera ---------- */
let ventana = null;
let temporizador = null;
let reloj = null;
let solicitud = null;

function cerrarEspera() {
  clearInterval(temporizador);
  clearInterval(reloj);
  ventana?.remove();
  ventana = null;
  solicitud = null;
}

function pintarOfertas(ofertas) {
  if (!ventana) return;
  ventana.querySelector('#num-ofertas').textContent = ofertas.length ? `(${ofertas.length})` : '';
  ventana.querySelector('#lista-ofertas').innerHTML = ofertas.length
    ? ofertas.map((o) => `
      <article class="tarjeta oferta">${avatar(o.docente, o.docente_id)}
        <div class="info"><div class="titulo-persona">${escapar(o.docente)}</div>
          <div class="meta">${estrellas(o.calificacion_promedio, o.total_resenas)}<span>Empieza en ${o.minutos_llegada} min</span></div></div>
        <div class="monto">${dinero(o.tarifa_ofertada)}<small>/h</small></div>
        <button class="btn chico turquesa" type="button" data-aceptar="${o.id}" data-docente="${escapar(o.docente)}">Aceptar</button>
      </article>`).join('')
    : vacio('Esperando ofertas de los tutores conectados…');
}

function contarTiempo() {
  const restante = Math.max(0, new Date(solicitud.expira_en) - Date.now());
  const min = Math.floor(restante / 60000);
  const seg = Math.floor((restante % 60000) / 1000);
  const campo = ventana?.querySelector('#cuenta-regresiva');
  if (campo) campo.textContent = `${min}:${String(seg).padStart(2, '0')}`;
}

/** Cambia el contenido de la ventana por un mensaje final (confirmada o vencida). */
function finalizar(html) {
  clearInterval(temporizador);
  clearInterval(reloj);
  ventana.innerHTML = html;
  ventana.querySelector('[data-cerrar-espera]')?.addEventListener('click', (ev) => { ev.preventDefault(); cerrarEspera(); });
}

async function revisar() {
  if (!solicitud) return;
  try {
    const s = await api(`/solicitudes/${solicitud.id}`);
    if (s.estado === 'abierta') return pintarOfertas(s.ofertas);
    if (s.estado === 'expirada') {
      llenarFormulario(solicitud);
      return finalizar(`
        <div class="tarjeta">
          <div class="exito" style="background:var(--coral-claro, #FFEFEF);color:var(--coral)">${ICONOS.reloj}</div>
          <h2>Tu solicitud venció</h2>
          <p>Pasaron 30 minutos sin que aceptaras una oferta. Dejamos tus datos en el formulario para que la publiques de nuevo.</p>
          <div class="acciones"><a class="btn coral" href="#" data-cerrar-espera>Entendido</a></div>
        </div>`);
    }
    cerrarEspera();   // se canceló o se asignó desde otra pestaña
  } catch (error) {
    console.error(error);
  }
}

function abrirEspera(s) {
  cerrarEspera();
  solicitud = s;
  const materia = s.materia || materias.find((m) => m.id === s.materia_id)?.nombre || '';
  ventana = crearVentana(`
    <div class="tarjeta espera" aria-live="polite">
      <div class="cabeza-espera">
        <div class="radar">${ICONOS.reloj}</div>
        <h2>Buscando tutor…</h2>
        <div class="cuenta">Tu solicitud vence en <b id="cuenta-regresiva">30:00</b></div>
      </div>
      <p class="resumen-sol"><b>${escapar(s.tema)}</b>
        <small>${escapar(materia)} · ${textoDuracion(s.duracion_min)} · ${s.modalidad === 'presencial' ? `presencial en ${escapar(s.ciudad || '')}` : 'virtual'} · sugeriste ${dinero(s.tarifa_sugerida)}/h</small></p>
      <div class="seccion-titulo"><span class="etiqueta-seccion">Ofertas de tutores <span id="num-ofertas"></span></span><span class="en-vivo">En vivo</span></div>
      <div class="lista" id="lista-ofertas">${vacio('Esperando ofertas de los tutores conectados…')}</div>
      <p class="ayuda">Al aceptar una oferta, la clase queda confirmada y las demás se cierran solas.</p>
      <div class="acciones">
        <button class="btn claro" type="button" id="cambiar-sol">Cambiar solicitud</button>
        <button class="btn claro peligro" type="button" id="cancelar-sol">Cancelar solicitud</button>
      </div>
    </div>`, { cerrable: false });

  ventana.querySelector('#cancelar-sol').addEventListener('click', (ev) => conBoton(ev.currentTarget, async () => {
    await api(`/solicitudes/${solicitud.id}`, { metodo: 'PATCH', cuerpo: { estado: 'cancelada' } });
    cerrarEspera();
    aviso('Cancelaste la solicitud.');
  }));

  // Cambiar = cancelar esta y volver al formulario con los mismos datos para ajustarlos
  ventana.querySelector('#cambiar-sol').addEventListener('click', (ev) => conBoton(ev.currentTarget, async () => {
    const anterior = solicitud;
    await api(`/solicitudes/${anterior.id}`, { metodo: 'PATCH', cuerpo: { estado: 'cancelada' } });
    cerrarEspera();
    llenarFormulario(anterior);
    document.getElementById('tema').focus();
    aviso('Ajusta tu solicitud y vuelve a publicarla.');
  }));

  ventana.addEventListener('click', (ev) => {
    const boton = ev.target.closest('[data-aceptar]');
    if (!boton) return;
    conBoton(boton, async () => {
      const { tutoria } = await api(`/ofertas/${boton.dataset.aceptar}`, { metodo: 'PATCH', cuerpo: { estado: 'aceptada' } });
      formulario.reset();
      mostrarCiudad();
      const enlace = tutoria.modalidad === 'virtual'
        ? '<a class="btn" href="/compartidas/clases-virtuales.html?rol=estudiante">Ir a la clase</a>'
        : '<a class="btn" href="/estudiante/inicio.html">Ver mis clases</a>';
      finalizar(`
        <div class="tarjeta">
          <div class="exito">${ICONOS.check}</div>
          <h2>¡Tutor confirmado!</h2>
          <p>${escapar(boton.dataset.docente)} dará tu clase de ${escapar(tutoria.materia)} por ${dinero(tutoria.tarifa_hora)}/hora.</p>
          <div class="acciones">${enlace}<a class="btn claro" href="/compartidas/chat.html?rol=estudiante&con=${tutoria.docente_id}">Escribirle</a></div>
        </div>`);
    });
  });

  contarTiempo();
  reloj = setInterval(contarTiempo, 1000);
  revisar();
  temporizador = setInterval(revisar, 4000);
}

/** Pone en el formulario los datos de una solicitud (para cambiarla o volver a publicarla). */
function llenarFormulario(s) {
  document.getElementById('tema').value = s.tema;
  document.getElementById('materia-tr').value = s.materia_id || '';
  document.getElementById('tarifa').value = Math.round(s.tarifa_sugerida).toLocaleString('es-CO');
  const duracion = document.getElementById('duracion');
  if ([...duracion.options].some((o) => Number(o.value) === s.duracion_min)) duracion.value = String(s.duracion_min);
  formulario.querySelector(`input[name=mod-tr][value=${s.modalidad}]`).checked = true;
  document.getElementById('ciudad-tr').value = s.ciudad || '';
  mostrarCiudad();
}

/* ---------- Publicar ---------- */
formulario.addEventListener('submit', (ev) => {
  ev.preventDefault();
  if (!formulario.reportValidity()) return;
  mostrarError(formulario, '');
  conBoton(ev.submitter, async () => {
    try {
      const s = await api('/solicitudes', {
        metodo: 'POST',
        cuerpo: {
          tema: document.getElementById('tema').value,
          materia_id: Number(document.getElementById('materia-tr').value),
          tarifa_sugerida: document.getElementById('tarifa').value,
          duracion_min: Number(document.getElementById('duracion').value),
          modalidad: formulario.querySelector('input[name=mod-tr]:checked').value,
          ciudad: document.getElementById('ciudad-tr').value,
        },
      });
      abrirEspera(s);
    } catch (error) {
      mostrarError(formulario, error.message);
      // Si ya tenía una abierta (por ejemplo en otra pestaña), se le muestra esa
      const abierta = (await api('/solicitudes').catch(() => [])).find((x) => x.estado === 'abierta');
      if (abierta) abrirEspera(abierta);
    }
  });
});

// Si el estudiante ya tenía una solicitud abierta, se abre directo la ventana de espera
const abierta = (await api('/solicitudes')).find((s) => s.estado === 'abierta');
if (abierta) abrirEspera(abierta);
