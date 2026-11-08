import { iniciarPagina, api, avatar, escapar, dinero, estrellas, ICONOS, vacio, conBoton, crearVentana, fechaClave, aviso } from '../app.js';

await iniciarPagina();
const filtros = document.getElementById('filtros');
const lista = document.getElementById('lista-tutores');
const resumen = document.getElementById('resumen-busqueda');
const fecha = document.getElementById('f-fecha');

const [catalogos, avisosIniciales] = await Promise.all([api('/catalogos'), api('/avisos-materia').catch(() => [])]);
const opciones = (items, valor, texto) => items.map((i) => `<option value="${escapar(i[valor] ?? i)}">${escapar(i[texto] ?? i)}</option>`).join('');
const selMateria = document.getElementById('f-materia');
const materiaPorId = new Map(catalogos.materias.map((m) => [m.id, m]));
const conAviso = new Set(avisosIniciales.filter((a) => a.materia_id).map((a) => a.materia_id));

// Materias agrupadas por área, con cuántos tutores tiene cada una
const grupos = new Map();
for (const m of catalogos.materias) {
  if (!grupos.has(m.area)) grupos.set(m.area, []);
  grupos.get(m.area).push(m);
}
selMateria.insertAdjacentHTML('beforeend', [...grupos].map(([area, lista]) => `<optgroup label="${escapar(area)}">${
  lista.map((m) => `<option value="${m.id}">${escapar(m.nombre)} ${m.tutores ? `(${m.tutores})` : '· sin tutores aún'}</option>`).join('')}</optgroup>`).join('')
  + '<option value="otra">No encuentro mi materia…</option>');
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
    lista.innerHTML = tutores.length ? tutores.map(tarjeta).join('') : sinResultados();
  } catch (error) {
    lista.innerHTML = vacio(escapar(error.message));
  }
}

const botonAvisame = (id) => (conAviso.has(id)
  ? `<span class="ok-aviso">${ICONOS.check} Te avisaremos por correo</span>`
  : `<button class="btn" type="button" data-avisame="${id}">Avísame cuando haya uno</button>`);

/** Mensaje cuando la búsqueda no trae tutores: distingue "no hay de esa materia" de "no coinciden los filtros". */
function sinResultados() {
  const materia = materiaPorId.get(Number(selMateria.value));
  if (materia && !materia.tutores) {
    return vacio(`<span class="titulo-vacio">Aún no tenemos tutores de ${escapar(materia.nombre)}</span>
      Si quieres, te enviamos un correo apenas un docente la agregue.`, botonAvisame(materia.id));
  }
  if (materia) {
    return vacio(`<span class="titulo-vacio">Ningún tutor coincide con estos filtros</span>
      Hay ${materia.tutores} ${materia.tutores === 1 ? 'tutor' : 'tutores'} de ${escapar(materia.nombre)}. Prueba otra ciudad, modalidad o nivel.`);
  }
  return vacio(`<span class="titulo-vacio">No encontramos tutores con esos filtros</span>
    Prueba otra materia, ciudad o modalidad. ¿No está tu materia? <button type="button" class="enlace-otra" data-otra>Escríbela aquí</button>`);
}

/** El estudiante escribe una materia que no está en la lista y pide que le avisen. */
function ventanaOtraMateria() {
  const ventana = crearVentana(`
    <form class="tarjeta izq" id="form-otra">
      <h2>¿Qué materia buscas?</h2>
      <p>Escríbela y te enviaremos un correo cuando un docente empiece a enseñarla en TutoresOn-Line.</p>
      <div class="campo"><label for="otra-texto">Materia</label><input class="entrada" id="otra-texto" maxlength="60" minlength="3" required placeholder="Ej: Contabilidad de costos"></div>
      <p class="mensaje-error" data-error hidden></p>
      <div class="acciones"><button class="btn" type="submit">Avísame</button><a class="btn claro" href="#" data-cerrar>Cancelar</a></div>
    </form>`);
  ventana.querySelector('input').focus();
  ventana.querySelector('form').addEventListener('submit', (ev) => {
    ev.preventDefault();
    conBoton(ev.submitter, async () => {
      const r = await api('/avisos-materia', { metodo: 'POST', cuerpo: { texto: ventana.querySelector('input').value } });
      if (r.materia_id) conAviso.add(r.materia_id);
      ventana.remove();
      const existente = materiaPorId.get(r.materia_id);
      aviso(existente
        ? `"${existente.nombre}" ya está en la lista: te avisaremos cuando tenga tutores.`
        : 'Listo: te avisaremos por correo cuando un docente la agregue.', 'exito');
    });
  });
}

selMateria.addEventListener('change', (ev) => {
  if (selMateria.value !== 'otra') return;
  ev.stopImmediatePropagation();
  selMateria.value = '';
  ventanaOtraMateria();
  buscar();
});
filtros.addEventListener('change', buscar);
filtros.addEventListener('submit', (ev) => { ev.preventDefault(); buscar(); });

lista.addEventListener('click', (ev) => {
  if (ev.target.closest('[data-otra]')) { ventanaOtraMateria(); return; }
  const avisame = ev.target.closest('[data-avisame]');
  if (avisame) {
    conBoton(avisame, async () => {
      const id = Number(avisame.dataset.avisame);
      await api('/avisos-materia', { metodo: 'POST', cuerpo: { materia_id: id } });
      conAviso.add(id);
      avisame.outerHTML = botonAvisame(id);
      aviso('Listo: te avisaremos por correo cuando haya un tutor.', 'exito');
    });
    return;
  }
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
