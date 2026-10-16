-- =====================================================================
-- TutoresOn-Line · Datos iniciales (catálogos)
-- Ejecutar después de schema.sql
-- =====================================================================

insert into niveles_educativos (nombre) values
  ('Primaria'), ('Bachillerato'), ('Preuniversitario'), ('Universitario'), ('Posgrado');

insert into materias (nombre, area) values
  ('Matemáticas',            'Matemáticas'),
  ('Álgebra Lineal',         'Matemáticas'),
  ('Cálculo Diferencial',    'Matemáticas'),
  ('Cálculo Multivariable',  'Matemáticas'),
  ('Estadística',            'Matemáticas'),
  ('Física Mecánica',        'Ciencias'),
  ('Física Cuántica',        'Ciencias'),
  ('Electromagnetismo',      'Ciencias'),
  ('Química Orgánica',       'Ciencias'),
  ('Biología Celular',       'Ciencias'),
  ('Programación en Python', 'Programación'),
  ('Desarrollo Web',         'Programación'),
  ('Inglés',                 'Idiomas'),
  ('Lectura Crítica',        'Humanidades');
