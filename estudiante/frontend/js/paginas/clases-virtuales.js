import { iniciarPagina, api, avatar, escapar, fechaHora, hora, vacio, ICONOS } from '../app.js';

const yo = await iniciarPagina();
const proxima = document.getElementById('proxima');
const otras = document.getElementById('lista-virtuales');

function cuentaRegresiva(inicio, fin) {
  const ahora = Date.now();
  const falta = new Date(inicio).getTime() - ahora;
  if (ahora > new Date(fin).getTime()) return 'Terminó';
  if (falta <= 0) return 'En curso';
  const min = Math.floor(falta / 60000);
  if (min >= 24 * 60) return `Comienza ${fechaHora(inicio).toLowerCase()}`;
  const h = Math.floor(min / 60);
  const s = Math.floor((falta % 60000) / 1000);
  return h ? `Comienza en ${h} h ${min % 60} min` : `Comienza en ${String(min).padStart(2, '0')}:${String(s).padStart(2, '0')} min`;
}

function botonMeet(t, grande = true) {
  if (t.meet_url) {
    return `<a class="btn turquesa${grande ? ' grande' : ''}" href="${escapar(t.meet_url)}" target="_blank" rel="noopener">${ICONOS.video} Unirse por Google Meet</a>`;
  }
  const otro = yo.rol === 'docente' ? t.estudiante_id : t.docente_id;
  return `<a class="btn claro${grande ? ' grande' : ''}" href="/compartidas/chat.html?rol=${yo.rol}&con=${otro}">${ICONOS.chat} Coordinar enlace por chat</a>`;
}

const clases = await api('/tutorias?vista=virtuales');

if (!clases.length) {
  proxima.innerHTML = vacio(
    'No tienes clases virtuales confirmadas.',
    yo.rol === 'estudiante' ? '<a class="btn" href="/estudiante/agendar.html">Agendar una clase</a>' : '<a class="btn" href="/docente/inicio.html">Ver mi agenda</a>',
  );
} else {
  const [t, ...resto] = clases;
  proxima.innerHTML = `
    <article class="tarjeta proxima" aria-labelledby="t-proxima">
      <div class="arriba"><span class="sello">SIGUIENTE CLASE</span><span class="cuenta" id="cuenta">${cuentaRegresiva(t.inicio, t.fin)}</span></div>
      <h2 id="t-proxima">${escapar(t.materia)}</h2>
      <div class="personas">
        <div class="persona">${avatar(t.docente, t.docente_id)}<div><div class="titulo-persona">${escapar(t.docente)}</div><div class="subtexto">Docente</div></div></div>
        <div class="persona">${avatar(t.estudiante, t.estudiante_id)}<div><div class="titulo-persona">${escapar(t.estudiante)}</div><div class="subtexto">Estudiante</div></div></div>
      </div>
      <div class="abajo">
        <div><div class="dato">${ICONOS.reloj}${fechaHora(t.inicio)} a ${hora(t.fin)}</div>
          <div class="ayuda">${t.meet_url ? `${escapar(t.meet_url.replace('https://', ''))} · enlace creado con Google Calendar` : '<span class="sin-enlace">El enlace de Meet se crea cuando el docente tiene Google Calendar conectado</span>'}</div></div>
        ${botonMeet(t)}
      </div>
    </article>`;
  setInterval(() => { document.getElementById('cuenta').textContent = cuentaRegresiva(t.inicio, t.fin); }, 1000);

  document.getElementById('sec-otras').hidden = !resto.length;
  otras.innerHTML = resto.map((c) => {
    const otro = yo.rol === 'docente' ? [c.estudiante, c.estudiante_id] : [c.docente, c.docente_id];
    return `<article class="tarjeta clase-mini">${avatar(otro[0], otro[1], true)}
      <div class="info"><div class="titulo-persona" style="font-size:14.5px">${escapar(c.materia)}</div><div class="subtexto">${escapar(otro[0])} · ${fechaHora(c.inicio)}</div></div>
      ${c.meet_url ? `<a class="btn-icono" href="${escapar(c.meet_url)}" target="_blank" rel="noopener" aria-label="Abrir en Google Meet">${ICONOS.video}</a>` : ''}
    </article>`;
  }).join('');
}
