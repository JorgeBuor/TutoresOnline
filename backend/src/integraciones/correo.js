/**
 * Canales de correo. Ambos cumplen la misma interfaz: enviar({ para, asunto, html }) → boolean.
 * El resto del sistema depende de esa interfaz, no del proveedor (inversión de dependencias),
 * así que cambiar Resend por otro servicio solo exige una clase nueva aquí.
 */
class CorreoResend {
  constructor({ apiKey, remitente }) {
    this.apiKey = apiKey;
    this.remitente = remitente;
  }

  async enviar({ para, asunto, html }) {
    const respuesta = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: this.remitente, to: [para], subject: asunto, html }),
    });
    if (!respuesta.ok) throw new Error(`Resend respondió ${respuesta.status}: ${await respuesta.text()}`);
    return true;
  }
}

/** Se usa cuando no hay proveedor configurado: no envía nada, la notificación queda registrada. */
class CorreoDesactivado {
  async enviar() {
    return false;
  }
}

module.exports = { CorreoResend, CorreoDesactivado };
