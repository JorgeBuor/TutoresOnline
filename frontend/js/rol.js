/*
 * TutoresOn-Line · rol.js
 *
 * Único JavaScript del proyecto. NO tiene lógica de negocio.
 * Su única tarea: que las pantallas compartidas (Chat y Clases virtuales)
 * muestren el menú y el color del rol que entró (estudiante o docente),
 * usando un solo archivo HTML por pantalla en vez de uno por rol.
 *
 * Orden para decidir el rol:
 *   1. El parámetro ?rol= de la dirección (lo ponen los enlaces del menú).
 *   2. El último rol usado, guardado en el navegador (localStorage).
 *   3. "estudiante" por defecto (también es lo que se ve si JavaScript está apagado).
 *
 * En las pantallas propias de cada rol (body con data-rol-fijo) solo guarda el rol.
 */
(function () {
  var cuerpo = document.body;
  var roles = ['estudiante', 'docente'];
  var rol = cuerpo.getAttribute('data-rol') || 'estudiante';

  if (!cuerpo.hasAttribute('data-rol-fijo')) {
    var deLaUrl = new URLSearchParams(window.location.search).get('rol');
    var guardado = null;
    try { guardado = window.localStorage.getItem('tutores-rol'); } catch (e) { /* navegador sin almacenamiento */ }
    if (roles.indexOf(deLaUrl) !== -1) rol = deLaUrl;
    else if (roles.indexOf(guardado) !== -1) rol = guardado;
    cuerpo.setAttribute('data-rol', rol);
  }

  try { window.localStorage.setItem('tutores-rol', rol); } catch (e) { /* sin almacenamiento: no pasa nada */ }
})();
