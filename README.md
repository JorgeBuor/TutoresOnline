# TutoresOn-Line

Plataforma de tutorías en línea y presenciales que conecta estudiantes con tutores. Proyecto final de **Desarrollo Web**, grupo **24230**.

**Integrante:** Jorge Estiven Burgos Ortega
**Product Owner:** Prof. Edgar Morillo

## Enlaces

* **Repositorio:** https://github.com/JorgeBuor/TutoresOnline
* **Aplicación publicada:** https://tutoresonlinejorgeburgos.netlify.app/

## Arquitectura

```
Navegador (web y móvil)
   │  pantallas HTML + CSS + JavaScript   ── frontend/
   │
   ├─► Supabase Auth  (inicio de sesión con correo o con Google)
   │
   └─► API REST propia en Netlify Functions ── backend/ + netlify/functions/
          │  Express, capas SOLID
          ├─► PostgreSQL en Supabase   (base de datos)
          ├─► Google Calendar API      (evento + enlace de Google Meet)
          └─► Resend                   (correos de aviso)
```

* **Pantallas y API viven en el mismo sitio de Netlify**: las direcciones `/api/...` las atiende la función `netlify/functions/api.js`; todo lo demás son las pantallas de `frontend/`.
* **Supabase** guarda los datos y maneja el inicio de sesión. La API nunca ve contraseñas: valida la firma del token de sesión que entrega Supabase.
* **Google Calendar y Meet**: cuando el docente acepta una clase, la API crea el evento en su calendario, invita al estudiante y Google genera el enlace de Meet.

## Organización del backend (principios SOLID)

```
backend/src/
├── routes/          Qué direcciones existen y qué verbo HTTP usa cada una
├── controllers/     Reciben la petición HTTP y devuelven JSON (sin reglas de negocio)
├── services/        Reglas de negocio: reservar, aceptar, calificar, chat, tiempo real
├── repositories/    Consultas SQL: lo único que habla con la base de datos
├── integraciones/   Google Calendar y correo, intercambiables
├── middlewares/     Verificación de sesión, permisos por rol y manejo de errores
├── config/ db/ utils/
├── contenedor.js    Arma todas las piezas e inyecta sus dependencias
└── app.js           Crea la aplicación Express
```

* **Responsabilidad única:** cada capa hace una sola cosa; por ejemplo, los repositorios no conocen HTTP y los controladores no conocen SQL.
* **Abierto/cerrado:** los cambios de estado de una tutoría están en una tabla de reglas (`TRANSICIONES` en `tutoriaServicio.js`); un estado nuevo se agrega sin modificar el resto.
* **Sustitución de Liskov:** `CalendarioGoogle` y `CalendarioDesactivado` (igual que `CorreoResend` y `CorreoDesactivado`) se pueden usar uno en lugar del otro.
* **Segregación de interfaces:** cada servicio recibe solo los repositorios que usa.
* **Inversión de dependencias:** los servicios reciben sus dependencias por el constructor desde `contenedor.js`; por eso las pruebas usan un calendario y un correo falsos.

## API REST

Todas las rutas empiezan por `/api`. Las marcadas con 🔒 exigen sesión (`Authorization: Bearer <token de Supabase>`).

| Método | Ruta | Para qué sirve | Rol |
|---|---|---|---|
| GET | `/salud` | Comprobar que la API responde | Público |
| GET | `/configuracion` | Datos públicos para conectar el navegador con Supabase | Público |
| GET | `/catalogos` | Materias (con cuántos tutores tiene cada una), áreas, niveles educativos y ciudades | Público |
| GET | `/yo` | Perfil del usuario actual 🔒 | Ambos |
| PATCH | `/yo` | Actualizar nombre, teléfono o ciudad 🔒 | Ambos |
| POST | `/yo/rol` | Elegir rol la primera vez que se entra con Google 🔒 | Ambos |
| PUT / DELETE | `/yo/google` | Conectar o desconectar Google Calendar 🔒 | Docente |
| GET | `/tutores` | Buscar por materia, nivel, modalidad, ciudad y fecha 🔒 | Ambos |
| GET | `/tutores/:id` | Perfil del tutor, reseñas y horarios libres 🔒 | Ambos |
| POST | `/materias` | Crea una materia que no estaba en el catálogo (sin duplicados aunque cambien tildes o mayúsculas) 🔒 | Docente |
| GET / POST | `/avisos-materia` | Pedir que avisen por correo cuando haya un tutor de una materia 🔒 | Estudiante |
| GET / PUT | `/docente/configuracion` | Materias, tarifa, modalidades y disponibilidad semanal 🔒 | Docente |
| GET | `/tutorias?vista=` | Mis clases: `proximas`, `pendientes`, `virtuales`, `historial` 🔒 | Ambos |
| POST | `/tutorias` | Reservar una clase (queda por aceptar) 🔒 | Estudiante |
| PATCH | `/tutorias/:id` | Cambiar estado: `confirmada`, `rechazada`, `cancelada`, `completada` 🔒 | Según regla |
| POST | `/tutorias/:id/resena` | Calificar de 1 a 5 estrellas 🔒 | Estudiante |
| GET / POST | `/conversaciones` | Listar o abrir conversaciones 🔒 | Ambos |
| GET / POST | `/conversaciones/:id/mensajes` | Leer o enviar mensajes 🔒 | Ambos |
| GET / POST | `/solicitudes` | Tiempo real: ver o publicar solicitudes 🔒 | Ambos / Estudiante |
| GET / PATCH | `/solicitudes/:id` | Ver ofertas o cancelar la solicitud 🔒 | Ambos / Estudiante |
| POST | `/solicitudes/:id/ofertas` | Ofertar una tarifa 🔒 | Docente |
| PATCH | `/ofertas/:id` | Aceptar una oferta (crea la clase) o retirarla 🔒 | Según regla |

Los errores siempre responden con el mismo formato: `{ "error": { "codigo": "...", "mensaje": "..." } }`.

## Reglas de negocio implementadas

* **Registro con rol:** al registrarse se elige estudiante o docente; quien entra con Google lo elige una sola vez.
* **Búsqueda en pasos:** el estudiante elige materia y nivel, luego el día y, si quiere, la modalidad y la ciudad; solo aparecen los tutores con horarios libres ese día. Si nadie tiene, se sugiere el próximo día disponible (hasta dos semanas).
* **Disponibilidad:** la cuadrícula semanal del docente se repite todas las semanas; si conectó Google Calendar, sus otros compromisos esconden esos horarios y no se pueden reservar (la app solo ve "ocupado", nunca el detalle de los eventos).
* **Catálogo abierto:** si un docente no encuentra su materia, la crea con su área desde la aplicación; la base reconoce la misma materia aunque se escriba con o sin tildes o mayúsculas.
* **Materias sin tutores:** el estudiante ve cuántos tutores tiene cada materia; si no hay ninguno, puede pedir que le avisen por correo, incluso escribiendo una materia que aún no existe. El aviso se envía una sola vez, cuando un docente publica esa materia con horarios.
* **Reserva:** solo dentro de la disponibilidad semanal del docente, en el futuro y sin cruzarse con otra clase.
* **Aceptar o rechazar:** la reserva queda pendiente hasta que el docente la acepta o la rechaza.
* **Videoconferencia:** al aceptar, se crea el evento en Google Calendar con el enlace de Meet.
* **Avisos por correo:** nueva solicitud, clase confirmada, rechazada o cancelada.
* **Reputación:** solo se califica una clase completada, una vez, y el promedio del docente se recalcula solo.
* **Tiempo real (opcional, estilo InDrive):** el estudiante publica tema y precio, los docentes ofertan y al aceptar una oferta se crea la clase y se cierran las demás.
* **Seguridad:** cada usuario solo ve sus clases, conversaciones y solicitudes; la base además tiene seguridad por filas.

## Estructura del repositorio

```
frontend/                 Pantallas (lo que publica Netlify)
├── index.html, registro.html
├── estudiante/  docente/  compartidas/
├── css/styles.css        Estilos responsive (web y móvil)
└── js/
    ├── app.js            Sesión, llamadas a la API y utilidades compartidas
    ├── rol.js            Menú correcto en las pantallas compartidas
    └── paginas/          Un archivo por pantalla
backend/
├── src/                  API (ver organización arriba)
├── tests/                Pruebas automáticas de la API
├── database/             schema.sql, seed.sql, seed_demo.sql, actualizacion_materias_abiertas.sql y diagrama
└── server.js             Servidor para correr todo en local
netlify/functions/api.js  Punto de entrada de la API en Netlify
netlify.toml              Configuración de publicación
```

## Cómo correrlo en el computador

1. Instalar [Node.js](https://nodejs.org) 18 o superior.
2. Copiar `.env.ejemplo` como `.env` y llenar las variables de Supabase.
3. Ejecutar `npm install` y luego `npm run dev`.
4. Abrir `http://localhost:8888`.

## Pruebas automáticas

`npm test` corre 10 pruebas de punta a punta contra una base PostgreSQL con el esquema cargado (variable `TEST_DATABASE_URL`). Cubren: búsqueda, reservas y cruces de horario, aceptar y rechazar, cancelar, completar y calificar, chat privado, tiempo real y elección de rol.

## Usuarios de demostración

Si se carga `backend/database/seed_demo.sql`, quedan estos usuarios con la contraseña `Demo1234*`, que usan los botones "Entrar como estudiante" y "Entrar como docente" del login:

* Estudiante: `maria.restrepo@tutores.com`
* Docente: `carlos.fuentes@tutores.com`

## Tecnologías

* **Pantallas:** HTML5, CSS3 (Grid, Flexbox, media queries) y JavaScript en módulos.
* **API:** Node.js, Express, `pg` y `jose`, publicada en Netlify Functions.
* **Datos y sesión:** PostgreSQL y Auth de Supabase.
* **Integraciones:** Google Calendar API (Meet) y Resend (correo).
