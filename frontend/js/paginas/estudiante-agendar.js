import { iniciarPagina, api, avatar, escapar, dinero, estrellas, ICONOS, vacio, conBoton, crearVentana, fechaClave, aviso } from '../app.js';

await iniciarPagina();

/*
 * Agendar en pasos: 1) materia y nivel, 2) día, 3) modalidad (opcional).
 * Apenas hay materia y día, aparecen solo los tutores que tienen horarios libres ese día.
 */
const filtros = document.getElementById('filtros');
const selMateria = document.getElementById('f-materia');
const selNivel = document.getElementById('f-nivel');
const selCiudad = document.getElementById('f-ciudad');
const selDuracion = document.getElementById('f-duracion');
const campoFecha = document.getElementById('f-fecha');
const contDias = document.getElementById('dias');
const paso2 = document.getElementById('paso-2');
const paso3 = document.getElementById('paso-3');
const resultados = document.getElementById('resultados');
const titulo = document.getElementById('titulo-resultados');
const lista = document.getElementById('lista-tutores');

const [catalogos, avisosIniciales] = await Promise.all([api('/catalogos'), api('/avisos-materia').catch(() => [])]);
const materiaPorId = new Map(catalogos.materias.map((m) => [m.id, m]));
const conAviso = new Set(avisosIniciales.filter((a) => a.materia_id).map((a) => a.materia_id));

/* ---------- Fechas ---------- */
const DIAS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
const hoy = fechaClave();
const sumarDias = (clave, n) => {
  const d = new Date(`${clave}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const diaSemana = (clave) => new Date(`${clave}T12:00:00Z`).getUTCDay();
const fechaLarga = (clave) => new Intl.DateTimeFormat('es-CO', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long' })
  .format(new Date(`${clave}T12:00:00Z`));

/* ---------- Paso 1: materias agrupadas por área, con cuántos tutores tiene cada una ---------- */
const grupos = new Map();
for (const m of catalogos.materias) {
  if (!grupos.has(m.area)) grupos.set(m.area, []);
  grupos.get(m.area).push(m);
}
selMateria.insertAdjacentHTML('beforeend', [...grupos].map(([area, materias]) => `<optgroup label="${escapar(area)}">${
  materias.map((m) => `<option value="${m.id}">${escapar(m.nombre)} ${m.tutores ? `(${m.tutores} ${m.tutores === 1 ? 'tutor' : 'tutores'})` : '· sin tutores aún'}</option>`).join('')
}</optgroup>`).join('') + '<option value="otra">No encuentro mi materia…</option>');
selNivel.insertAdjacentHTML('beforeend', catalogos.niveles.map((n) => `<option value="${n.id}">${escapar(n.nombre)}</option>`).join(''));
selCiudad.insertAdjacentHTML('beforeend', catalogos.ciudades.map((c) => `<option>${escapar(c)}</option>`).join(''));

/* ---------- Paso 2: los próximos 7 días y "Otra fecha" ---------- */
function etiquetaDia(clave, n) {
  if (n === 0) return 'Hoy';
  if (n === 1) return 'Mañana';
  const dia = DIAS[diaSemana(clave)];
  return dia.charAt(0).toUpperCase() + dia.slice(1);
}
contDias.innerHTML = Array.from({ length: 7 }, (_, n) => {
  const clave = sumarDias(hoy, n);
  return `<label class="chip dia"><input type="radio" name="dia" value="${clave}"><span>${etiquetaDia(clave, n)}<small>${Number(clave.slice(8))} ${new Intl.DateTimeFormat('es-CO', { timeZone: 'UTC', month: 'short' }).format(new Date(`${clave}T12:00:00Z`)).replace('.', '')}</small></span></label>`;
}).join('') + '<label class="chip dia"><input type="radio" name="dia" value="otra"><span>Otra fecha<small id="otra-texto-dia">elegir</small></span></label>';
campoFecha.min = hoy;

function fechaElegida() {
  const marcado = filtros.querySelector('input[name=dia]:checked');
  if (!marcado) return null;
  if (marcado.value === 'otra') return campoFecha.value || null;
  return marcado.value;
}

/** Selecciona una fecha cualquiera (desde "Otra fecha" o desde la sugerencia del próximo día). */
function elegirFecha(clave) {
  const chip = filtros.querySelector(`input[name=dia][value="${clave}"]`);
  if (chip) {
    chip.checked = true;
    campoFecha.hidden = true;
  } else {
    filtros.querySelector('input[name=dia][value=otra]').checked = true;
    campoFecha.hidden = false;
    campoFecha.value = clave;
    document.getElementById('otra-texto-dia').textContent = `${DIAS[diaSemana(clave)]} ${Number(clave.slice(8))}`;
  }
}

const modalidadElegida = () => filtros.querySelector('input[name=modalidad]:checked')?.value || '';

/* ---------- Pasos habilitados según lo que falta ---------- */
function actualizarPasos() {
  const materia = materiaPorId.get(Number(selMateria.value));
  paso2.disabled = !materia || !materia.tutores;
  paso3.disabled = paso2.disabled || !fechaElegida();
  document.getElementById('campo-ciudad').hidden = modalidadElegida() !== 'presencial';
}

/* ---------- Resultados ---------- */
let ultimaBusqueda = [];
let busquedaActual = 0;

const duracion = () => Number(selDuracion.value) || 60;
const textoDuracion = (min) => (min === 60 ? '1 hora' : min === 90 ? '1 hora y media' : `${min / 60} horas`);
const horaFin = (inicio) => new Intl.DateTimeFormat('es-CO', { timeZone: 'America/Bogota', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
  .format(new Date(new Date(inicio).getTime() + duracion() * 60000));

function tarjeta(t, i) {
  const materia = t.materias[0];
  const total = Number(materia.tarifa_hora) * duracion() / 60;
  const niveles = t.materias.map((m) => m.nivel).filter((v, k, a) => a.indexOf(v) === k).join(', ');
  const modos = [t.ofrece_virtual && 'virtual', t.ofrece_presencial && 'presencial'].filter(Boolean).join(' y ');
  // Con clases de más de una hora se muestra el rango completo (08:00 a 10:00)
  // Los horarios que caen en horas solo presenciales del docente se ven en violeta
  const horarios = t.horarios.map((h, j) => `<label class="chip horario${h.permite_virtual ? '' : ' solo-presencial'}" ${h.permite_virtual ? '' : 'title="Solo presencial"'}><input type="radio" name="h${i}" value="${h.inicio}" data-pv="${h.permite_virtual ? 1 : 0}"${j === 0 ? ' checked' : ''}><span>${h.hora}${duracion() > 60 ? ` a ${horaFin(h.inicio)}` : ''}</span></label>`).join('');
  const hayPresenciales = t.horarios.some((h) => !h.permite_virtual);
  // Si el estudiante dijo "Me da igual" y el tutor ofrece las dos, elige aquí
  const eligeModo = !modalidadElegida() && t.ofrece_virtual && t.ofrece_presencial
    ? `<span class="etiqueta-seccion modo-reserva">Modalidad</span><div class="chips">
         <label class="chip horario"><input type="radio" name="m${i}" value="virtual" checked><span>Virtual</span></label>
         <label class="chip horario"><input type="radio" name="m${i}" value="presencial"><span>Presencial</span></label></div>`
    : '';
  return `
    <article class="tarjeta tutor">
      <div class="cabeza">${avatar(t.nombre_completo, t.docente_id)}
        <div class="info"><div class="titulo-persona">${escapar(t.nombre_completo)}</div>
          <div class="subtexto">${escapar(materia.materia)} · ${escapar(niveles)}</div>
          <div class="ubicacion">${ICONOS.ubicacion}${escapar(t.ciudad || 'Sin ciudad')} · ${modos}</div></div>
        ${estrellas(t.calificacion_promedio, t.total_resenas)}
      </div>
      <div class="horarios"><span class="etiqueta-seccion">Horarios libres</span><div class="chips">${horarios}</div>
        ${hayPresenciales ? '<span class="nota-presencial">Los horarios en violeta son solo para clase presencial</span>' : ''}${eligeModo}</div>
      <div class="pie"><div class="precio">${dinero(duracion() === 60 ? materia.tarifa_hora : total)} <small>${duracion() === 60 ? '/ hora' : `total ${duracion() / 60} h`}</small></div>
        <button class="btn" type="button" data-reservar="${i}">Reservar</button></div>
    </article>`;
}

/** Si el horario elegido es solo presencial, en esa tarjeta se marca Presencial y se bloquea Virtual. */
function ajustarModoTarjeta(i) {
  const elegido = lista.querySelector(`input[name="h${i}"]:checked`);
  const virtual = lista.querySelector(`input[name="m${i}"][value=virtual]`);
  if (!elegido || !virtual) return;
  const soloPresencial = elegido.dataset.pv === '0';
  virtual.disabled = soloPresencial;
  virtual.parentElement.classList.toggle('deshabilitado', soloPresencial);
  if (soloPresencial) lista.querySelector(`input[name="m${i}"][value=presencial]`).checked = true;
}
lista.addEventListener('change', (ev) => {
  const nombre = ev.target.name || '';
  if (nombre.startsWith('h')) ajustarModoTarjeta(Number(nombre.slice(1)));
});

const botonAvisame = (id) => (conAviso.has(id)
  ? `<span class="ok-aviso">${ICONOS.check} Te avisaremos por correo</span>`
  : `<button class="btn" type="button" data-avisame="${id}">Avísame cuando haya uno</button>`);

function mostrar(tituloHtml, contenido) {
  resultados.hidden = false;
  titulo.innerHTML = tituloHtml;
  lista.innerHTML = contenido;
}

async function buscar() {
  actualizarPasos();
  const materia = materiaPorId.get(Number(selMateria.value));
  if (!materia) {
    resultados.hidden = true;
    return;
  }
  if (!materia.tutores) {
    mostrar('', vacio(`<span class="titulo-vacio">Aún no tenemos tutores de ${escapar(materia.nombre)}</span>
      Si quieres, te enviamos un correo apenas un docente la agregue.`, botonAvisame(materia.id)));
    return;
  }
  const fecha = fechaElegida();
  if (!fecha) {
    resultados.hidden = true;
    return;
  }

  const p = new URLSearchParams({ materia_id: materia.id, fecha, duracion_min: duracion(), solo_disponibles: 'true', proximo: 'true' });
  if (selNivel.value) p.set('nivel_id', selNivel.value);
  if (modalidadElegida()) p.set('modalidad', modalidadElegida());
  if (modalidadElegida() === 'presencial' && selCiudad.value) p.set('ciudad', selCiudad.value);

  const numero = ++busquedaActual;
  mostrar('Buscando tutores…', '<div class="cargando" aria-label="Cargando"><span></span><span></span><span></span></div>');
  try {
    const r = await api(`/tutores?${p}`);
    if (numero !== busquedaActual) return; // llegó una búsqueda más nueva
    ultimaBusqueda = r.tutores;
    const cuando = fechaLarga(fecha);
    if (r.tutores.length) {
      mostrar(`${r.tutores.length} ${r.tutores.length === 1 ? 'tutor disponible' : 'tutores disponibles'}<small>${escapar(materia.nombre)} · ${cuando} · clase de ${textoDuracion(duracion())}</small>`,
        r.tutores.map(tarjeta).join(''));
      r.tutores.forEach((_, i) => ajustarModoTarjeta(i));
    } else if (!r.total_materia) {
      mostrar('', vacio(`<span class="titulo-vacio">Ningún tutor de ${escapar(materia.nombre)} coincide con ese nivel o modalidad</span>
        Prueba con <b>Cualquier nivel</b> o con <b>Me da igual</b> en la modalidad.`));
    } else {
      const sugerencia = r.proxima_fecha
        ? `<button class="btn" type="button" data-ir-fecha="${r.proxima_fecha}">Ver el ${fechaLarga(r.proxima_fecha)}</button>`
        : '';
      mostrar('', vacio(`<span class="titulo-vacio">${duracion() === 60 ? 'Nadie tiene horarios libres' : `Nadie tiene espacio para una clase de ${textoDuracion(duracion())}`} el ${cuando}</span>
        ${r.proxima_fecha ? 'El próximo día con tutores disponibles es este:' : 'En las próximas dos semanas tampoco hay horarios libres. Prueba otro nivel o modalidad.'}`, sugerencia));
    }
  } catch (error) {
    if (numero === busquedaActual) mostrar('', vacio(escapar(error.message)));
  }
}

/* ---------- Materia que no está en la lista ---------- */
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

/* ---------- Eventos ---------- */
selMateria.addEventListener('change', (ev) => {
  if (selMateria.value !== 'otra') return;
  ev.stopImmediatePropagation();
  selMateria.value = '';
  ventanaOtraMateria();
  buscar();
});
filtros.addEventListener('change', (ev) => {
  if (ev.target.name === 'dia') {
    campoFecha.hidden = ev.target.value !== 'otra';
    if (ev.target.value === 'otra') {
      campoFecha.focus();
      if (!campoFecha.value) {
        // Mientras no elija la fecha, no se muestran resultados de otro día
        resultados.hidden = true;
        actualizarPasos();
        return;
      }
    }
  }
  if (ev.target === campoFecha && campoFecha.value) elegirFecha(campoFecha.value);
  buscar();
});
filtros.addEventListener('submit', (ev) => { ev.preventDefault(); buscar(); });

lista.addEventListener('click', (ev) => {
  const irFecha = ev.target.closest('[data-ir-fecha]');
  if (irFecha) {
    elegirFecha(irFecha.dataset.irFecha);
    buscar();
    return;
  }
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
  const materia = tutor.materias[0];
  const soloPresencial = lista.querySelector(`input[name="h${i}"]:checked`)?.dataset.pv === '0';
  const modalidad = modalidadElegida()
    || (soloPresencial ? 'presencial' : null)
    || lista.querySelector(`input[name="m${i}"]:checked`)?.value
    || (tutor.ofrece_virtual ? 'virtual' : 'presencial');

  conBoton(boton, async () => {
    await api('/tutorias', {
      metodo: 'POST',
      cuerpo: { docente_id: tutor.docente_id, materia_id: materia.materia_id, nivel_id: materia.nivel_id, inicio, duracion_min: duracion(), modalidad },
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

// Se puede llegar con la materia ya elegida: /estudiante/agendar.html?materia=3
const desdeEnlace = new URLSearchParams(location.search).get('materia');
if (desdeEnlace && materiaPorId.has(Number(desdeEnlace))) selMateria.value = desdeEnlace;
actualizarPasos();
buscar();
