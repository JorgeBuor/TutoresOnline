const { createRemoteJWKSet, decodeProtectedHeader, jwtVerify } = require('jose');
const { noAutenticado, prohibido } = require('../utils/errores');

/**
 * Verifica el token de sesión que entrega Supabase Auth al iniciar sesión
 * (con correo o con Google). La API no guarda contraseñas: confía en la firma del token.
 *
 * Supabase firma de dos formas según la antigüedad del proyecto:
 *  - Llaves asimétricas (ES256/RS256): se validan con las llaves públicas del proyecto (JWKS).
 *  - Secreto compartido (HS256, proyectos antiguos): se valida con SUPABASE_JWT_SECRET.
 * Se elige automáticamente según el algoritmo que traiga el token.
 */
function crearVerificadorToken({ supabaseUrl, supabaseJwtSecret }) {
  const opciones = { audience: 'authenticated' };
  const secreto = supabaseJwtSecret ? new TextEncoder().encode(supabaseJwtSecret) : null;
  const llaves = supabaseUrl ? createRemoteJWKSet(new URL(`${supabaseUrl}/auth/v1/.well-known/jwks.json`)) : null;

  return async (token) => {
    const { alg } = decodeProtectedHeader(token);
    if (alg === 'HS256') {
      if (!secreto) throw new Error('El proyecto usa HS256: falta SUPABASE_JWT_SECRET');
      return (await jwtVerify(token, secreto, opciones)).payload;
    }
    if (!llaves) throw new Error('Falta SUPABASE_URL para validar la sesión');
    return (await jwtVerify(token, llaves, opciones)).payload;
  };
}

/** Middleware: exige sesión y deja el perfil del usuario en req.usuario. */
function requiereSesion({ verificarToken, perfilRepositorio }) {
  return async (req, _res, next) => {
    try {
      const encabezado = req.get('authorization') || '';
      const [tipo, token] = encabezado.split(' ');
      if (tipo !== 'Bearer' || !token) throw noAutenticado();

      let datos;
      try {
        datos = await verificarToken(token);
      } catch (error) {
        if (error.message.startsWith('Falta') || error.message.includes('HS256')) console.error(error.message);
        throw noAutenticado('Tu sesión expiró, vuelve a iniciar sesión');
      }

      const perfil = await perfilRepositorio.obtener(datos.sub);
      if (!perfil) throw noAutenticado('Tu cuenta no tiene perfil en TutoresOn-Line');
      req.usuario = perfil;
      next();
    } catch (error) {
      next(error);
    }
  };
}

/** Middleware: exige un rol concreto (estudiante o docente). */
function requiereRol(rol) {
  return (req, _res, next) => {
    if (req.usuario?.rol !== rol) return next(prohibido(`Esta acción es solo para ${rol}s`));
    next();
  };
}

module.exports = { crearVerificadorToken, requiereSesion, requiereRol };
