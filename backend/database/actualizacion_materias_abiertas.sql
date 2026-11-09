-- =====================================================================
-- TutoresOn-Line · Actualización: materias abiertas y avisos al estudiante
-- Solo se ejecuta si la base ya se creó con una versión anterior de schema.sql.
-- Se puede ejecutar más de una vez sin dañar nada.
-- =====================================================================

create or replace function clave_texto(t text) returns text
language sql immutable as $$
  select regexp_replace(translate(lower(trim(t)), 'áéíóúüñàèìòù', 'aeiouunaeiou'), '\s+', ' ', 'g')
$$;

alter table materias add column if not exists creada_por uuid references perfiles (id) on delete set null;
alter table materias add column if not exists creada_en  timestamptz not null default now();
create unique index if not exists materias_clave_unica on materias (clave_texto(nombre));

create table if not exists avisos_materia (
  id             bigserial primary key,
  estudiante_id  uuid    not null references perfiles (id) on delete cascade,
  materia_id     integer references materias (id) on delete cascade,
  texto          text,
  creado_en      timestamptz not null default now(),
  avisado_en     timestamptz,
  check (materia_id is not null or texto is not null)
);
create unique index if not exists avisos_pendiente_materia on avisos_materia (estudiante_id, materia_id)
  where materia_id is not null and avisado_en is null;
create unique index if not exists avisos_pendiente_texto on avisos_materia (estudiante_id, clave_texto(texto))
  where materia_id is null and avisado_en is null;

alter table avisos_materia enable row level security;
drop policy if exists ver_mis_avisos on avisos_materia;
create policy ver_mis_avisos on avisos_materia for select to authenticated using (estudiante_id = auth.uid());
