const express = require('express');
const { requiereRol } = require('../middlewares/autenticacion');

/**
 * Mapa completo de la API REST. Cada recurso usa los verbos HTTP estándar:
 * GET consulta, POST crea, PUT reemplaza, PATCH modifica y DELETE elimina.
 */
function crearRutas({ c, sesion }) {
  const r = express.Router();
  const estudiante = requiereRol('estudiante');
  const docente = requiereRol('docente');

  // Públicas
  r.get('/salud', c.sistema.salud);
  r.get('/configuracion', c.sistema.configuracionPublica);
  r.get('/catalogos', c.catalogos.todo);

  // Desde aquí todas exigen sesión iniciada
  r.use(sesion);

  // Perfil del usuario actual
  r.get('/yo', c.perfil.yo);
  r.patch('/yo', c.perfil.actualizar);
  r.post('/yo/rol', c.perfil.confirmarRol);
  r.put('/yo/google', c.perfil.conectarGoogle);
  r.delete('/yo/google', c.perfil.desconectarGoogle);

  // Búsqueda de tutores
  r.get('/tutores', c.tutores.buscar);
  r.get('/tutores/:id', c.tutores.detalle);

  // Configuración del docente (pantalla Disponibilidad)
  r.get('/docente/configuracion', docente, c.docente.obtenerConfiguracion);
  r.put('/docente/configuracion', docente, c.docente.guardarConfiguracion);

  // Tutorías (reservas)
  r.get('/tutorias', c.tutorias.listar);
  r.post('/tutorias', estudiante, c.tutorias.reservar);
  r.get('/tutorias/:id', c.tutorias.obtener);
  r.patch('/tutorias/:id', c.tutorias.cambiarEstado);
  r.post('/tutorias/:id/resena', estudiante, c.tutorias.calificar);

  // Chat
  r.get('/conversaciones', c.chat.conversaciones);
  r.post('/conversaciones', c.chat.abrir);
  r.get('/conversaciones/:id/mensajes', c.chat.mensajes);
  r.post('/conversaciones/:id/mensajes', c.chat.enviar);

  // Tiempo real (opcional)
  r.get('/solicitudes', c.tiempoReal.listar);
  r.post('/solicitudes', estudiante, c.tiempoReal.crearSolicitud);
  r.get('/solicitudes/:id', c.tiempoReal.detalle);
  r.patch('/solicitudes/:id', estudiante, c.tiempoReal.cancelar);
  r.post('/solicitudes/:id/ofertas', docente, c.tiempoReal.ofertar);
  r.patch('/ofertas/:id', c.tiempoReal.cambiarOferta);

  return r;
}

module.exports = { crearRutas };
