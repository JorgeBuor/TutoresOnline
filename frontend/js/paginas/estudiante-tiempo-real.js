import { iniciarPagina, api, avatar, escapar, dinero, estrellas, vacio, conBoton, aviso, crearVentana, mostrarError, ICONOS } from '../app.js';

await iniciarPagina();
const formulario = document.getElementById('form-solicitud');
const lista = document.getElementById('lista-ofertas');
const numero = document.getElementById('num-ofertas');
const indicador = document.getElementById('indicador-vivo');
const botonCancelar = document.getElementById('cancelar-solicitud');

const { materias } = await api('/catalogos');
document.getElementById('materia-tr').insertAdjacentHTML('beforeend',
  materias.map((m) => `<option value="${m.id}">${escapar(m.nombre)}</option>`).join(''));

formulario.querySelectorAll('input[name=mod-tr]').forEach((r) => r.addEventListener('change', () => {
  document.getElementById('campo-ciudad').hidden = r.value !== 'presencial' || !r.checked;
}));

let solicitudActiva = null;
let temporizador = null;

function pintarOfertas(ofertas) {
  numero.textContent = ofertas.length ? `(${ofertas.length})` : '';
  lista.innerHTML = ofertas.length
    ? ofertas.map((o) => `
      <article class="tarjeta oferta">${avatar(o.docente, o.docente_id)}
        <div class="info"><div class="titulo-persona">${escapar(o.docente)}</div>
          <div class="meta">${estrellas(o.calificacion_promedio, o.total_resenas)}<span>Empieza en: ${o.minutos_llegada} min</span></div></div>
        <div class="monto">${dinero(o.tarifa_ofertada)}</div>
        <button class="btn chico turquesa" data-aceptar="${o.id}" data-docente="${escapar(o.docente)}">Aceptar</button>
      </article>`).join('')
    : vacio('Esperando ofertas de los tutores conectados…');
}

async function revisar() {
  if (!solicitudActiva) return;
  try {
    const s = await api(`/solicitudes/${solicitudActiva}`);
    if (s.estado !== 'abierta') return detener(s.estado === 'expirada' ? 'Tu solicitud expiró sin ofertas aceptadas. Puedes publicar otra.' : null);
    pintarOfertas(s.ofertas);
  } catch (error) {
    console.error(error);
  }
}

function seguir(id) {
  solicitudActiva = id;
  indicador.hidden = false;
  botonCancelar.hidden = false;
  formulario.querySelector('[type=submit]').disabled = true;
  revisar();
  clearInterval(temporizador);
  temporizador = setInterval(revisar, 4000);
}

function detener(mensaje) {
  clearInterval(temporizador);
  solicitudActiva = null;
  indicador.hidden = true;
  botonCancelar.hidden = true;
  formulario.querySelector('[type=submit]').disabled = false;
  numero.textContent = '';
  if (mensaje) lista.innerHTML = vacio(mensaje);
}

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
      aviso('Solicitud publicada: los tutores ya la están viendo', 'exito');
      seguir(s.id);
    } catch (error) {
      mostrarError(formulario, error.message);
    }
  });
});

botonCancelar.addEventListener('click', () => conBoton(botonCancelar, async () => {
  await api(`/solicitudes/${solicitudActiva}`, { metodo: 'PATCH', cuerpo: { estado: 'cancelada' } });
  detener('Cancelaste la solicitud. Puedes publicar una nueva cuando quieras.');
}));

lista.addEventListener('click', (ev) => {
  const boton = ev.target.closest('[data-aceptar]');
  if (!boton) return;
  conBoton(boton, async () => {
    const { tutoria } = await api(`/ofertas/${boton.dataset.aceptar}`, { metodo: 'PATCH', cuerpo: { estado: 'aceptada' } });
    detener('¡Listo! Tu clase quedó confirmada.');
    const enlace = tutoria.modalidad === 'virtual'
      ? '<a class="btn" href="/compartidas/clases-virtuales.html?rol=estudiante">Ir a la clase</a>'
      : '<a class="btn" href="/estudiante/inicio.html">Ver mis clases</a>';
    crearVentana(`
      <div class="tarjeta">
        <div class="exito">${ICONOS.check}</div>
        <h2>¡Tutor confirmado!</h2>
        <p>${escapar(boton.dataset.docente)} dará tu clase de ${escapar(tutoria.materia)} por ${dinero(tutoria.tarifa_hora)}/hora.</p>
        <div class="acciones">${enlace}<a class="btn claro" href="/compartidas/chat.html?rol=estudiante&con=${tutoria.docente_id}">Escribirle</a></div>
      </div>`);
  });
});

// Si el estudiante ya tenía una solicitud abierta, retomarla
const mias = await api('/solicitudes');
const abierta = mias.find((s) => s.estado === 'abierta');
if (abierta) seguir(abierta.id);
