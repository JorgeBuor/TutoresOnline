import { api, avatar, escapar, dinero, etiquetaEstado, ICONOS, conBoton, aviso, crearVentana } from './app.js';

/*
 * Detalle de una clase, igual para estudiante y docente: datos completos y las acciones
 * que cada uno puede hacer según el estado (unirse, chat, cancelar, aceptar, marcar dictada).
 */
const ZONA = 'America/Bogota';
const fechaLarga = (d) => {
  const t = new Intl.DateTimeFormat('es-CO', { timeZone: ZONA, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(d));
  return t.charAt(0).toUpperCase() + t.slice(1);
};
const hora = (d) => new Intl.DateTimeFormat('es-CO', { timeZone: ZONA, hour: 'numeric', minute: '2-digit' }).format(new Date(d));
const duracionMin = (t) => Math.round((new Date(t.fin) - new Date(t.inicio)) / 60000);
const textoDuracion = (min) => (min < 60 ? `${min} minutos` : min === 60 ? '1 hora' : min % 60 ? `${Math.floor(min / 60)} h ${min % 60} min` : `${min / 60} horas`);

/** Acciones posibles para quien mira la clase (mismas reglas que valida la API). */
export function accionesClase(t, rol) {
  const ahora = Date.now();
  const empezo = new Date(t.inicio).getTime() <= ahora;
  const terminada = new Date(t.fin).getTime() < ahora;
  return {
    unirse: t.estado === 'confirmada' && t.modalidad === 'virtual' && !terminada,
    cancelar: ['pendiente', 'confirmada'].includes(t.estado) && !empezo,
    aceptar: rol === 'docente' && t.estado === 'pendiente' && !empezo,
    rechazar: rol === 'docente' && t.estado === 'pendiente' && !empezo,
    dictada: rol === 'docente' && t.estado === 'confirmada' && empezo,
  };
}

const enlaceChat = (t, rol) => `/compartidas/chat.html?rol=${rol}&con=${rol === 'estudiante' ? t.docente_id : t.estudiante_id}`;

/** Botón redondo de chat para las tarjetas de clase. */
export const botonChat = (t, rol) => `<a class="btn-icono" href="${enlaceChat(t, rol)}" title="Escribir por chat" aria-label="Escribir por chat">${ICONOS.chat}</a>`;

/** Abre la ventana de detalle. "alCambiar" se llama después de cancelar, aceptar, etc. */
export function ventanaDetalle(t, rol, alCambiar = () => {}) {
  const otro = rol === 'estudiante' ? { nombre: t.docente, id: t.docente_id, rol: 'Docente' } : { nombre: t.estudiante, id: t.estudiante_id, rol: 'Estudiante' };
  const min = duracionMin(t);
  const total = Number(t.tarifa_hora) * min / 60;
  const puede = accionesClase(t, rol);
  const enlaceClase = rol === 'estudiante' ? 'Unirse por Google Meet' : 'Iniciar clase en Meet';

  const filas = [
    ['Fecha', fechaLarga(t.inicio)],
    ['Hora', `${hora(t.inicio)} a ${hora(t.fin)} · ${textoDuracion(min)}`],
    ['Modalidad', t.modalidad === 'virtual' ? 'Virtual por Google Meet' : `Presencial · ${escapar(t.lugar || 'Lugar por acordar en el chat')}`],
    t.modalidad === 'virtual' && ['Enlace', t.meet_url
      ? `<a href="${escapar(t.meet_url)}" target="_blank" rel="noopener">${escapar(t.meet_url.replace('https://', ''))}</a>`
      : 'Se crea al confirmar la clase (o se acuerda por chat)'],
    ['Valor', `${dinero(total)} <small>(${dinero(t.tarifa_hora)} por hora)</small>`],
    ['Cómo se reservó', t.origen === 'tiempo_real' ? 'En tiempo real' : 'Desde Agendar'],
    t.calificacion && ['Calificación', `${'★'.repeat(t.calificacion)}${'☆'.repeat(5 - t.calificacion)}`],
  ].filter(Boolean);

  const botones = [
    puede.unirse && t.meet_url && `<a class="btn" href="${escapar(t.meet_url)}" target="_blank" rel="noopener">${ICONOS.video} ${enlaceClase}</a>`,
    puede.aceptar && '<button class="btn" type="button" data-accion="confirmada">Aceptar</button>',
    puede.dictada && '<button class="btn" type="button" data-accion="completada">Marcar como dictada</button>',
    `<a class="btn claro" href="${enlaceChat(t, rol)}">${ICONOS.chat} Chat</a>`,
    puede.rechazar && '<button class="btn claro peligro" type="button" data-accion="rechazada">Rechazar</button>',
    puede.cancelar && !puede.rechazar && '<button class="btn claro peligro" type="button" data-accion="cancelada">Cancelar clase</button>',
  ].filter(Boolean).join('');

  const ventana = crearVentana(`
    <div class="tarjeta detalle-clase">
      <a class="cerrar-detalle" href="#" data-cerrar aria-label="Cerrar">${ICONOS.x}</a>
      <div class="cabeza">${avatar(otro.nombre, otro.id)}
        <div class="info"><div class="titulo-persona">${escapar(otro.nombre)}</div><div class="subtexto">${otro.rol} · ${escapar(t.materia)}</div></div>
        ${etiquetaEstado(t.estado)}
      </div>
      <dl class="datos-clase">${filas.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('')}</dl>
      <div class="confirmar-accion" hidden></div>
      <div class="acciones">${botones}</div>
    </div>`);

  // Cancelar y rechazar piden una confirmación dentro de la misma ventana
  const textos = {
    cancelada: ['¿Cancelar esta clase?', `Le avisaremos por correo a ${otro.nombre}.`, 'Sí, cancelar', 'Clase cancelada'],
    rechazada: ['¿Rechazar esta reserva?', 'El estudiante recibirá un correo para buscar otro horario.', 'Sí, rechazar', 'Reserva rechazada'],
    confirmada: [null, null, null, 'Clase aceptada. Avisamos al estudiante'],
    completada: [null, null, null, 'Clase marcada como dictada'],
  };
  const ejecutar = (estado, boton) => conBoton(boton, async () => {
    await api(`/tutorias/${t.id}`, { metodo: 'PATCH', cuerpo: { estado } });
    ventana.remove();
    aviso(textos[estado][3], 'exito');
    await alCambiar();
  });
  ventana.addEventListener('click', (ev) => {
    const boton = ev.target.closest('[data-accion]');
    if (!boton) return;
    const estado = boton.dataset.accion;
    const [pregunta, detalle, si] = textos[estado];
    if (!pregunta) return ejecutar(estado, boton);
    const caja = ventana.querySelector('.confirmar-accion');
    caja.hidden = false;
    caja.innerHTML = `<b>${pregunta}</b><span>${escapar(detalle)}</span>
      <div class="acciones"><button class="btn peligro-lleno" type="button" data-si="${estado}">${si}</button><button class="btn claro" type="button" data-no>No</button></div>`;
    ventana.querySelector('.detalle-clase > .acciones').hidden = true;
  });
  ventana.addEventListener('click', (ev) => {
    if (ev.target.closest('[data-no]')) {
      ventana.querySelector('.confirmar-accion').hidden = true;
      ventana.querySelector('.detalle-clase > .acciones').hidden = false;
    }
    const si = ev.target.closest('[data-si]');
    if (si) ejecutar(si.dataset.si, si);
  });
  return ventana;
}
