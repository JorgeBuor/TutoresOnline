const { randomUUID } = require('crypto');

/**
 * Calendarios. Interfaz común:
 *   crearEvento({ organizadorId, titulo, descripcion, inicio, fin, invitados, conMeet }) → { eventId, meetUrl } | null
 *   cancelarEvento(organizadorId, eventId) → void
 *   ocupado(organizadorId, desde, hasta) → { estado, intervalos }
 *     estado: 'ok' | 'sin_conexion' | 'sin_permiso' | 'error'; intervalos: [{ inicio: Date, fin: Date }]
 *
 * CalendarioGoogle usa el permiso que el docente dio al entrar con Google (refresh token)
 * para crear el evento en SU calendario, invitar al estudiante y generar el enlace de Meet.
 */
class CalendarioGoogle {
  constructor({ clientId, clientSecret, integracionRepositorio, zonaHoraria, fetch: f = fetch }) {
    this.clientId = clientId;
    this.clientSecret = clientSecret;
    this.integraciones = integracionRepositorio;
    this.zonaHoraria = zonaHoraria;
    this.fetch = f;
    this.tokens = new Map();     // docente → { token, vence }: el permiso de Google dura una hora
    this.ocupados = new Map();   // "docente|desde|hasta" → { valor, vence }: evita preguntar a Google en cada búsqueda
  }

  async tokenDeAcceso(organizadorId) {
    const guardado = this.tokens.get(organizadorId);
    if (guardado && guardado.vence > Date.now()) return guardado.token;
    const refreshToken = await this.integraciones.tokenGoogle(organizadorId);
    if (!refreshToken) return null;
    const fetch = this.fetch;
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
    const { access_token: token, expires_in: duracion = 3600 } = await respuesta.json();
    this.tokens.set(organizadorId, { token, vence: Date.now() + (duracion - 120) * 1000 });
    return token;
  }

  /**
   * Horarios en los que el docente está ocupado según su Google Calendar.
   * Google solo entrega "ocupado de tal a tal hora", nunca el nombre ni el detalle de los eventos.
   */
  async ocupado(organizadorId, desde, hasta) {
    const clave = `${organizadorId}|${new Date(desde).toISOString()}|${new Date(hasta).toISOString()}`;
    const guardado = this.ocupados.get(clave);
    if (guardado && guardado.vence > Date.now()) return guardado.valor;

    let valor;
    try {
      const token = await this.tokenDeAcceso(organizadorId);
      if (!token) {
        valor = { estado: 'sin_conexion', intervalos: [] };
      } else {
        const respuesta = await this.fetch('https://www.googleapis.com/calendar/v3/freeBusy', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            timeMin: new Date(desde).toISOString(),
            timeMax: new Date(hasta).toISOString(),
            timeZone: this.zonaHoraria,
            items: [{ id: 'primary' }],
          }),
          signal: AbortSignal.timeout(4000),
        });
        if (respuesta.status === 401 || respuesta.status === 403) {
          valor = { estado: 'sin_permiso', intervalos: [] };   // conectó Google antes de pedir este permiso
        } else if (!respuesta.ok) {
          throw new Error(`Google respondió ${respuesta.status}`);
        } else {
          const datos = await respuesta.json();
          const calendario = datos.calendars?.primary || {};
          if (calendario.errors?.length) {
            valor = { estado: 'sin_permiso', intervalos: [] };
          } else {
            valor = {
              estado: 'ok',
              intervalos: (calendario.busy || []).map((b) => ({ inicio: new Date(b.start), fin: new Date(b.end) })),
            };
          }
        }
      }
    } catch (error) {
      console.error('No se pudo leer el calendario del docente:', error.message);
      valor = { estado: 'error', intervalos: [] };
    }
    this.ocupados.set(clave, { valor, vence: Date.now() + (valor.estado === 'error' ? 15000 : 60000) });
    return valor;
  }

  /** Después de crear o borrar un evento, lo guardado de ese docente ya no sirve. */
  olvidarOcupado(organizadorId) {
    for (const clave of this.ocupados.keys()) if (clave.startsWith(`${organizadorId}|`)) this.ocupados.delete(clave);
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

    this.olvidarOcupado(organizadorId);
    const respuesta = await this.fetch(
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
    this.olvidarOcupado(organizadorId);
    await this.fetch(
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

  async ocupado() {
    return { estado: 'sin_conexion', intervalos: [] };
  }
}

module.exports = { CalendarioGoogle, CalendarioDesactivado };
