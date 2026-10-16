-- =====================================================================
-- TutoresOn-Line · Datos de demostración (opcional)
-- Crea los mismos usuarios que aparecen en las pantallas para la sustentación.
-- Contraseña de todos los usuarios demo: Demo1234*
-- Ejecutar después de schema.sql y seed.sql
-- =====================================================================

-- Usuarios en Supabase Auth (el trigger crea perfiles y docentes solos)
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                        raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', '11111111-1111-1111-1111-111111111111', 'authenticated', 'authenticated',
   'maria.restrepo@tutores.com', crypt('Demo1234*', gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}', '{"rol":"estudiante","nombre_completo":"María Camila Restrepo"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '22222222-2222-2222-2222-222222222222', 'authenticated', 'authenticated',
   'carlos.fuentes@tutores.com', crypt('Demo1234*', gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}', '{"rol":"docente","nombre_completo":"Dr. Carlos Fuentes"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '33333333-3333-3333-3333-333333333333', 'authenticated', 'authenticated',
   'elena.gomez@tutores.com', crypt('Demo1234*', gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}', '{"rol":"docente","nombre_completo":"Mtra. Elena Gómez"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '44444444-4444-4444-4444-444444444444', 'authenticated', 'authenticated',
   'sofia.restrepo@tutores.com', crypt('Demo1234*', gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}', '{"rol":"docente","nombre_completo":"Dra. Sofía Restrepo"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '55555555-5555-5555-5555-555555555555', 'authenticated', 'authenticated',
   'andres.mendoza@tutores.com', crypt('Demo1234*', gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}', '{"rol":"docente","nombre_completo":"Ing. Andrés Mendoza"}', now(), now());

update perfiles set ciudad = 'Barranquilla' where id = '11111111-1111-1111-1111-111111111111';
update perfiles set ciudad = 'Medellín'     where id = '22222222-2222-2222-2222-222222222222';
update perfiles set ciudad = 'Bogotá'       where id in ('33333333-3333-3333-3333-333333333333', '44444444-4444-4444-4444-444444444444');
update perfiles set ciudad = 'Cali'         where id = '55555555-5555-5555-5555-555555555555';

update docentes set ofrece_presencial = true, zona_presencial = 'El Poblado', google_conectado = true,
                    biografia = 'Doctor en Física. 10 años enseñando cálculo y física universitaria.'
 where id = '22222222-2222-2222-2222-222222222222';
update docentes set biografia = 'Magíster en Química, clases virtuales para universitarios.'
 where id = '33333333-3333-3333-3333-333333333333';
update docentes set biografia = 'Bióloga, especialista en biología celular y molecular.'
 where id = '44444444-4444-4444-4444-444444444444';
update docentes set ofrece_presencial = true, zona_presencial = 'Granada',
                    biografia = 'Ingeniero de software, enseño Python desde cero.'
 where id = '55555555-5555-5555-5555-555555555555';

-- Materias y tarifas (COP por hora)
insert into docente_materias (docente_id, materia_id, nivel_id, tarifa_hora)
select '22222222-2222-2222-2222-222222222222', m.id, n.id, 25000
  from materias m, niveles_educativos n
 where m.nombre in ('Álgebra Lineal', 'Cálculo Multivariable', 'Física Cuántica') and n.nombre = 'Universitario';
insert into docente_materias (docente_id, materia_id, nivel_id, tarifa_hora)
select '33333333-3333-3333-3333-333333333333', m.id, n.id, 28000
  from materias m, niveles_educativos n where m.nombre = 'Química Orgánica' and n.nombre = 'Universitario';
insert into docente_materias (docente_id, materia_id, nivel_id, tarifa_hora)
select '44444444-4444-4444-4444-444444444444', m.id, n.id, 30000
  from materias m, niveles_educativos n where m.nombre = 'Biología Celular' and n.nombre = 'Universitario';
insert into docente_materias (docente_id, materia_id, nivel_id, tarifa_hora)
select '55555555-5555-5555-5555-555555555555', m.id, n.id, 22000
  from materias m, niveles_educativos n where m.nombre = 'Programación en Python' and n.nombre in ('Bachillerato', 'Universitario');

-- Disponibilidad semanal del Dr. Carlos (igual a la cuadrícula de la pantalla)
insert into disponibilidad (docente_id, dia_semana, hora_inicio, hora_fin) values
  ('22222222-2222-2222-2222-222222222222', 1, '08:00', '10:00'),
  ('22222222-2222-2222-2222-222222222222', 2, '08:00', '10:00'),
  ('22222222-2222-2222-2222-222222222222', 4, '08:00', '10:00'),
  ('22222222-2222-2222-2222-222222222222', 3, '10:00', '12:00'),
  ('22222222-2222-2222-2222-222222222222', 5, '10:00', '12:00'),
  ('22222222-2222-2222-2222-222222222222', 1, '14:00', '16:00'),
  ('22222222-2222-2222-2222-222222222222', 2, '14:00', '16:00'),
  ('22222222-2222-2222-2222-222222222222', 3, '14:00', '16:00'),
  ('22222222-2222-2222-2222-222222222222', 4, '16:00', '18:00'),
  ('22222222-2222-2222-2222-222222222222', 5, '16:00', '18:00'),
  ('22222222-2222-2222-2222-222222222222', 6, '18:00', '20:00');

-- Una tutoría ya completada con su reseña, y dos próximas
insert into tutorias (estudiante_id, docente_id, materia_id, inicio, fin, modalidad, tarifa_hora, estado, meet_url)
select '11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', id,
       now() - interval '7 days', now() - interval '7 days' + interval '1 hour', 'virtual', 25000, 'completada',
       'https://meet.google.com/abc-defg-hij'
  from materias where nombre = 'Álgebra Lineal';

insert into resenas (tutoria_id, estudiante_id, docente_id, estrellas, comentario)
select id, estudiante_id, docente_id, 5, 'Explica muy claro, recomendado.'
  from tutorias where estado = 'completada' limit 1;

insert into tutorias (estudiante_id, docente_id, materia_id, inicio, fin, modalidad, lugar, tarifa_hora, estado)
select '11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', id,
       date_trunc('day', now()) + interval '1 day 16 hours', date_trunc('day', now()) + interval '1 day 17 hours',
       'presencial', 'Biblioteca central', 25000, 'confirmada'
  from materias where nombre = 'Cálculo Multivariable';

insert into tutorias (estudiante_id, docente_id, materia_id, inicio, fin, modalidad, tarifa_hora, estado, meet_url)
select '11111111-1111-1111-1111-111111111111', '33333333-3333-3333-3333-333333333333', id,
       date_trunc('day', now()) + interval '2 days 10 hours', date_trunc('day', now()) + interval '2 days 11 hours',
       'virtual', 28000, 'confirmada', 'https://meet.google.com/xyz-abcd-efg'
  from materias where nombre = 'Química Orgánica';

-- Chat entre María y el Dr. Carlos
insert into conversaciones (estudiante_id, docente_id)
values ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222');

insert into mensajes (conversacion_id, remitente_id, contenido)
select c.id, x.remitente::uuid, x.contenido
  from conversaciones c,
       (values ('22222222-2222-2222-2222-222222222222', 'Hola María, tengo listo el material de Cálculo para hoy.'),
               ('11111111-1111-1111-1111-111111111111', '¡Súper! Justo estoy revisando los ejercicios difíciles.'),
               ('22222222-2222-2222-2222-222222222222', 'Perfecto, nos vemos en 15 minutos en el aula virtual.')) as x(remitente, contenido)
 where c.estudiante_id = '11111111-1111-1111-1111-111111111111';

-- Solicitud en tiempo real con dos ofertas (funcionalidad opcional)
insert into solicitudes_tiempo_real (estudiante_id, materia_id, tema, tarifa_sugerida, modalidad)
select '11111111-1111-1111-1111-111111111111', id, 'Ejercicios de electromagnetismo', 20000, 'virtual'
  from materias where nombre = 'Electromagnetismo';

insert into ofertas (solicitud_id, docente_id, tarifa_ofertada, minutos_llegada)
select s.id, x.docente::uuid, x.tarifa, x.minutos
  from solicitudes_tiempo_real s,
       (values ('55555555-5555-5555-5555-555555555555', 20000, 2),
               ('22222222-2222-2222-2222-222222222222', 25000, 4)) as x(docente, tarifa, minutos);
