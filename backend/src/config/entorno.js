/**
 * Configuración leída de las variables de entorno.
 * En Netlify se definen en: Site configuration > Environment variables.
 * En local se pueden poner en un archivo .env (ver .env.ejemplo).
 */
function leerEntorno(env = process.env) {
  return {
    databaseUrl: env.DATABASE_URL,
    dbSsl: env.DB_SSL !== 'false',
    supabaseUrl: env.SUPABASE_URL,
    supabaseAnonKey: env.SUPABASE_ANON_KEY,
    supabaseJwtSecret: env.SUPABASE_JWT_SECRET || null,
    googleClientId: env.GOOGLE_CLIENT_ID || null,
    googleClientSecret: env.GOOGLE_CLIENT_SECRET || null,
    resendApiKey: env.RESEND_API_KEY || null,
    correoRemitente: env.CORREO_REMITENTE || 'TutoresOn-Line <onboarding@resend.dev>',
    urlAplicacion: env.URL_APLICACION || env.URL || 'http://localhost:8888',
    zonaHoraria: env.ZONA_HORARIA || 'America/Bogota',
  };
}

module.exports = { leerEntorno };
