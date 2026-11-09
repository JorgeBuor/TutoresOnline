-- =====================================================================
-- TutoresOn-Line · Actualización: disponibilidad y tarifa por cada materia
-- Solo se ejecuta si la base ya se creó con una versión anterior de schema.sql.
-- La cuadrícula que cada docente tenía se copia a todas sus materias, para no perder nada.
-- Se puede ejecutar más de una vez sin dañar nada.
-- =====================================================================

alter table disponibilidad add column if not exists materia_id integer;
alter table disponibilidad add column if not exists nivel_id smallint;

-- La regla vieja (un solo horario por docente) impediría copiar la cuadrícula a cada materia
alter table disponibilidad drop constraint if exists disponibilidad_docente_id_dia_semana_hora_inicio_key;

-- Copiar la cuadrícula general a cada materia y nivel del docente
insert into disponibilidad (docente_id, materia_id, nivel_id, dia_semana, hora_inicio, hora_fin)
select d.docente_id, dm.materia_id, dm.nivel_id, d.dia_semana, d.hora_inicio, d.hora_fin
  from disponibilidad d
  join docente_materias dm on dm.docente_id = d.docente_id
 where d.materia_id is null;
delete from disponibilidad where materia_id is null;

alter table disponibilidad alter column materia_id set not null;
alter table disponibilidad alter column nivel_id set not null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'disponibilidad_por_materia') then
    alter table disponibilidad add constraint disponibilidad_por_materia
      unique (docente_id, materia_id, nivel_id, dia_semana, hora_inicio);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'disponibilidad_materia_fk') then
    alter table disponibilidad add constraint disponibilidad_materia_fk foreign key (docente_id, materia_id, nivel_id)
      references docente_materias (docente_id, materia_id, nivel_id) on delete cascade;
  end if;
end $$;

drop index if exists idx_disponibilidad_docente;
create index idx_disponibilidad_docente on disponibilidad (docente_id, materia_id, dia_semana);
