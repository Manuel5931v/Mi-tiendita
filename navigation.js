// ═══════════════════════════════════════
//  NAVEGACIÓN
// ═══════════════════════════════════════

let paginaActual = 'dashboard';

function mostrarPagina(pagina, btnElem) {
  document.querySelectorAll('.pagina').forEach(p => p.classList.remove('activa'));
  document.getElementById('pg-' + pagina).classList.add('activa');
  paginaActual = pagina;

  // Nav header
  document.querySelectorAll('#navPrincipal button').forEach(b => b.classList.remove('activo'));
  // Nav bottom
  document.querySelectorAll('.nav-bottom-btn').forEach(b => b.classList.remove('activo'));
  document.getElementById('nb-' + pagina)?.classList.add('activo');

  if (btnElem && btnElem.closest('#navPrincipal')) btnElem.classList.add('activo');

  if (pagina === 'dashboard') renderDashboard();
  if (pagina === 'inventario') renderTabla();
  if (pagina === 'ventas') renderVentas();
  if (pagina === 'reportes') renderReportes();
  if (pagina === 'asistente') renderAsistente();
  if (pagina === 'config') renderConfig();
  window.scrollTo(0, 0);
}