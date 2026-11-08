/**
 * Pruebas de punta a punta de la API contra una base PostgreSQL real con el esquema cargado.
 * Correr con:  TEST_DATABASE_URL=postgresql://... npm test
 * Google Calendar y el correo se reemplazan por versiones falsas que registran las llamadas.
 */
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('crypto');
const { SignJWT } = require('jose');
const { crearApp } = require('../src/app');
const { crearContenedor } = require('../src/contenedor');
const { hoyEnZona } = require('../src/utils/fechas');

const SECRETO = 'secreto-de-pruebas-con-al-menos-32-caracteres';
const ZONA = 'America/Bogota';

const correosEnviados = [];
const calendario = {
  creados: [],
  cancelados: [],
  async crearEvento(datos) {
    this.creados.push(datos);
    return { eventId: `evento-${this.creados.length}`, meetUrl: datos.conMeet ? 'https://meet.google.com/aaa-bbbb-ccc' : null };
  },
  async cancelarEvento(organizadorId, eventId) {
    this.cancelados.push(eventId);
  },
};

let servidor;
let base;
let contenedor;
const u = {}; // usuarios de prueba: { id, token }

async function crearUsuario(nombre, rol) {
  const id = randomUUID();
  const meta = rol ? { rol, nombre_completo: nombre } : { full_name: nombre };
  await contenedor.db.consultar(
    `insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3)`,
    [id, `${nombre.toLowerCase().replace(/\s/g, '.')}@prueba.co`, meta],
  );
  const token = await new SignJWT({ role: 'authenticated' })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(id)
    .setAudience('authenticated')
    .setExpirationTime('1h')
    .sign(new TextEncoder().encode(SECRETO));
  return { id, token };
}

async function api(metodo, ruta, { token, cuerpo } = {}) {
  const respuesta = await fetch(`${base}/api${ruta}`, {
    method: metodo,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: cuerpo ? JSON.stringify(cuerpo) : undefined,
  });
  return { status: respuesta.status, datos: await respuesta.json() };
}

// Mañana a una hora dada, en hora de Colombia
const manana = hoyEnZona(ZONA, new Date(Date.now() + 24 * 3600 * 1000));
const aLas = (hora) => `${manana}T${hora}:00-05:00`;

before(async () => {
  contenedor = crearContenedor(
    {
      databaseUrl: process.env.TEST_DATABASE_URL || 'postgresql://postgres@localhost/tutores_test?host=/var/tmp/pgprueba&port=5434',
      dbSsl: false,
      supabaseJwtSecret: SECRETO,
      zonaHoraria: ZONA,
      urlAplicacion: 'http://localhost',
    },
    { calendario, correo: { enviar: async (c) => { correosEnviados.push(c); return true; } } },
  );
  // Cada corrida empieza con la base vacía: solo quedan los catálogos iniciales
  await contenedor.db.consultar('truncate tutorias, solicitudes_tiempo_real, conversaciones, notificaciones, avisos_materia cascade');
  await contenedor.db.consultar('delete from auth.users');
  await contenedor.db.consultar('delete from materias where creada_por is null and id > 14');
  servidor = crearApp(contenedor).listen(0);
  base = `http://localhost:${servidor.address().port}`;

  u.docente = await crearUsuario('Carlos Fuentes', 'docente');
  u.docente2 = await crearUsuario('Elena Gomez', 'docente');
  u.estudiante = await crearUsuario('Maria Restrepo', 'estudiante');
  u.estudiante2 = await crearUsuario('Mateo Bermudez', 'estudiante');
});

after(async () => {
  servidor.close();
  await contenedor.db.cerrar();
});

test('las rutas públicas responden y las privadas exigen sesión', async () => {
  assert.equal((await api('GET', '/salud')).status, 200);
  const catalogos = await api('GET', '/catalogos');
  assert.ok(catalogos.datos.materias.length >= 10);
  assert.equal((await api('GET', '/yo')).status, 401);
  assert.equal((await api('GET', '/yo', { token: 'token-falso' })).status, 401);
  const yo = await api('GET', '/yo', { token: u.estudiante.token });
  assert.equal(yo.datos.rol, 'estudiante');
});

test('el docente configura materias, tarifa y disponibilidad', async () => {
  const catalogos = (await api('GET', '/catalogos')).datos;
  const materia = (n) => catalogos.materias.find((m) => m.nombre === n).id;
  const universitario = catalogos.niveles.find((n) => n.nombre === 'Universitario').id;
  const todaLaSemana = [0, 1, 2, 3, 4, 5, 6].map((dia) => ({ dia_semana: dia, hora_inicio: '06:00', hora_fin: '22:00' }));

  for (const doc of [u.docente, u.docente2]) {
    const r = await api('PUT', '/docente/configuracion', {
      token: doc.token,
      cuerpo: {
        ofrece_virtual: true,
        ofrece_presencial: true,
        zona_presencial: 'Biblioteca central',
        materias: [
          { materia_id: materia('Cálculo Diferencial'), nivel_id: universitario, tarifa_hora: 25000 },
          { materia_id: materia('Electromagnetismo'), nivel_id: universitario, tarifa_hora: 30000 },
        ],
        disponibilidad: todaLaSemana,
      },
    });
    assert.equal(r.status, 200, JSON.stringify(r.datos));
    assert.equal(r.datos.materias.length, 2);
    assert.equal(r.datos.disponibilidad.length, 7);
  }

  const cruce = await api('PUT', '/docente/configuracion', {
    token: u.docente.token,
    cuerpo: { ofrece_virtual: true, disponibilidad: [
      { dia_semana: 1, hora_inicio: '08:00', hora_fin: '10:00' },
      { dia_semana: 1, hora_inicio: '09:00', hora_fin: '11:00' },
    ] },
  });
  assert.equal(cruce.status, 400);

  const sinModalidad = await api('PUT', '/docente/configuracion', { token: u.docente.token, cuerpo: {} });
  assert.equal(sinModalidad.status, 400);

  const estudianteNoPuede = await api('PUT', '/docente/configuracion', { token: u.estudiante.token, cuerpo: {} });
  assert.equal(estudianteNoPuede.status, 403);
});

let materiaCalculo;
let tutoriaA;

test('el estudiante busca tutores por materia y ve sus horarios libres', async () => {
  materiaCalculo = (await api('GET', '/catalogos')).datos.materias.find((m) => m.nombre === 'Cálculo Diferencial').id;
  const r = await api('GET', `/tutores?materia_id=${materiaCalculo}&modalidad=virtual&fecha=${manana}`, { token: u.estudiante.token });
  assert.equal(r.status, 200);
  const carlos = r.datos.tutores.find((t) => t.docente_id === u.docente.id);
  assert.ok(carlos, 'Carlos debe aparecer en la búsqueda');
  assert.equal(Number(carlos.materias[0].tarifa_hora), 25000);
  assert.equal(carlos.horarios.length, 16, 'de 06:00 a 22:00 hay 16 bloques de una hora');
});

test('reservar: queda pendiente, avisa al docente y bloquea el horario', async () => {
  correosEnviados.length = 0;
  const r = await api('POST', '/tutorias', {
    token: u.estudiante.token,
    cuerpo: { docente_id: u.docente.id, materia_id: materiaCalculo, inicio: aLas('10:00'), modalidad: 'virtual' },
  });
  assert.equal(r.status, 201, JSON.stringify(r.datos));
  assert.equal(r.datos.estado, 'pendiente');
  assert.equal(Number(r.datos.tarifa_hora), 25000);
  tutoriaA = r.datos.id;
  assert.equal(correosEnviados.length, 1);
  assert.match(correosEnviados[0].asunto, /nueva solicitud/i);

  const repetida = await api('POST', '/tutorias', {
    token: u.estudiante2.token,
    cuerpo: { docente_id: u.docente.id, materia_id: materiaCalculo, inicio: aLas('10:30'), modalidad: 'virtual' },
  });
  assert.equal(repetida.status, 409, 'el horario se cruza con la reserva anterior');

  const deMadrugada = await api('POST', '/tutorias', {
    token: u.estudiante.token,
    cuerpo: { docente_id: u.docente.id, materia_id: materiaCalculo, inicio: aLas('03:00'), modalidad: 'virtual' },
  });
  assert.equal(deMadrugada.status, 409, 'fuera de la disponibilidad del docente');

  const enElPasado = await api('POST', '/tutorias', {
    token: u.estudiante.token,
    cuerpo: { docente_id: u.docente.id, materia_id: materiaCalculo, inicio: '2020-01-01T10:00:00-05:00', modalidad: 'virtual' },
  });
  assert.equal(enElPasado.status, 400);

  const docenteNoReserva = await api('POST', '/tutorias', { token: u.docente2.token, cuerpo: {} });
  assert.equal(docenteNoReserva.status, 403);

  const libres = await api('GET', `/tutores/${u.docente.id}?fecha=${manana}`, { token: u.estudiante.token });
  assert.ok(!libres.datos.horarios.some((h) => h.hora === '10:00'), 'las 10:00 ya no aparecen libres');
});

test('el docente acepta: se crea el evento con Meet y se avisa a los dos', async () => {
  correosEnviados.length = 0;
  const intruso = await api('PATCH', `/tutorias/${tutoriaA}`, { token: u.estudiante.token, cuerpo: { estado: 'confirmada' } });
  assert.equal(intruso.status, 403);

  const r = await api('PATCH', `/tutorias/${tutoriaA}`, { token: u.docente.token, cuerpo: { estado: 'confirmada' } });
  assert.equal(r.status, 200, JSON.stringify(r.datos));
  assert.equal(r.datos.estado, 'confirmada');
  assert.equal(r.datos.meet_url, 'https://meet.google.com/aaa-bbbb-ccc');
  assert.equal(calendario.creados.at(-1).invitados[0], 'maria.restrepo@prueba.co');
  assert.equal(correosEnviados.length, 2);

  const otraVez = await api('PATCH', `/tutorias/${tutoriaA}`, { token: u.docente.token, cuerpo: { estado: 'confirmada' } });
  assert.equal(otraVez.status, 409);

  const proximas = await api('GET', '/tutorias?vista=virtuales', { token: u.estudiante.token });
  assert.ok(proximas.datos.some((t) => t.id === tutoriaA));
});

test('el docente rechaza y el estudiante cancela', async () => {
  const reserva = await api('POST', '/tutorias', {
    token: u.estudiante2.token,
    cuerpo: { docente_id: u.docente.id, materia_id: materiaCalculo, inicio: aLas('15:00'), modalidad: 'presencial' },
  });
  assert.equal(reserva.datos.lugar, 'Biblioteca central');
  const rechazada = await api('PATCH', `/tutorias/${reserva.datos.id}`, { token: u.docente.token, cuerpo: { estado: 'rechazada' } });
  assert.equal(rechazada.datos.estado, 'rechazada');

  const cancelada = await api('PATCH', `/tutorias/${tutoriaA}`, { token: u.estudiante.token, cuerpo: { estado: 'cancelada' } });
  assert.equal(cancelada.datos.estado, 'cancelada');
  assert.ok(calendario.cancelados.length >= 1, 'se borra el evento del calendario');
});

test('completar una clase y calificar al docente actualiza su reputación', async () => {
  const pasada = await contenedor.db.uno(
    `insert into tutorias (estudiante_id, docente_id, materia_id, inicio, fin, modalidad, tarifa_hora, estado)
     values ($1, $2, $3, now() - interval '2 hours', now() - interval '1 hour', 'virtual', 25000, 'confirmada')
     returning id`,
    [u.estudiante.id, u.docente.id, materiaCalculo],
  );

  const antes = await api('POST', `/tutorias/${pasada.id}/resena`, { token: u.estudiante.token, cuerpo: { estrellas: 5 } });
  assert.equal(antes.status, 409, 'no se califica antes de completar');

  const completada = await api('PATCH', `/tutorias/${pasada.id}`, { token: u.docente.token, cuerpo: { estado: 'completada' } });
  assert.equal(completada.datos.estado, 'completada');

  const resena = await api('POST', `/tutorias/${pasada.id}/resena`, {
    token: u.estudiante.token, cuerpo: { estrellas: 5, comentario: 'Explica muy claro' },
  });
  assert.equal(resena.status, 201);
  assert.equal((await api('POST', `/tutorias/${pasada.id}/resena`, { token: u.estudiante.token, cuerpo: { estrellas: 4 } })).status, 409);

  const tutor = await api('GET', `/tutores/${u.docente.id}`, { token: u.estudiante.token });
  assert.equal(Number(tutor.datos.calificacion_promedio), 5);
  assert.equal(tutor.datos.total_resenas, 1);
  assert.equal(tutor.datos.resenas[0].comentario, 'Explica muy claro');
});

test('chat entre estudiante y docente, privado para terceros', async () => {
  const conv = await api('POST', '/conversaciones', { token: u.estudiante.token, cuerpo: { con_usuario_id: u.docente.id } });
  assert.equal(conv.status, 201);
  const mismo = await api('POST', '/conversaciones', { token: u.docente.token, cuerpo: { con_usuario_id: u.estudiante.id } });
  assert.equal(mismo.datos.id, conv.datos.id, 'reutiliza la misma conversación');

  const msg = await api('POST', `/conversaciones/${conv.datos.id}/mensajes`, { token: u.estudiante.token, cuerpo: { contenido: 'Hola profe' } });
  assert.equal(msg.status, 201);

  const listaDocente = await api('GET', '/conversaciones', { token: u.docente.token });
  const c = listaDocente.datos.find((x) => x.id === conv.datos.id);
  assert.equal(c.no_leidos, 1);
  assert.equal(c.contraparte, 'Maria Restrepo');

  const mensajes = await api('GET', `/conversaciones/${conv.datos.id}/mensajes`, { token: u.docente.token });
  assert.equal(mensajes.datos[0].contenido, 'Hola profe');
  const despues = await api('GET', '/conversaciones', { token: u.docente.token });
  assert.equal(despues.datos.find((x) => x.id === conv.datos.id).no_leidos, 0);

  const ajeno = await api('GET', `/conversaciones/${conv.datos.id}/mensajes`, { token: u.estudiante2.token });
  assert.equal(ajeno.status, 403);
  const entreEstudiantes = await api('POST', '/conversaciones', { token: u.estudiante.token, cuerpo: { con_usuario_id: u.estudiante2.id } });
  assert.equal(entreEstudiantes.status, 400);
});

test('tiempo real: solicitud, ofertas y aceptación crean la tutoría', async () => {
  const materiaFisica = (await api('GET', '/catalogos')).datos.materias.find((m) => m.nombre === 'Electromagnetismo').id;
  const solicitud = await api('POST', '/solicitudes', {
    token: u.estudiante.token,
    cuerpo: { materia_id: materiaFisica, tema: 'Ejercicios de campos', tarifa_sugerida: 20000 },
  });
  assert.equal(solicitud.status, 201, JSON.stringify(solicitud.datos));

  const vistas = await api('GET', '/solicitudes', { token: u.docente2.token });
  assert.ok(vistas.datos.some((s) => s.id === solicitud.datos.id));

  const oferta1 = await api('POST', `/solicitudes/${solicitud.datos.id}/ofertas`, {
    token: u.docente2.token, cuerpo: { tarifa_ofertada: 22000, minutos_llegada: 2 },
  });
  assert.equal(oferta1.status, 201);
  const oferta2 = await api('POST', `/solicitudes/${solicitud.datos.id}/ofertas`, { token: u.docente.token, cuerpo: {} });
  assert.equal(Number(oferta2.datos.tarifa_ofertada), 20000, 'sin precio propio acepta el sugerido');

  const detalle = await api('GET', `/solicitudes/${solicitud.datos.id}`, { token: u.estudiante.token });
  assert.equal(detalle.datos.ofertas.length, 2);
  assert.equal((await api('GET', `/solicitudes/${solicitud.datos.id}`, { token: u.estudiante2.token })).status, 403);

  const aceptar = await api('PATCH', `/ofertas/${oferta1.datos.id}`, { token: u.estudiante.token, cuerpo: { estado: 'aceptada' } });
  assert.equal(aceptar.status, 200, JSON.stringify(aceptar.datos));
  assert.equal(aceptar.datos.tutoria.estado, 'confirmada');
  assert.equal(aceptar.datos.tutoria.origen, 'tiempo_real');
  assert.equal(Number(aceptar.datos.tutoria.tarifa_hora), 22000);
  assert.ok(aceptar.datos.tutoria.meet_url);

  const tarde = await api('POST', `/solicitudes/${solicitud.datos.id}/ofertas`, { token: u.docente.token, cuerpo: {} });
  assert.equal(tarde.status, 409, 'la solicitud ya fue asignada');
  const otra = await api('PATCH', `/ofertas/${oferta2.datos.id}`, { token: u.estudiante.token, cuerpo: { estado: 'aceptada' } });
  assert.equal(otra.status, 400, 'la otra oferta quedó rechazada');
});

test('quien entra con Google elige su rol una sola vez y el docente conecta Calendar', async () => {
  const nuevo = await crearUsuario('Laura Castro', null);
  const yo = await api('GET', '/yo', { token: nuevo.token });
  assert.equal(yo.datos.rol_confirmado, false);

  const rol = await api('POST', '/yo/rol', { token: nuevo.token, cuerpo: { rol: 'docente' } });
  assert.equal(rol.status, 200);
  assert.equal(rol.datos.rol, 'docente');
  assert.equal((await api('POST', '/yo/rol', { token: nuevo.token, cuerpo: { rol: 'estudiante' } })).status, 409);

  const google = await api('PUT', '/yo/google', { token: nuevo.token, cuerpo: { refresh_token: 'token-de-google' } });
  assert.equal(google.datos.google_conectado, true);
  assert.equal((await api('PUT', '/yo/google', { token: u.estudiante.token, cuerpo: { refresh_token: 'x' } })).status, 403);
});

test('catálogo abierto: el docente crea materias y se avisa a los estudiantes que las esperaban', async () => {
  const docente3 = await crearUsuario('Lucia Paez', 'docente');
  const catalogo = async () => (await api('GET', '/catalogos')).datos;
  const inicial = await catalogo();
  const quimica = inicial.materias.find((m) => m.nombre === 'Química Orgánica');
  assert.equal(quimica.tutores, 0);
  assert.ok(inicial.areas.includes('Ciencias'));

  // Los estudiantes piden aviso: uno por una materia del catálogo y otro escribiendo una que no existe
  const porTexto = await api('POST', '/avisos-materia', { token: u.estudiante.token, cuerpo: { texto: 'contabilidad  de COSTOS' } });
  assert.equal(porTexto.status, 201);
  assert.equal(porTexto.datos.materia_id, null);
  const repetido = await api('POST', '/avisos-materia', { token: u.estudiante.token, cuerpo: { texto: 'Contabilidad de costos' } });
  assert.equal(repetido.status, 201);
  assert.equal((await api('GET', '/avisos-materia', { token: u.estudiante.token })).datos.length, 1, 'no se duplica el aviso');
  const porMateria = await api('POST', '/avisos-materia', { token: u.estudiante2.token, cuerpo: { materia_id: quimica.id } });
  assert.equal(porMateria.status, 201);
  const textoExistente = await api('POST', '/avisos-materia', { token: u.estudiante2.token, cuerpo: { texto: 'quimica organica' } });
  assert.equal(textoExistente.datos.materia_id, quimica.id, 'si lo escrito ya existe, el aviso queda en esa materia');

  // Solo los docentes crean materias, y sin duplicados aunque cambien mayúsculas o tildes
  assert.equal((await api('POST', '/materias', { token: u.estudiante.token, cuerpo: { nombre: 'Algo', area: 'Otra' } })).status, 403);
  const creada = await api('POST', '/materias', { token: docente3.token, cuerpo: { nombre: 'contabilidad de costos', area: 'finanzas' } });
  assert.equal(creada.status, 201, JSON.stringify(creada.datos));
  assert.equal(creada.datos.nueva, true);
  assert.equal(creada.datos.materia.nombre, 'Contabilidad de costos');
  assert.equal(creada.datos.materia.area, 'Finanzas');
  const otraVez = await api('POST', '/materias', { token: docente3.token, cuerpo: { nombre: 'CONTABILIDAD   DE CÓSTOS', area: 'Finanzas' } });
  assert.equal(otraVez.datos.nueva, false);
  assert.equal(otraVez.datos.materia.id, creada.datos.materia.id);
  const areaExistente = await api('POST', '/materias', { token: docente3.token, cuerpo: { nombre: 'Bioquímica', area: 'ciencias' } });
  assert.equal(areaExistente.datos.materia.area, 'Ciencias', 'usa el área existente en vez de duplicarla');
  assert.equal((await api('POST', '/materias', { token: docente3.token, cuerpo: { nombre: '12', area: 'Ciencias' } })).status, 400);

  // El aviso escrito quedó unido a la materia nueva
  const avisos = (await api('GET', '/avisos-materia', { token: u.estudiante.token })).datos;
  assert.equal(avisos[0].materia_id, creada.datos.materia.id);

  // Al publicar materias y horarios, se envía el correo a los dos estudiantes, una sola vez
  const universitario = inicial.niveles.find((n) => n.nombre === 'Universitario').id;
  const antes = correosEnviados.length;
  const guardar = () => api('PUT', '/docente/configuracion', {
    token: docente3.token,
    cuerpo: {
      ofrece_virtual: true,
      materias: [
        { materia_id: creada.datos.materia.id, nivel_id: universitario, tarifa_hora: 40000 },
        { materia_id: quimica.id, nivel_id: universitario, tarifa_hora: 40000 },
      ],
      disponibilidad: [{ dia_semana: 2, hora_inicio: '14:00', hora_fin: '16:00' }],
    },
  });
  assert.equal((await guardar()).status, 200);
  const nuevos = correosEnviados.slice(antes);
  assert.equal(nuevos.length, 2);
  assert.ok(nuevos.some((c) => c.asunto === 'Ya hay un tutor de Contabilidad de costos' && c.para === 'maria.restrepo@prueba.co'));
  assert.ok(nuevos.some((c) => c.asunto === 'Ya hay un tutor de Química Orgánica' && c.para === 'mateo.bermudez@prueba.co'));
  await guardar();
  assert.equal(correosEnviados.length, antes + 2, 'no repite el aviso');
  assert.equal((await api('GET', '/avisos-materia', { token: u.estudiante.token })).datos.length, 0);

  const final = await catalogo();
  assert.equal(final.materias.find((m) => m.id === quimica.id).tutores, 1);
  assert.equal(final.materias.find((m) => m.id === creada.datos.materia.id).tutores, 1);
});
