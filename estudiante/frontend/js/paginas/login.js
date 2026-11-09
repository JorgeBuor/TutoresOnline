import { auth, api, INICIO, ALCANCE_CALENDARIO, activarVentanas, abrirVentana, cerrarVentana, aviso, conBoton, mostrarError } from '../app.js';

const formulario = document.getElementById('form-login');
activarVentanas();

// Usuarios de demostración (se crean con database/seed_demo.sql)
const DEMO = {
  estudiante: 'maria.restrepo@tutores.com',
  docente: 'carlos.fuentes@tutores.com',
};

async function irASuInicio() {
  const usuario = await api('/yo');
  if (!usuario.rol_confirmado) {
    // Primera vez con Google: el rol se elige en la pantalla de inicio
    let pendiente = null;
    try { pendiente = localStorage.getItem('tutores-rol-pendiente'); } catch { /* sin almacenamiento */ }
    location.replace(INICIO[pendiente] || INICIO.estudiante);
    return;
  }
  location.replace(INICIO[usuario.rol]);
}

async function entrar(correo, clave) {
  const a = await auth();
  const { error } = await a.signInWithPassword({ email: correo, password: clave });
  if (error) {
    throw new Error(error.message.includes('Invalid login') ? 'Correo o contraseña incorrectos' : error.message);
  }
  await irASuInicio();
}

formulario.addEventListener('submit', (ev) => {
  ev.preventDefault();
  if (!formulario.reportValidity()) return;
  mostrarError(formulario, '');
  conBoton(formulario.querySelector('[type=submit]'), async () => {
    try {
      await entrar(formulario.correo.value.trim(), formulario.clave.value);
    } catch (error) {
      mostrarError(formulario, error.message);
    }
  });
});

document.querySelector('[data-google]').addEventListener('click', (ev) => conBoton(ev.currentTarget, async () => {
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

document.querySelectorAll('[data-demo]').forEach((boton) => boton.addEventListener('click', () => conBoton(boton, () => entrar(DEMO[boton.dataset.demo], 'Demo1234*'))));

document.getElementById('form-recuperar').addEventListener('submit', (ev) => {
  ev.preventDefault();
  conBoton(ev.submitter, async () => {
    const a = await auth();
    const { error } = await a.resetPasswordForEmail(document.getElementById('rec-correo').value.trim(), {
      redirectTo: `${location.origin}/index.html`,
    });
    if (error) throw error;
    cerrarVentana('recuperar');
    aviso('Te enviamos un enlace a tu correo para crear una nueva contraseña', 'exito');
  });
});

document.getElementById('form-nueva-clave').addEventListener('submit', (ev) => {
  ev.preventDefault();
  conBoton(ev.submitter, async () => {
    const a = await auth();
    const { error } = await a.updateUser({ password: document.getElementById('nc-clave').value });
    if (error) throw error;
    cerrarVentana('nueva-clave');
    aviso('Contraseña actualizada', 'exito');
    await irASuInicio();
  });
});

// Si ya hay sesión (por ejemplo, al volver de Google), entrar directo
(async () => {
  try {
    const a = await auth();
    a.onAuthStateChange((evento) => {
      if (evento === 'PASSWORD_RECOVERY') abrirVentana('nueva-clave');
    });
    if (location.hash.includes('type=recovery')) return;
    const { data } = await a.getSession();
    if (data.session) await irASuInicio();
  } catch (error) {
    aviso(error.message, 'error');
  }
})();
