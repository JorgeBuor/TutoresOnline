import { iniciarPagina, api, avatar, escapar, dinero, estrellas, ICONOS, vacio, conBoton, crearVentana, fechaClave } from '../app.js';

await iniciarPagina();
const filtros = document.getElementById('filtros');
const lista = document.getElementById('lista-tutores');
const resumen = document.getElementById('resumen-busqueda');
const fecha = document.getElementById('f-fecha');

const catalogos = await api('/catalogos');
const opciones = (items, valor, texto) => items.map((i) => `<option value="${escapar(i[valor] ?? i)}">${escapar(i[texto] ?? i)}</option>`).join('');
document.getElementById('f-materia').insertAdjacentHTML('beforeend', opciones(catalogos.materias, 'id', 'nombre'));
document.getElementById('f-nivel').insertAdjacentHTML('beforeend', opciones(catalogos.niveles, 'id', 'nombre'));
document.getElementById('f-ciudad').insertAdjacentHTML('beforeend', catalogos.ciudades.map((c) => `<option>${escapar(c)}</option>`).join(''));
fecha.value = fechaClave();
fecha.min = fechaClave();

let ultimaBusqueda = [];

function consulta() {
  const p = new URLSearchParams({ fecha: fecha.value || fechaClave() });
  const materia = document.getElementById('f-materia').value;
  const nivel = document.getElementById('f-nivel').value;
  const ciudad = document.getElementById('f-ciudad').value;
  const modalidad = filtros.querySelector('input[name=modalidad]:checked')?.value;
  if (materia) p.set('materia_id', materia);
  if (nivel) p.set('nivel_id', nivel);
  if (ciudad) p.set('ciudad', ciudad);
  if (modalidad) p.set('modalidad', modalidad);
  return p;
}

function tarjeta(t, i) {
  const materia = t.materias[0];
  const modos = [t.ofrece_virtual && 'virtual', t.ofrece_presencial && 'presencial'].filter(Boolean).join(' y ');
  const horarios = t.horarios.length
    ? t.horarios.map((h, j) => `<label class="chip horario"><input type="radio" name="h${i}" value="${h.inicio}"${j === 0 ? ' checked' : ''}><span>${h.hora}</span></label>`).join('')
    : '<span class="ayuda">Sin horarios libres este día</span>';
  return `
    <article class="tarjeta tutor">
      <div class="cabeza">${avatar(t.nombre_completo, t.docente_id)}
        <div class="info"><div class="titulo-persona">${escapar(t.nombre_completo)}</div>
          <div class="subtexto">${t.materias.map((m) => escapar(m.materia)).filter((v, k, a) => a.indexOf(v) === k).join(' · ')}</div>
          <div class="ubicacion">${ICONOS.ubicacion}${escapar(t.ciudad || 'Sin ciudad')} · ${modos}</div></div>
        ${estrellas(t.calificacion_promedio, t.total_resenas)}
      </div>
      <div class="horarios"><span class="etiqueta-seccion">Horarios disponibles</span><div class="chips">${horarios}</div></div>
      <div class="pie"><div class="precio">${dinero(materia.tarifa_hora)} <small>/ hora</small></div>
        <button class="btn" data-reservar="${i}"${t.horarios.length ? '' : ' disabled'}>Reservar</button></div>
    </article>`;
}

async function buscar() {
  lista.innerHTML = '<div class="cargando"><span></span><span></span><span></span></div>';
  try {
    const { tutores } = await api(`/tutores?${consulta()}`);
    ultimaBusqueda = tutores;
    const conHorario = tutores.filter((t) => t.horarios.length).length;
    resumen.textContent = tutores.length ? `${tutores.length} tutores encontrados, ${conHorario} con horarios libres ese día` : '';
    lista.innerHTML = tutores.length
      ? tutores.map(tarjeta).join('')
      : vacio('No encontramos tutores con esos filtros. Prueba otra materia, ciudad o modalidad.');
  } catch (error) {
    lista.innerHTML = vacio(escapar(error.message));
  }
}

filtros.addEventListener('change', buscar);
filtros.addEventListener('submit', (ev) => { ev.preventDefault(); buscar(); });

lista.addEventListener('click', (ev) => {
  const boton = ev.target.closest('[data-reservar]');
  if (!boton) return;
  const i = Number(boton.dataset.reservar);
  const tutor = ultimaBusqueda[i];
  const inicio = lista.querySelector(`input[name="h${i}"]:checked`)?.value;
  const materiaFiltro = Number(document.getElementById('f-materia').value);
  const materia = tutor.materias.find((m) => m.materia_id === materiaFiltro) || tutor.materias[0];
  const modalidad = filtros.querySelector('input[name=modalidad]:checked')?.value
    || (tutor.ofrece_virtual ? 'virtual' : 'presencial');

  conBoton(boton, async () => {
    await api('/tutorias', {
      metodo: 'POST',
      cuerpo: { docente_id: tutor.docente_id, materia_id: materia.materia_id, nivel_id: materia.nivel_id, inicio, modalidad },
    });
    crearVentana(`
      <div class="tarjeta">
        <div class="exito">${ICONOS.check}</div>
        <h2>¡Solicitud enviada!</h2>
        <p>${escapar(tutor.nombre_completo)} debe aceptar la clase. Te avisaremos por correo y, al confirmarla, se creará el evento en tu Google Calendar con el enlace de Meet.</p>
        <div class="acciones"><a class="btn" href="/estudiante/inicio.html">Ver mis clases</a><a class="btn claro" href="#" data-cerrar>Seguir buscando</a></div>
      </div>`);
    await buscar();
  });
});

buscar();
