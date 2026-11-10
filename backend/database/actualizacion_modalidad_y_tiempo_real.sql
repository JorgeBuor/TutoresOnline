-- =====================================================================
-- TutoresOn-Line · Actualización: horas virtuales y presenciales, y una sola solicitud
-- en tiempo real abierta por estudiante.
-- Solo se ejecuta si la base ya se creó con una versión anterior de schema.sql.
-- Se puede ejecutar más de una vez sin dañar nada.
-- =====================================================================

-- 1. Cada bloque de la cuadrícula dice si es de horas virtuales o solo presenciales.
--    Lo que ya estaba marcado queda como horas virtuales (sirven para ambas modalidades),
--    salvo en docentes que solo dan clases presenciales.
alter table disponibilidad add column if not exists modalidad modalidad_clase not null default 'virtual';
update disponibilidad d set modalidad = 'presencial'
  from docentes doc
 where doc.id = d.docente_id and not doc.ofrece_virtual and d.modalidad = 'virtual';

-- 2. Si un estudiante tiene varias solicitudes abiertas, se deja solo la más reciente.
update solicitudes_tiempo_real s set estado = 'cancelada'
 where s.estado = 'abierta'
   and exists (select 1 from solicitudes_tiempo_real r
                where r.estudiante_id = s.estudiante_id and r.estado = 'abierta' and r.id > s.id);
create unique index if not exists una_solicitud_abierta
  on solicitudes_tiempo_real (estudiante_id) where estado = 'abierta';
