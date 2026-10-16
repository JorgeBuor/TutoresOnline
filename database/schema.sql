-- =====================================================================
-- TutoresOn-Line · Esquema de base de datos relacional (PostgreSQL / Supabase)
-- Autor: Jorge Estiven Burgos Ortega · Desarrollo Web · Grupo 24230
--
-- Cómo usarlo: Supabase > SQL Editor > pegar todo este archivo > Run.
-- La autenticación (correo/contraseña y Google) la maneja Supabase Auth
-- en la tabla auth.users; aquí se guarda el perfil y todo el negocio.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Tipos enumerados
-- ---------------------------------------------------------------------
create type rol_usuario        as enum ('estudiante', 'docente');
create type modalidad_clase    as enum ('virtual', 'presencial');
create type estado_tutoria     as enum ('pendiente', 'confirmada', 'cancelada', 'completada');
create type origen_tutoria     as enum ('agenda', 'tiempo_real');
create type estado_solicitud   as enum ('abierta', 'asignada', 'cancelada', 'expirada');
create type estado_oferta      as enum ('enviada', 'aceptada', 'rechazada', 'retirada');
create type canal_notificacion as enum ('email', 'sms', 'whatsapp');
create type estado_notificacion as enum ('pendiente', 'enviada', 'fallida');

-- ---------------------------------------------------------------------
-- 2. Usuarios y perfiles
-- ---------------------------------------------------------------------
-- Un perfil por cada usuario de Supabase Auth. El rol se fija al registrarse.
create table perfiles (
  id               uuid primary key references auth.users (id) on delete cascade,
  rol              rol_usuario  not null,
  nombre_completo  text         not null check (length(trim(nombre_completo)) > 2),
  email            text         not null unique,
  telefono         text,
  ciudad           text,
  foto_url         text,
  creado_en        timestamptz  not null default now(),
  actualizado_en   timestamptz  not null default now()
);

-- Datos que solo aplican al docente (relación 1 a 1 con perfiles).
create table docentes (
  id                    uuid primary key references perfiles (id) on delete cascade,
  biografia             text,
  ofrece_virtual        boolean      not null default true,
  ofrece_presencial     boolean      not null default false,
  zona_presencial       text,                                   -- barrio o zona para clases presenciales
  calificacion_promedio numeric(2,1) not null default 0 check (calificacion_promedio between 0 and 5),
  total_resenas         integer      not null default 0,
  google_conectado      boolean      not null default false,   -- indicador "Google Calendar conectado"
  check (ofrece_virtual or ofrece_presencial)
);

-- Tokens de Google (OAuth2). Solo los lee el backend con la service role:
-- RLS activado y sin políticas = ningún usuario puede leerlos desde el navegador.
create table integraciones_google (
  usuario_id     uuid primary key references perfiles (id) on delete cascade,
  refresh_token  text        not null,
  alcance        text        not null default 'https://www.googleapis.com/auth/calendar.events',
  conectado_en   timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 3. Materias y oferta del docente
-- ---------------------------------------------------------------------
create table niveles_educativos (
  id      smallserial primary key,
  nombre  text not null unique                 -- Primaria, Bachillerato, Universitario...
);

create table materias (
  id      serial primary key,
  nombre  text not null unique,
  area    text not null                         -- Matemáticas, Ciencias, Idiomas, Programación...
);

-- Qué materias enseña cada docente, en qué nivel y a qué tarifa.
create table docente_materias (
  docente_id   uuid     not null references docentes (id) on delete cascade,
  materia_id   integer  not null references materias (id),
  nivel_id     smallint not null references niveles_educativos (id),
  tarifa_hora  numeric(10,2) not null check (tarifa_hora > 0),   -- pesos colombianos
  primary key (docente_id, materia_id, nivel_id)
);

-- Cuadrícula semanal de disponibilidad (pantalla "Disponibilidad").
create table disponibilidad (
  id           bigserial primary key,
  docente_id   uuid     not null references docentes (id) on delete cascade,
  dia_semana   smallint not null check (dia_semana between 0 and 6),   -- 0 = domingo
  hora_inicio  time     not null,
  hora_fin     time     not null,
  check (hora_fin > hora_inicio),
  unique (docente_id, dia_semana, hora_inicio)
);

-- ---------------------------------------------------------------------
-- 4. Reserva en tiempo real (funcionalidad opcional, estilo InDrive)
-- ---------------------------------------------------------------------
create table solicitudes_tiempo_real (
  id               bigserial primary key,
  estudiante_id    uuid            not null references perfiles (id) on delete cascade,
  materia_id       integer         references materias (id),
  tema             text            not null,
  descripcion      text,
  tarifa_sugerida  numeric(10,2)   not null check (tarifa_sugerida > 0),
  duracion_min     smallint        not null default 60 check (duracion_min between 30 and 240),
  modalidad        modalidad_clase not null default 'virtual',
  ciudad           text,
  estado           estado_solicitud not null default 'abierta',
  creada_en        timestamptz     not null default now(),
  expira_en        timestamptz     not null default now() + interval '30 minutes'
);

create table ofertas (
  id               bigserial primary key,
  solicitud_id     bigint        not null references solicitudes_tiempo_real (id) on delete cascade,
  docente_id       uuid          not null references docentes (id) on delete cascade,
  tarifa_ofertada  numeric(10,2) not null check (tarifa_ofertada > 0),
  minutos_llegada  smallint,                                   -- "Responde en: 2 min"
  estado           estado_oferta not null default 'enviada',
  creada_en        timestamptz   not null default now(),
  unique (solicitud_id, docente_id)                           -- una oferta por docente
);

-- ---------------------------------------------------------------------
-- 5. Tutorías (clases agendadas, vengan de la agenda o del tiempo real)
-- ---------------------------------------------------------------------
create table tutorias (
  id               bigserial primary key,
  estudiante_id    uuid            not null references perfiles (id),
  docente_id       uuid            not null references docentes (id),
  materia_id       integer         not null references materias (id),
  inicio           timestamptz     not null,
  fin              timestamptz     not null,
  modalidad        modalidad_clase not null,
  lugar            text,                                       -- solo si es presencial
  tarifa_hora      numeric(10,2)   not null check (tarifa_hora > 0),
  estado           estado_tutoria  not null default 'pendiente',
  origen           origen_tutoria  not null default 'agenda',
  solicitud_id     bigint          references solicitudes_tiempo_real (id),
  meet_url         text,                                       -- enlace generado por Google Calendar API
  google_event_id  text,
  creada_en        timestamptz     not null default now(),
  check (fin > inicio),
  check (estudiante_id <> docente_id),
  check (modalidad = 'virtual' or lugar is not null),
  check (origen = 'agenda' or solicitud_id is not null)
);

-- Un docente no puede tener dos clases activas que se crucen en el tiempo.
create extension if not exists btree_gist;
alter table tutorias add constraint tutorias_sin_cruce_docente
  exclude using gist (
    docente_id with =,
    tstzrange(inicio, fin) with &&
  ) where (estado in ('pendiente', 'confirmada'));

-- ---------------------------------------------------------------------
-- 6. Reputación (estrellas, estilo MercadoLibre)
-- ---------------------------------------------------------------------
create table resenas (
  id             bigserial primary key,
  tutoria_id     bigint   not null unique references tutorias (id) on delete cascade,
  estudiante_id  uuid     not null references perfiles (id),
  docente_id     uuid     not null references docentes (id),
  estrellas      smallint not null check (estrellas between 1 and 5),
  comentario     text,
  creada_en      timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 7. Chat
-- ---------------------------------------------------------------------
create table conversaciones (
  id             bigserial primary key,
  estudiante_id  uuid not null references perfiles (id) on delete cascade,
  docente_id     uuid not null references docentes (id) on delete cascade,
  creada_en      timestamptz not null default now(),
  unique (estudiante_id, docente_id)
);

create table mensajes (
  id               bigserial primary key,
  conversacion_id  bigint not null references conversaciones (id) on delete cascade,
  remitente_id     uuid   not null references perfiles (id),
  contenido        text   not null check (length(contenido) between 1 and 2000),
  adjunto_url      text,
  leido            boolean not null default false,
  enviado_en       timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 8. Notificaciones (correo / SMS / WhatsApp con el registro de la tutoría)
-- ---------------------------------------------------------------------
create table notificaciones (
  id           bigserial primary key,
  usuario_id   uuid   not null references perfiles (id) on delete cascade,
  tutoria_id   bigint references tutorias (id) on delete cascade,
  canal        canal_notificacion  not null,
  asunto       text   not null,
  estado       estado_notificacion not null default 'pendiente',
  creada_en    timestamptz not null default now(),
  enviada_en   timestamptz
);

-- ---------------------------------------------------------------------
-- 9. Índices para las búsquedas más frecuentes
-- ---------------------------------------------------------------------
create index idx_docente_materias_materia on docente_materias (materia_id, nivel_id);
create index idx_disponibilidad_docente   on disponibilidad (docente_id, dia_semana);
create index idx_tutorias_estudiante      on tutorias (estudiante_id, inicio);
create index idx_tutorias_docente         on tutorias (docente_id, inicio);
create index idx_solicitudes_abiertas     on solicitudes_tiempo_real (estado, creada_en) where estado = 'abierta';
create index idx_mensajes_conversacion    on mensajes (conversacion_id, enviado_en);
create index idx_perfiles_ciudad          on perfiles (ciudad);

-- ---------------------------------------------------------------------
-- 10. Funciones y triggers de reglas de negocio
-- ---------------------------------------------------------------------

-- 10.1 Crear el perfil automáticamente cuando alguien se registra
-- (correo/contraseña o Google). El rol llega en los metadatos del registro.
create or replace function crear_perfil_nuevo_usuario()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_rol rol_usuario := coalesce((new.raw_user_meta_data ->> 'rol')::rol_usuario, 'estudiante');
begin
  insert into perfiles (id, rol, nombre_completo, email, foto_url)
  values (
    new.id,
    v_rol,
    coalesce(new.raw_user_meta_data ->> 'nombre_completo',
             new.raw_user_meta_data ->> 'full_name',
             split_part(new.email, '@', 1)),
    new.email,
    new.raw_user_meta_data ->> 'avatar_url'
  );
  if v_rol = 'docente' then
    insert into docentes (id) values (new.id);
  end if;
  return new;
end $$;

create trigger trg_nuevo_usuario
  after insert on auth.users
  for each row execute function crear_perfil_nuevo_usuario();

-- 10.2 Recalcular la reputación del docente con cada reseña.
create or replace function actualizar_reputacion_docente()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_docente uuid := coalesce(new.docente_id, old.docente_id);
begin
  update docentes d
     set calificacion_promedio = coalesce((select round(avg(estrellas)::numeric, 1) from resenas where docente_id = v_docente), 0),
         total_resenas         = (select count(*) from resenas where docente_id = v_docente)
   where d.id = v_docente;
  return null;
end $$;

create trigger trg_reputacion
  after insert or update or delete on resenas
  for each row execute function actualizar_reputacion_docente();

-- 10.3 Solo se puede reseñar una tutoría completada, y la reseña es del estudiante de esa tutoría.
create or replace function validar_resena()
returns trigger language plpgsql as $$
declare t tutorias;
begin
  select * into t from tutorias where id = new.tutoria_id;
  if t.estado <> 'completada' then
    raise exception 'Solo se pueden calificar tutorías completadas';
  end if;
  if t.estudiante_id <> new.estudiante_id or t.docente_id <> new.docente_id then
    raise exception 'La reseña no corresponde a esa tutoría';
  end if;
  return new;
end $$;

create trigger trg_validar_resena
  before insert on resenas
  for each row execute function validar_resena();

-- 10.4 Aceptar una oferta de tiempo real: crea la tutoría, asigna la solicitud
-- y rechaza las demás ofertas, todo en una sola operación.
create or replace function aceptar_oferta(p_oferta_id bigint)
returns bigint language plpgsql security definer set search_path = public as $$
declare
  o ofertas;
  s solicitudes_tiempo_real;
  v_tutoria bigint;
begin
  select * into o from ofertas where id = p_oferta_id for update;
  select * into s from solicitudes_tiempo_real where id = o.solicitud_id for update;

  if s.estudiante_id <> auth.uid() then
    raise exception 'Solo el estudiante que publicó la solicitud puede aceptar ofertas';
  end if;
  if s.estado <> 'abierta' or o.estado <> 'enviada' then
    raise exception 'La solicitud u oferta ya no está disponible';
  end if;

  insert into tutorias (estudiante_id, docente_id, materia_id, inicio, fin, modalidad, lugar,
                        tarifa_hora, estado, origen, solicitud_id)
  values (s.estudiante_id, o.docente_id, s.materia_id,
          now() + make_interval(mins => coalesce(o.minutos_llegada, 5)),
          now() + make_interval(mins => coalesce(o.minutos_llegada, 5) + s.duracion_min),
          s.modalidad, s.ciudad, o.tarifa_ofertada, 'confirmada', 'tiempo_real', s.id)
  returning id into v_tutoria;

  update ofertas set estado = case when id = o.id then 'aceptada'::estado_oferta else 'rechazada'::estado_oferta end
   where solicitud_id = s.id and estado = 'enviada';
  update solicitudes_tiempo_real set estado = 'asignada' where id = s.id;

  return v_tutoria;
end $$;

-- 10.5 Mantener actualizado el campo actualizado_en de perfiles.
create or replace function tocar_actualizado_en()
returns trigger language plpgsql as $$
begin new.actualizado_en := now(); return new; end $$;

create trigger trg_perfiles_actualizado
  before update on perfiles
  for each row execute function tocar_actualizado_en();

-- ---------------------------------------------------------------------
-- 11. Vistas para las pantallas
-- ---------------------------------------------------------------------

-- Pantalla "Agendar clase": un renglón por docente + materia + nivel con su tarifa.
create or replace view vista_busqueda_tutores with (security_invoker = true) as
select d.id                  as docente_id,
       p.nombre_completo,
       p.foto_url,
       p.ciudad,
       m.id                  as materia_id,
       m.nombre              as materia,
       n.nombre              as nivel,
       dm.tarifa_hora,
       d.ofrece_virtual,
       d.ofrece_presencial,
       d.zona_presencial,
       d.calificacion_promedio,
       d.total_resenas
  from docentes d
  join perfiles p          on p.id = d.id
  join docente_materias dm on dm.docente_id = d.id
  join materias m          on m.id = dm.materia_id
  join niveles_educativos n on n.id = dm.nivel_id;

-- Pantallas "Mis clases" / "Mi agenda": tutorías con los nombres ya resueltos.
create or replace view vista_mis_tutorias with (security_invoker = true) as
select t.*,
       m.nombre             as materia,
       pe.nombre_completo   as estudiante,
       pd.nombre_completo   as docente
  from tutorias t
  join materias m  on m.id  = t.materia_id
  join perfiles pe on pe.id = t.estudiante_id
  join perfiles pd on pd.id = t.docente_id;

-- ---------------------------------------------------------------------
-- 12. Seguridad por filas (RLS): cada usuario solo ve y toca lo suyo
-- ---------------------------------------------------------------------
alter table perfiles                enable row level security;
alter table docentes                enable row level security;
alter table integraciones_google    enable row level security;   -- sin políticas: solo backend
alter table niveles_educativos      enable row level security;
alter table materias                enable row level security;
alter table docente_materias        enable row level security;
alter table disponibilidad          enable row level security;
alter table solicitudes_tiempo_real enable row level security;
alter table ofertas                 enable row level security;
alter table tutorias                enable row level security;
alter table resenas                 enable row level security;
alter table conversaciones          enable row level security;
alter table mensajes                enable row level security;
alter table notificaciones          enable row level security;

-- Catálogos y perfiles públicos: cualquier usuario autenticado los puede leer.
create policy leer_perfiles        on perfiles           for select to authenticated using (true);
create policy editar_mi_perfil     on perfiles           for update to authenticated using (id = auth.uid());
create policy leer_docentes        on docentes           for select to authenticated using (true);
create policy editar_mi_docente    on docentes           for update to authenticated using (id = auth.uid());
create policy leer_niveles         on niveles_educativos for select to authenticated using (true);
create policy leer_materias        on materias           for select to authenticated using (true);
create policy leer_docente_mat     on docente_materias   for select to authenticated using (true);
create policy gestionar_mis_mat    on docente_materias   for all    to authenticated using (docente_id = auth.uid()) with check (docente_id = auth.uid());
create policy leer_disponibilidad  on disponibilidad     for select to authenticated using (true);
create policy gestionar_mi_disp    on disponibilidad     for all    to authenticated using (docente_id = auth.uid()) with check (docente_id = auth.uid());
create policy leer_resenas         on resenas            for select to authenticated using (true);
create policy crear_mi_resena      on resenas            for insert to authenticated with check (estudiante_id = auth.uid());

-- Tutorías: las ven y modifican solo sus dos participantes; las crea el estudiante.
create policy ver_mis_tutorias     on tutorias for select to authenticated using (auth.uid() in (estudiante_id, docente_id));
create policy reservar_tutoria     on tutorias for insert to authenticated with check (estudiante_id = auth.uid());
create policy actualizar_tutoria   on tutorias for update to authenticated using (auth.uid() in (estudiante_id, docente_id));

-- Tiempo real: las solicitudes abiertas las ven los docentes; cada estudiante gestiona las suyas.
create policy ver_solicitudes      on solicitudes_tiempo_real for select to authenticated
  using (estudiante_id = auth.uid() or (estado = 'abierta' and exists (select 1 from docentes where id = auth.uid())));
create policy crear_solicitud      on solicitudes_tiempo_real for insert to authenticated with check (estudiante_id = auth.uid());
create policy cancelar_solicitud   on solicitudes_tiempo_real for update to authenticated using (estudiante_id = auth.uid());

create policy ver_ofertas          on ofertas for select to authenticated
  using (docente_id = auth.uid() or exists (select 1 from solicitudes_tiempo_real s where s.id = solicitud_id and s.estudiante_id = auth.uid()));
create policy crear_oferta         on ofertas for insert to authenticated with check (docente_id = auth.uid());
create policy retirar_oferta       on ofertas for update to authenticated using (docente_id = auth.uid());

-- Chat: solo los dos participantes de la conversación.
create policy ver_conversaciones   on conversaciones for select to authenticated using (auth.uid() in (estudiante_id, docente_id));
create policy crear_conversacion   on conversaciones for insert to authenticated with check (auth.uid() in (estudiante_id, docente_id));
create policy ver_mensajes         on mensajes for select to authenticated
  using (exists (select 1 from conversaciones c where c.id = conversacion_id and auth.uid() in (c.estudiante_id, c.docente_id)));
create policy enviar_mensaje       on mensajes for insert to authenticated
  with check (remitente_id = auth.uid() and exists (select 1 from conversaciones c where c.id = conversacion_id and auth.uid() in (c.estudiante_id, c.docente_id)));
create policy marcar_leido         on mensajes for update to authenticated
  using (exists (select 1 from conversaciones c where c.id = conversacion_id and auth.uid() in (c.estudiante_id, c.docente_id)));

-- Notificaciones: cada quien ve las suyas (las crea el backend).
create policy ver_mis_notif        on notificaciones for select to authenticated using (usuario_id = auth.uid());

-- Chat y tiempo real en vivo (Supabase Realtime).
do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table mensajes, solicitudes_tiempo_real, ofertas;
  end if;
end $$;
