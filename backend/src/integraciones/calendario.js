const { randomUUID } = require('crypto');

/**
 * Calendarios. Interfaz común:
 *   crearEvento({ organizadorId, titulo, descripcion, inicio, fin, invitados, conMeet }) → { eventId, meetUrl } | null
 *   cancelarEvento(organizadorId, eventId) → void
 *
 * CalendarioGoogle usa el permiso que el docente dio al entrar con Google (refresh token)
 * para crear el evento en SU calendario, invitar al estudiante y generar el enlace de Meet.
 */
class CalendarioGoogle {
  constructor({ clientId, clientSecret, integracionRepositorio, zonaHoraria }) {
    this.clientId = clientId;
    this.clientSecret = clientSecret;
    this.integraciones = integracionRepositorio;
    this.zonaHoraria = zonaHoraria;
  }

  async tokenDeAcceso(organizadorId) {
    const refreshToken = await this.integraciones.tokenGoogle(organizadorId);
    if (!refreshToken) return null;
    const respuesta = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: this.clientId,
        client_secret: this.clientSecret,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      }),
    });
    if (!respuesta.ok) throw new Error(`Google no renovó el permiso (${respuesta.status})`);
    return (await respuesta.json()).access_token;
  }

  async crearEvento({ organizadorId, titulo, descripcion, inicio, fin, invitados = [], conMeet = true }) {
    const token = await this.tokenDeAcceso(organizadorId);
    if (!token) return null; // el docente no ha conectado Google Calendar

    const evento = {
      summary: titulo,
      description: descripcion,
      start: { dateTime: new Date(inicio).toISOString(), timeZone: this.zonaHoraria },
      end: { dateTime: new Date(fin).toISOString(), timeZone: this.zonaHoraria },
      attendees: invitados.filter(Boolean).map((email) => ({ email })),
    };
    if (conMeet) {
      evento.conferenceData = {
        createRequest: { requestId: randomUUID(), conferenceSolutionKey: { type: 'hangoutsMeet' } },
      };
    }

    const respuesta = await fetch(
      'https://www.googleapis.com/calendar/v3/calendars/primary/events?conferenceDataVersion=1&sendUpdates=all',
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(evento),
      },
    );
    if (!respuesta.ok) throw new Error(`Google Calendar respondió ${respuesta.status}: ${await respuesta.text()}`);
    const creado = await respuesta.json();
    return { eventId: creado.id, meetUrl: creado.hangoutLink || null };
  }

  async cancelarEvento(organizadorId, eventId) {
    if (!eventId) return;
    const token = await this.tokenDeAcceso(organizadorId);
    if (!token) return;
    await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(eventId)}?sendUpdates=all`,
      { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } },
    );
  }
}

/** Se usa cuando no hay credenciales de Google configuradas. */
class CalendarioDesactivado {
  async crearEvento() {
    return null;
  }

  async cancelarEvento() {}
}

module.exports = { CalendarioGoogle, CalendarioDesactivado };
