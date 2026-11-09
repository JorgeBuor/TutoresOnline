import { iniciarPagina, api, avatar, escapar, dinero, haceCuanto, vacio, conBoton, aviso, abrirVentana, cerrarVentana } from '../app.js';

await iniciarPagina();
const lista = document.getElementById('lista-solicitudes');
const formOferta = document.getElementById('form-oferta');
let solicitudes = [];
let elegida = null;
const ignoradas = new Set(JSON.parse(sessionStorage.getItem('tutores-ignoradas') || '[]'));

const filtro = () => document.querySelector('input[name=f-sol]:checked').value;

function tarjeta(s) {
  const yaOferte = s.mi_oferta !== null && s.mi_oferta !== undefined;
  return `
    <article class="tarjeta solicitud">
      <div class="clase"><div class="cabeza">${avatar(s.estudiante, s.id)}
        <div class="info"><div class="titulo-persona">${escapar(s.estudiante)}</div>
          <div class="subtexto">${escapar(s.materia || 'Tema libre')}: ${escapar(s.tema)}</div>
          <div class="hace">Publicado ${haceCuanto(s.creada_en)} · ${s.modalidad === 'virtual' ? 'Virtual' : `Presencial, ${escapar(s.ciudad || '')}`}</div></div></div></div>
      <div class="presupuesto"><span class="etiqueta-seccion">Presupuesto sugerido</span><div class="monto">${dinero(s.tarifa_sugerida)}/hr</div>
        ${yaOferte ? `<span class="ayuda">Tu oferta: ${dinero(s.mi_oferta)}/hr, esperando respuesta</span>` : ''}</div>
      <div class="acciones">
        <button class="btn chico claro" data-ignorar="${s.id}">Ignorar</button>
        <button class="btn chico" data-ofertar="${s.id}">${yaOferte ? 'Cambiar oferta' : 'Ofertar'}</button>
      </div>
    </article>`;
}

async function cargar() {
  try {
    solicitudes = (await api(`/solicitudes?filtro=${filtro()}`)).filter((s) => !ignoradas.has(s.id));
    lista.innerHTML = solicitudes.length
      ? solicitudes.map(tarjeta).join('')
      : vacio('No hay solicitudes abiertas en este momento. Esta pantalla se actualiza sola.');
  } catch (error) {
    lista.innerHTML = vacio(escapar(error.message));
  }
}

lista.addEventListener('click', (ev) => {
  const ignorar = ev.target.closest('[data-ignorar]');
  if (ignorar) {
    ignoradas.add(Number(ignorar.dataset.ignorar));
    sessionStorage.setItem('tutores-ignoradas', JSON.stringify([...ignoradas]));
    cargar();
    return;
  }
  const ofertar = ev.target.closest('[data-ofertar]');
  if (ofertar) {
    elegida = solicitudes.find((s) => s.id === Number(ofertar.dataset.ofertar));
    document.getElementById('of-detalle').textContent = `${elegida.estudiante} sugiere ${dinero(elegida.tarifa_sugerida)} por hora para "${elegida.tema}". Acepta ese valor o propón el tuyo.`;
    document.getElementById('of-v').value = Math.round(elegida.mi_oferta ?? elegida.tarifa_sugerida).toLocaleString('es-CO');
    abrirVentana('ofertar');
  }
});

formOferta.addEventListener('submit', (ev) => {
  ev.preventDefault();
  conBoton(ev.submitter, async () => {
    await api(`/solicitudes/${elegida.id}/ofertas`, {
      metodo: 'POST',
      cuerpo: { tarifa_ofertada: document.getElementById('of-v').value, minutos_llegada: Number(document.getElementById('of-m').value) },
    });
    cerrarVentana('ofertar');
    aviso('Oferta enviada. Si el estudiante la acepta, la clase aparecerá en tu agenda.', 'exito');
    await cargar();
  });
});

document.getElementById('filtro-solicitudes').addEventListener('change', cargar);
cargar();
setInterval(cargar, 6000);
