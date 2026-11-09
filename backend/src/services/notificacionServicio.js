const { textoFechaHora } = require('../utils/fechas');

/**
 * Avisa por correo a estudiantes y docentes cuando cambia una tutoría.
 * Cada aviso queda registrado en la tabla notificaciones con su estado.
 * Nunca interrumpe la operación principal: si el correo falla, la reserva sigue siendo válida.
 */
class NotificacionServicio {
  constructor({ integracionRepositorio, correo, urlAplicacion, zonaHoraria }) {
    this.repo = integracionRepositorio;
    this.correo = correo;
    this.url = urlAplicacion;
    this.zona = zonaHoraria;
  }

  async enviar({ usuarioId, email, tutoriaId, asunto, mensaje }) {
    try {
      const notificacion = await this.repo.crearNotificacion({ usuarioId, tutoriaId, canal: 'email', asunto });
      try {
        const enviado = await this.correo.enviar({ para: email, asunto, html: this.plantilla(asunto, mensaje) });
        await this.repo.marcarNotificacion(notificacion.id, enviado ? 'enviada' : 'pendiente');
      } catch (error) {
        console.error('No se pudo enviar el correo:', error.message);
        await this.repo.marcarNotificacion(notificacion.id, 'fallida');
      }
    } catch (error) {
      console.error('No se pudo registrar la notificación:', error.message);
    }
  }

  plantilla(asunto, mensaje) {
    return `<div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;color:#14213D">
      <h2 style="color:#1B968B">TutoresOn-Line</h2>
      <h3>${asunto}</h3>
      <p style="line-height:1.6">${mensaje}</p>
      <p><a href="${this.url}" style="background:#2EC4B6;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none">Abrir TutoresOn-Line</a></p>
    </div>`;
  }

  resumen(t) {
    const lugar = t.modalidad === 'virtual' ? 'virtual por Google Meet' : `presencial en ${t.lugar}`;
    return `<b>${t.materia}</b>, ${textoFechaHora(t.inicio, this.zona)}, ${lugar}.`;
  }

  tutoriaSolicitada(t) {
    return this.enviar({
      usuarioId: t.docente_id, email: t.docente_email, tutoriaId: t.id,
      asunto: 'Tienes una nueva solicitud de tutoría',
      mensaje: `${t.estudiante} quiere una tutoría de ${this.resumen(t)} Entra a tu agenda para aceptarla o rechazarla.`,
    });
  }

  async tutoriaConfirmada(t) {
    const enlace = t.meet_url ? `<br>Enlace de la clase: <a href="${t.meet_url}">${t.meet_url}</a>` : '';
    await this.enviar({
      usuarioId: t.estudiante_id, email: t.estudiante_email, tutoriaId: t.id,
      asunto: 'Tu tutoría quedó confirmada',
      mensaje: `${t.docente} confirmó tu tutoría de ${this.resumen(t)}${enlace}`,
    });
    await this.enviar({
      usuarioId: t.docente_id, email: t.docente_email, tutoriaId: t.id,
      asunto: 'Tutoría confirmada en tu agenda',
      mensaje: `Tienes clase con ${t.estudiante}: ${this.resumen(t)}${enlace}`,
    });
  }

  tutoriaRechazada(t) {
    return this.enviar({
      usuarioId: t.estudiante_id, email: t.estudiante_email, tutoriaId: t.id,
      asunto: 'Tu solicitud de tutoría no fue aceptada',
      mensaje: `${t.docente} no puede dar la tutoría de ${this.resumen(t)} Puedes buscar otro horario u otro tutor.`,
    });
  }

  /** El estudiante pidió aviso de una materia y un docente acaba de publicarla con horarios. */
  materiaDisponible(a, docente) {
    return this.enviar({
      usuarioId: a.estudiante_id, email: a.email, tutoriaId: null,
      asunto: `Ya hay un tutor de ${a.materia}`,
      mensaje: `Hola, ${a.nombre_completo}. Nos pediste que te avisáramos: ${docente} ya enseña <b>${a.materia}</b> en TutoresOn-Line. Entra a Agendar para ver sus horarios y reservar.`,
    });
  }

  tutoriaCancelada(t, canceladaPorId) {
    const avisarAlDocente = canceladaPorId === t.estudiante_id;
    return this.enviar({
      usuarioId: avisarAlDocente ? t.docente_id : t.estudiante_id,
      email: avisarAlDocente ? t.docente_email : t.estudiante_email,
      tutoriaId: t.id,
      asunto: 'Una tutoría fue cancelada',
      mensaje: `${avisarAlDocente ? t.estudiante : t.docente} canceló la tutoría de ${this.resumen(t)}`,
    });
  }
}

module.exports = { NotificacionServicio };
