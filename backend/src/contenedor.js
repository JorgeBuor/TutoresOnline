/**
 * Raíz de composición: el único lugar donde se crean las piezas y se conectan entre sí.
 * Los servicios reciben sus dependencias por el constructor (inyección de dependencias),
 * así se pueden probar con piezas falsas y cambiar proveedores sin tocar el negocio.
 */
const { leerEntorno } = require('./config/entorno');
const { crearConexion } = require('./db/conexion');
const { crearVerificadorToken } = require('./middlewares/autenticacion');

const { PerfilRepositorio } = require('./repositories/perfilRepositorio');
const { CatalogoRepositorio } = require('./repositories/catalogoRepositorio');
const { DocenteRepositorio } = require('./repositories/docenteRepositorio');
const { TutorRepositorio } = require('./repositories/tutorRepositorio');
const { TutoriaRepositorio } = require('./repositories/tutoriaRepositorio');
const { ChatRepositorio } = require('./repositories/chatRepositorio');
const { TiempoRealRepositorio } = require('./repositories/tiempoRealRepositorio');
const { IntegracionRepositorio } = require('./repositories/integracionRepositorio');

const { CorreoResend, CorreoDesactivado } = require('./integraciones/correo');
const { CalendarioGoogle, CalendarioDesactivado } = require('./integraciones/calendario');

const { CatalogoServicio } = require('./services/catalogoServicio');
const { PerfilServicio } = require('./services/perfilServicio');
const { DocenteServicio } = require('./services/docenteServicio');
const { TutorServicio } = require('./services/tutorServicio');
const { NotificacionServicio } = require('./services/notificacionServicio');
const { TutoriaServicio } = require('./services/tutoriaServicio');
const { ChatServicio } = require('./services/chatServicio');
const { TiempoRealServicio } = require('./services/tiempoRealServicio');

function crearContenedor(entorno = leerEntorno(), sobrescribir = {}) {
  const db = sobrescribir.db || crearConexion(entorno);
  const zonaHoraria = entorno.zonaHoraria;

  const repos = {
    perfilRepositorio: new PerfilRepositorio(db),
    catalogoRepositorio: new CatalogoRepositorio(db),
    docenteRepositorio: new DocenteRepositorio(db),
    tutorRepositorio: new TutorRepositorio(db),
    tutoriaRepositorio: new TutoriaRepositorio(db),
    chatRepositorio: new ChatRepositorio(db),
    tiempoRealRepositorio: new TiempoRealRepositorio(db),
    integracionRepositorio: new IntegracionRepositorio(db),
  };

  const correo = sobrescribir.correo
    || (entorno.resendApiKey ? new CorreoResend({ apiKey: entorno.resendApiKey, remitente: entorno.correoRemitente }) : new CorreoDesactivado());

  const calendario = sobrescribir.calendario
    || (entorno.googleClientId && entorno.googleClientSecret
      ? new CalendarioGoogle({
        clientId: entorno.googleClientId,
        clientSecret: entorno.googleClientSecret,
        integracionRepositorio: repos.integracionRepositorio,
        zonaHoraria,
      })
      : new CalendarioDesactivado());

  const notificaciones = new NotificacionServicio({
    integracionRepositorio: repos.integracionRepositorio, correo, urlAplicacion: entorno.urlAplicacion, zonaHoraria,
  });
  const tutorias = new TutoriaServicio({ ...repos, notificaciones, calendario, zonaHoraria });

  const servicios = {
    configuracionPublica: {
      supabaseUrl: entorno.supabaseUrl || null,
      supabaseAnonKey: entorno.supabaseAnonKey || null,
      googleCalendar: calendario instanceof CalendarioGoogle,
    },
    catalogo: new CatalogoServicio(repos),
    perfil: new PerfilServicio({ db, ...repos }),
    docente: new DocenteServicio({ db, ...repos }),
    tutores: new TutorServicio({ ...repos, zonaHoraria }),
    tutorias,
    chat: new ChatServicio(repos),
    tiempoReal: new TiempoRealServicio({ db, ...repos, tutoriaServicio: tutorias, notificaciones }),
  };

  const verificarToken = sobrescribir.verificarToken || crearVerificadorToken(entorno);

  return { db, repos, servicios, verificarToken };
}

module.exports = { crearContenedor };
