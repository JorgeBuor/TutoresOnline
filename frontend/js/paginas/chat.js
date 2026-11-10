import { iniciarPagina, api, avatar, escapar, hora, fechaHora, vacio, aviso, ICONOS, pintarSinLeer } from '../app.js';

const yo = await iniciarPagina();
const listaConv = document.getElementById('lista-conv');
const contactos = document.getElementById('contactos-movil');
const cabeza = document.getElementById('hilo-cabeza');
const caja = document.getElementById('mensajes');
const formulario = document.getElementById('form-mensaje');
const entrada = document.getElementById('texto-mensaje');

let conversaciones = [];
let activa = null;
let ultimoId = null;

function corto(nombre) {
  return nombre.split(' ').slice(0, 2).join(' ');
}

function pintarLista() {
  listaConv.innerHTML = conversaciones.length
    ? conversaciones.map((c) => `
      <a class="conversacion${c.id === activa?.id ? ' activa' : ''}" href="#" data-conv="${c.id}">${avatar(c.contraparte, c.contraparte_id, true)}
        <div class="info"><div class="titulo-persona" style="font-size:14.5px">${escapar(c.contraparte)}</div>
          <div class="vista">${escapar(c.ultimo_mensaje || 'Sin mensajes todavía')}</div></div>
        <div class="cuando">${c.ultimo_envio ? escapar(fechaHora(c.ultimo_envio).replace(/^Hoy, /, '')) : ''}<br>${c.no_leidos ? `<span class="no-leidos">${c.no_leidos}</span>` : ''}</div>
      </a>`).join('')
    : `<div style="padding:18px">${vacio('Aún no tienes conversaciones. Se crean desde tus clases con el botón de chat.')}</div>`;
  contactos.innerHTML = conversaciones.map((c) => `
    <a class="${c.id === activa?.id ? 'activa' : ''}" href="#" data-conv="${c.id}">${avatar(c.contraparte, c.contraparte_id)}${escapar(corto(c.contraparte))}</a>`).join('');
}

function burbuja(m) {
  return `<div class="burbuja ${m.remitente_id === yo.id ? 'enviado' : 'recibido'}">${escapar(m.contenido)}<time>${hora(m.enviado_en)}</time></div>`;
}

async function abrir(id) {
  activa = conversaciones.find((c) => c.id === id);
  if (!activa) return;
  ultimoId = null;
  cabeza.innerHTML = `${avatar(activa.contraparte, activa.contraparte_id, true)}
    <div style="flex:1"><div class="titulo-persona">${escapar(activa.contraparte)}</div><div class="estado-linea">${yo.rol === 'docente' ? 'Estudiante' : 'Docente'}</div></div>
    <a class="btn-icono" href="/compartidas/clases-virtuales.html?rol=${yo.rol}" title="Ir a clases virtuales" aria-label="Ir a clases virtuales">${ICONOS.video}</a>`;
  entrada.disabled = false;
  formulario.querySelector('button').disabled = false;
  caja.innerHTML = '';
  await traerMensajes();
  activa.no_leidos = 0;
  pintarLista();
  pintarSinLeer(conversaciones.reduce((suma, c) => suma + (c.id === activa.id ? 0 : c.no_leidos || 0), 0));
  history.replaceState(null, '', `?rol=${yo.rol}&c=${id}`);
}

async function traerMensajes() {
  if (!activa) return;
  const nuevos = await api(`/conversaciones/${activa.id}/mensajes${ultimoId ? `?despues_de=${ultimoId}` : ''}`);
  if (!nuevos.length) {
    if (!ultimoId) caja.innerHTML = vacio('Escribe el primer mensaje para coordinar la tutoría.');
    return;
  }
  if (!ultimoId) caja.innerHTML = '';
  caja.insertAdjacentHTML('beforeend', nuevos.map(burbuja).join(''));
  ultimoId = nuevos.at(-1).id;
  caja.scrollTop = caja.scrollHeight;
}

async function cargarConversaciones() {
  conversaciones = await api('/conversaciones');
  pintarLista();
  pintarSinLeer(conversaciones.reduce((suma, c) => suma + (c.id === activa?.id ? 0 : c.no_leidos || 0), 0));
}

document.addEventListener('click', (ev) => {
  const enlace = ev.target.closest('[data-conv]');
  if (!enlace) return;
  ev.preventDefault();
  abrir(Number(enlace.dataset.conv)).catch((e) => aviso(e.message, 'error'));
});

formulario.addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const texto = entrada.value.trim();
  if (!texto || !activa) return;
  entrada.value = '';
  try {
    await api(`/conversaciones/${activa.id}/mensajes`, { metodo: 'POST', cuerpo: { contenido: texto } });
    await traerMensajes();
    activa.ultimo_mensaje = texto;
    activa.ultimo_envio = new Date().toISOString();
    pintarLista();
  } catch (error) {
    entrada.value = texto;
    aviso(error.message, 'error');
  }
});

// Abrir una conversación: ?con=<id de la otra persona> (desde una clase) o ?c=<id de conversación>
const parametros = new URLSearchParams(location.search);
try {
  await cargarConversaciones();
  let id = Number(parametros.get('c')) || null;
  if (parametros.get('con')) {
    const conv = await api('/conversaciones', { metodo: 'POST', cuerpo: { con_usuario_id: parametros.get('con') } });
    await cargarConversaciones();
    id = conv.id;
  }
  if (!id && conversaciones.length && (window.innerWidth > 860 || conversaciones.length === 1)) id = conversaciones[0].id;
  if (id) await abrir(id);
} catch (error) {
  aviso(error.message, 'error');
}

// Revisar mensajes nuevos cada pocos segundos
setInterval(() => {
  traerMensajes().catch(() => {});
  cargarConversaciones().catch(() => {});
}, 4000);
