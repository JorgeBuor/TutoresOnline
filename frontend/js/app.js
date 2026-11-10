/**
 * TutoresOn-Line · módulo común de las pantallas
 *
 * Responsabilidades:
 *  1. Conectar con Supabase Auth (inicio de sesión con correo o con Google).
 *  2. Llamar a la API propia (/api/...) enviando el token de la sesión.
 *  3. Proteger las pantallas: si no hay sesión, al login; si el rol no coincide, a su inicio.
 *  4. Utilidades de interfaz compartidas: formato de fechas y dinero, avisos y ventanas.
 */
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm';

const ZONA = 'America/Bogota';
export const INICIO = { estudiante: '/estudiante/inicio.html', docente: '/docente/inicio.html' };
// Permisos de Google Calendar: crear las clases con Meet y ver cuándo el docente está ocupado (sin ver sus eventos)
export const ALCANCE_CALENDARIO = 'https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/calendar.freebusy';

let supabase = null;
let usuarioActual = null;

/* ------------------------------------------------------------------ */
/* Conexión                                                            */
/* ------------------------------------------------------------------ */

async function cliente() {
  if (supabase) return supabase;
  const respuesta = await fetch('/api/configuracion');
  if (!respuesta.ok) throw new Error('No se pudo conectar con el servidor');
  const config = await respuesta.json();
  if (!config.supabaseUrl || !config.supabaseAnonKey) {
    throw new Error('Falta configurar Supabase en las variables de entorno del servidor');
  }
  supabase = createClient(config.supabaseUrl, config.supabaseAnonKey);

  // Al entrar con Google, Supabase entrega una sola vez el permiso de Google Calendar.
  // Se guarda para enviarlo a la API apenas se sepa que la persona es docente.
  supabase.auth.onAuthStateChange((_evento, sesion) => {
    if (sesion?.provider_refresh_token) {
      try { sessionStorage.setItem('tutores-google-rt', sesion.provider_refresh_token); } catch { /* sin almacenamiento */ }
    }
  });
  return supabase;
}

export async function auth() {
  return (await cliente()).auth;
}

/** Llama a la API propia. Lanza un Error con el mensaje legible si la respuesta no es exitosa. */
export async function api(ruta, { metodo = 'GET', cuerpo } = {}) {
  const sb = await cliente();
  const { data } = await sb.auth.getSession();
  const token = data.session?.access_token;
  const respuesta = await fetch(`/api${ruta}`, {
    method: metodo,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
  });
  let datos = null;
  try { datos = await respuesta.json(); } catch { /* respuesta sin cuerpo */ }
  if (respuesta.status === 401 && !document.querySelector('main.auth')) {
    location.href = '/index.html';
  }
  if (!respuesta.ok) throw new Error(datos?.error?.mensaje || 'No se pudo completar la acción');
  return datos;
}

/* ------------------------------------------------------------------ */
/* Sesión y protección de pantallas                                    */
/* ------------------------------------------------------------------ */

/**
 * Debe llamarse al cargar cada pantalla privada. Devuelve el perfil del usuario.
 * Si la pantalla es de un rol (data-pagina-rol) y el usuario tiene otro, lo lleva a su inicio.
 */
export async function iniciarPagina() {
  try {
    const sb = await cliente();
    const { data } = await sb.auth.getSession();
    if (!data.session) {
      location.replace('/index.html');
      return new Promise(() => {});
    }
    let usuario = await api('/yo');
    pintarUsuario(usuario, false);
    usuario = await asegurarRol(usuario);
    await guardarPermisoGoogle(usuario, data.session);

    const rolPagina = document.body.dataset.paginaRol;
    if (rolPagina && rolPagina !== usuario.rol) {
      location.replace(INICIO[usuario.rol]);
      return new Promise(() => {});
    }
    document.body.dataset.rol = usuario.rol;
    try { localStorage.setItem('tutores-rol', usuario.rol); } catch { /* sin almacenamiento */ }
    pintarUsuario(usuario);
    activarVentanas();
    usuarioActual = usuario;
    vigilarMensajes();
    return usuario;
  } catch (error) {
    aviso(error.message, 'error');
    throw error;
  }
}

export function usuario() {
  return usuarioActual;
}

/** Quien entró con Google por primera vez todavía no ha elegido si es estudiante o docente. */
async function asegurarRol(usuario) {
  if (usuario.rol_confirmado) return usuario;
  let pendiente = null;
  try { pendiente = localStorage.getItem('tutores-rol-pendiente'); } catch { /* sin almacenamiento */ }
  const rol = ['estudiante', 'docente'].includes(pendiente) ? pendiente : await preguntarRol();
  try { localStorage.removeItem('tutores-rol-pendiente'); } catch { /* sin almacenamiento */ }
  return api('/yo/rol', { metodo: 'POST', cuerpo: { rol } });
}

function preguntarRol() {
  return new Promise((resolver) => {
    const ventana = crearVentana(`
      <div class="tarjeta">
        <h2>¡Bienvenido a TutoresOn-Line!</h2>
        <p>Para terminar de crear tu cuenta, cuéntanos cómo vas a usar la plataforma.</p>
        <div class="acciones">
          <button class="btn turquesa" data-rol="estudiante">Soy estudiante</button>
          <button class="btn ambar" data-rol="docente">Soy docente</button>
        </div>
      </div>`, { cerrable: false });
    ventana.querySelectorAll('[data-rol]').forEach((b) => b.addEventListener('click', () => {
      ventana.remove();
      resolver(b.dataset.rol);
    }));
  });
}

async function guardarPermisoGoogle(usuario, sesion) {
  let token = sesion.provider_refresh_token || null;
  try { token = token || sessionStorage.getItem('tutores-google-rt'); } catch { /* sin almacenamiento */ }
  if (!token || usuario.rol !== 'docente') return;
  try {
    await api('/yo/google', { metodo: 'PUT', cuerpo: { refresh_token: token } });
    usuario.google_conectado = true;
    sessionStorage.removeItem('tutores-google-rt');
  } catch (error) {
    console.error(error);
  }
}

export async function cerrarSesion() {
  try { await (await auth()).signOut(); } finally {
    try { localStorage.removeItem('tutores-rol'); } catch { /* sin almacenamiento */ }
    location.href = '/index.html';
  }
}

function pintarUsuario(u, conEventos = true) {
  const nombre = u.nombre_completo || u.email;
  const corto = nombre.split(' ').slice(0, 2).join(' ');
  document.querySelectorAll('[data-usuario="nombre"]').forEach((e) => { e.textContent = corto; });
  document.querySelectorAll('[data-usuario="primer-nombre"]').forEach((e) => { e.textContent = sinTitulo(nombre).split(' ')[0]; });
  document.querySelectorAll('[data-usuario="rol"]').forEach((e) => { e.textContent = u.rol === 'docente' ? 'Docente' : 'Estudiante'; });
  document.querySelectorAll('[data-usuario="avatar"]').forEach((e) => {
    e.textContent = iniciales(nombre);
    e.className = `avatar chico ${claseAvatar(u.id)}`;
  });
  if (!conEventos) return;
  document.querySelectorAll('[data-accion="salir"]').forEach((e) => e.addEventListener('click', (ev) => {
    ev.preventDefault();
    cerrarSesion();
  }));
}

/* ------------------------------------------------------------------ */
/* Ventanas y avisos                                                   */
/* ------------------------------------------------------------------ */

export function abrirVentana(id) {
  document.getElementById(id)?.classList.add('abierto');
}

export function cerrarVentana(id) {
  document.getElementById(id)?.classList.remove('abierto');
  if (location.hash === `#${id}`) history.replaceState(null, '', location.pathname + location.search);
}

/** Conecta los botones data-abrir / data-cerrar y el clic fuera de la ventana. */
export function activarVentanas() {
  if (document.body.dataset.ventanasActivas) return;
  document.body.dataset.ventanasActivas = '1';
  document.addEventListener('click', (ev) => {
    const abrir = ev.target.closest('[data-abrir]');
    if (abrir) { ev.preventDefault(); abrirVentana(abrir.dataset.abrir); return; }
    const cerrar = ev.target.closest('[data-cerrar]');
    if (cerrar) { ev.preventDefault(); cerrar.closest('.modal')?.classList.remove('abierto'); return; }
    if (ev.target.classList?.contains('modal') && !ev.target.dataset.fija) ev.target.classList.remove('abierto');
  });
}

/** Crea una ventana temporal con el HTML dado. Devuelve el elemento .modal. */
export function crearVentana(contenido, { cerrable = true } = {}) {
  const ventana = document.createElement('div');
  ventana.className = 'modal abierto';
  ventana.setAttribute('role', 'dialog');
  ventana.setAttribute('aria-modal', 'true');
  if (!cerrable) ventana.dataset.fija = '1';
  ventana.innerHTML = contenido;
  ventana.addEventListener('click', (ev) => {
    if (cerrable && (ev.target === ventana || ev.target.closest('[data-cerrar]'))) {
      ev.preventDefault();
      ventana.remove();
    }
  });
  document.body.appendChild(ventana);
  return ventana;
}

export function aviso(mensaje, tipo = '') {
  let zona = document.getElementById('avisos');
  if (!zona) {
    zona = document.createElement('div');
    zona.id = 'avisos';
    zona.className = 'avisos';
    document.body.appendChild(zona);
  }
  const elemento = document.createElement('div');
  elemento.className = `aviso ${tipo}`;
  elemento.textContent = mensaje;
  zona.appendChild(elemento);
  setTimeout(() => elemento.remove(), tipo === 'error' ? 6000 : 3500);
}

/** Ejecuta una acción mostrando el botón ocupado y avisando si falla. */
export async function conBoton(boton, accion) {
  if (boton) { boton.classList.add('ocupado'); boton.disabled = true; }
  try {
    return await accion();
  } catch (error) {
    aviso(error.message, 'error');
    return undefined;
  } finally {
    if (boton) { boton.classList.remove('ocupado'); boton.disabled = false; }
  }
}

export function mostrarError(formulario, mensaje) {
  const caja = formulario.querySelector('[data-error]');
  if (!caja) return aviso(mensaje, 'error');
  caja.textContent = mensaje;
  caja.hidden = !mensaje;
}

/* ------------------------------------------------------------------ */
/* Formato                                                             */
/* ------------------------------------------------------------------ */

export function escapar(texto) {
  return String(texto ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/** Quita títulos como Dr., Ing. o Prof. del inicio de un nombre. */
export function sinTitulo(nombre = '') {
  return nombre.replace(/^(Dr|Dra|Ing|Mtra|Mtro|Prof|Lic)\.?\s+/i, '');
}

export function iniciales(nombre = '') {
  const partes = sinTitulo(nombre).split(/\s+/).filter(Boolean);
  return ((partes[0]?.[0] || '') + (partes[1]?.[0] || '')).toUpperCase() || '?';
}

export function claseAvatar(id = '') {
  let suma = 0;
  for (const c of String(id)) suma += c.charCodeAt(0);
  return `c${(suma % 6) + 1}`;
}

export function avatar(nombre, id, chico = false) {
  return `<span class="avatar ${claseAvatar(id)}${chico ? ' chico' : ''}" aria-hidden="true">${escapar(iniciales(nombre))}</span>`;
}

export function dinero(valor) {
  return `$${Math.round(Number(valor) || 0).toLocaleString('es-CO')}`;
}

export function fechaClave(fecha = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: ZONA, year: 'numeric', month: '2-digit', day: '2-digit' }).format(fecha);
}

export function hora(fecha) {
  return new Intl.DateTimeFormat('es-CO', { timeZone: ZONA, hour: 'numeric', minute: '2-digit' }).format(new Date(fecha));
}

export function fechaHora(fecha) {
  const d = new Date(fecha);
  const clave = fechaClave(d);
  if (clave === fechaClave()) return `Hoy, ${hora(d)}`;
  if (clave === fechaClave(new Date(Date.now() + 864e5))) return `Mañana, ${hora(d)}`;
  const dia = new Intl.DateTimeFormat('es-CO', { timeZone: ZONA, weekday: 'short', day: 'numeric', month: 'short' }).format(d);
  return `${dia.charAt(0).toUpperCase()}${dia.slice(1)}, ${hora(d)}`;
}

export function haceCuanto(fecha) {
  const minutos = Math.max(0, Math.round((Date.now() - new Date(fecha).getTime()) / 60000));
  if (minutos < 1) return 'hace un momento';
  if (minutos < 60) return `hace ${minutos} min`;
  const horas = Math.round(minutos / 60);
  return horas < 24 ? `hace ${horas} h` : fechaHora(fecha);
}

export const ESTADOS = {
  pendiente: 'Por aceptar', confirmada: 'Confirmada', rechazada: 'Rechazada', cancelada: 'Cancelada', completada: 'Completada',
};

export function etiquetaEstado(estado) {
  return `<span class="estado ${estado}">${ESTADOS[estado] || estado}</span>`;
}

/* Íconos compartidos (mismo trazo que el diseño) */
const trazo = (d) => `<svg class="icono" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
export const ICONOS = {
  reloj: trazo('<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>'),
  video: trazo('<rect x="2" y="6" width="14" height="12" rx="2"/><path d="m22 8-6 4 6 4V8Z"/>'),
  chat: trazo('<path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 8.6 8.6 0 0 1-3.8-.9L3 21l1.9-5.1A8.4 8.4 0 0 1 12 3a8.4 8.4 0 0 1 9 8.5Z"/>'),
  ubicacion: trazo('<path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>'),
  check: trazo('<path d="M20 6 9 17l-5-5"/>'),
  x: trazo('<path d="M18 6 6 18M6 6l12 12"/>'),
  estrella: '<svg class="icono" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="m12 2 3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1L12 2z"/></svg>',
};

export function estrellas(promedio, total) {
  if (!Number(total)) return '<span class="estrellas">Nuevo</span>';
  return `<span class="estrellas">${ICONOS.estrella}${Number(promedio).toFixed(1)}</span>`;
}

export function vacio(texto, boton = '') {
  return `<div class="vacio">${texto}${boton ? `<br>${boton}` : ''}</div>`;
}

/* ---------- Aviso de mensajes nuevos ----------
 * Cada pocos segundos se cuentan los mensajes sin leer y se muestra el número en rojo
 * sobre "Chat" (menú, barra del celular y tarjeta de acceso) y en el título de la pestaña.
 * Si llega uno nuevo, suena un tono corto.
 */
let ultimoSinLeer = null;
let audio = null;
const tituloBase = document.title;

function sonarMensaje() {
  try {
    audio = audio || new (window.AudioContext || window.webkitAudioContext)();
    if (audio.state === 'suspended') audio.resume();
    const ahora = audio.currentTime;
    [[880, 0], [1320, 0.12]].forEach(([frecuencia, inicio]) => {
      const tono = audio.createOscillator();
      const volumen = audio.createGain();
      tono.type = 'sine';
      tono.frequency.value = frecuencia;
      volumen.gain.setValueAtTime(0.0001, ahora + inicio);
      volumen.gain.exponentialRampToValueAtTime(0.12, ahora + inicio + 0.02);
      volumen.gain.exponentialRampToValueAtTime(0.0001, ahora + inicio + 0.25);
      tono.connect(volumen).connect(audio.destination);
      tono.start(ahora + inicio);
      tono.stop(ahora + inicio + 0.3);
    });
  } catch { /* el navegador no permite sonido todavía */ }
}

export function pintarSinLeer(total) {
  document.querySelectorAll('.menu a[href*="compartidas/chat"], .barra-inferior a[href*="compartidas/chat"], .acceso[href*="compartidas/chat"]').forEach((enlace) => {
    let globo = enlace.querySelector('.contador-chat');
    if (!total) { globo?.remove(); return; }
    if (!globo) {
      globo = document.createElement('span');
      globo.className = 'contador-chat';
      enlace.appendChild(globo);
    }
    globo.textContent = total > 9 ? '9+' : String(total);
    globo.setAttribute('aria-label', `${total} ${total === 1 ? 'mensaje sin leer' : 'mensajes sin leer'}`);
  });
  document.title = total ? `(${total}) ${tituloBase}` : tituloBase;
}

async function revisarMensajes() {
  if (document.hidden && ultimoSinLeer !== null) return;
  try {
    const conversaciones = await api('/conversaciones');
    // En la pantalla de chat, la conversación abierta ya se está leyendo: no cuenta
    const abierta = Number(new URLSearchParams(location.search).get('c'));
    const total = conversaciones.reduce((suma, c) => suma + (c.id === abierta ? 0 : c.no_leidos || 0), 0);
    if (ultimoSinLeer !== null && total > ultimoSinLeer) sonarMensaje();
    ultimoSinLeer = total;
    pintarSinLeer(total);
  } catch { /* sin conexión: se intenta en la siguiente vuelta */ }
}

function vigilarMensajes() {
  revisarMensajes();
  setInterval(revisarMensajes, 8000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) revisarMensajes(); });
}

/* ---------- Tema claro u oscuro ----------
 * Por defecto sigue el modo del computador o celular. El botón lo fija y se recuerda en este navegador.
 */
const LUNA = '<svg class="icono" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z"/></svg>';
const SOL = '<svg class="icono" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>';
const temaActual = () => document.documentElement.dataset.theme
  || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');

function pintarBotonTema(boton) {
  const oscuro = temaActual() === 'dark';
  boton.innerHTML = oscuro ? SOL : LUNA;
  boton.title = oscuro ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro';
  boton.setAttribute('aria-label', boton.title);
}

function ponerBotonTema() {
  if (document.querySelector('.btn-tema')) return;
  const boton = document.createElement('button');
  boton.type = 'button';
  boton.className = 'btn-tema';
  const usuario = document.querySelector('.barra-superior .usuario');
  if (usuario) usuario.insertBefore(boton, usuario.querySelector('.salir'));
  else { boton.classList.add('flotante'); document.body.appendChild(boton); }
  pintarBotonTema(boton);
  boton.addEventListener('click', () => {
    const nuevo = temaActual() === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = nuevo;
    try { localStorage.setItem('tutores-tema', nuevo); } catch { /* sin almacenamiento */ }
    pintarBotonTema(boton);
  });
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => pintarBotonTema(boton));
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ponerBotonTema);
else ponerBotonTema();
