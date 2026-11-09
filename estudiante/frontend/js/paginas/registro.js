import { auth, INICIO, ALCANCE_CALENDARIO, aviso, conBoton, mostrarError, crearVentana } from '../app.js';

const formulario = document.getElementById('form-registro');
const rolElegido = () => document.querySelector('input[name="rol"]:checked').value;

formulario.addEventListener('submit', (ev) => {
  ev.preventDefault();
  if (!formulario.reportValidity()) return;
  mostrarError(formulario, '');
  const rol = rolElegido();

  conBoton(ev.submitter, async () => {
    const a = await auth();
    const materias = document.getElementById('materias-r').value.trim();
    if (rol === 'docente' && materias) {
      try { localStorage.setItem('tutores-materias-sugeridas', materias); } catch { /* sin almacenamiento */ }
    }
    const { data, error } = await a.signUp({
      email: document.getElementById('correo-r').value.trim(),
      password: document.getElementById('clave-r').value,
      options: {
        data: { rol, nombre_completo: document.getElementById('nombre').value.trim() },
        emailRedirectTo: `${location.origin}/index.html`,
      },
    });
    if (error) {
      mostrarError(formulario, error.message.includes('already registered') ? 'Ya existe una cuenta con ese correo' : error.message);
      return;
    }
    if (data.session) {
      location.replace(rol === 'docente' ? '/docente/disponibilidad.html' : INICIO.estudiante);
      return;
    }
    // Supabase tiene activada la confirmación por correo
    crearVentana(`
      <div class="tarjeta">
        <h2>Revisa tu correo</h2>
        <p>Te enviamos un enlace para confirmar tu cuenta. Después de confirmarla podrás iniciar sesión.</p>
        <div class="acciones"><a class="btn turquesa" href="/index.html">Ir a iniciar sesión</a></div>
      </div>`);
  });
});

document.querySelector('[data-google]').addEventListener('click', (ev) => conBoton(ev.currentTarget, async () => {
  try { localStorage.setItem('tutores-rol-pendiente', rolElegido()); } catch { aviso('Tu navegador no permite guardar datos', 'error'); }
  const a = await auth();
  const { error } = await a.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: `${location.origin}/index.html`,
      scopes: ALCANCE_CALENDARIO,
      queryParams: { access_type: 'offline', prompt: 'consent' },
    },
  });
  if (error) throw error;
}));
