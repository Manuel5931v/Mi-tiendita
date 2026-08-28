// ═══════════════════════════════════════
//  FUNCIONES DE MODO
// ═══════════════════════════════════════

let modoApp = null;

function esModoBodega() {
  return modoApp === 'bodega';
}

function esModoNegocio() {
  return modoApp === 'negocio';
}

function seleccionarModo(modo) {
  modoApp = modo;
  localStorage.setItem('tf_modo', modo);
  // Cargar los productos, configuración e historial propios de este modo
  cargarDeStorage();
  cargarHistorialDeStorage();
  aplicarModo();
  mostrarPagina('dashboard');
}

function aplicarModo() {
  document.body.setAttribute('data-modo', modoApp);
  
  // Ocultar selector de modo
  document.getElementById('modoSelector').style.display = 'none';
  
  // Actualizar logo según modo
  const logo = document.getElementById('appLogo');
  if (esModoBodega()) {
    logo.innerHTML = '🏭 Mi<span>Bodega</span>';
  } else {
    logo.innerHTML = '🛒 Mi<span>Tiendita</span>';
  }
  
  // Actualizar navegación móvil
  actualizarNavBottom();
  
  // Renderizar página actual
  renderDashboard();
}

function actualizarNavBottom() {
  const grid = document.querySelector('.nav-bottom-inner');
  if (esModoBodega()) {
    grid.style.gridTemplateColumns = 'repeat(4, 1fr)';
  } else {
    grid.style.gridTemplateColumns = 'repeat(6, 1fr)';
  }
}

function mostrarSelectorModo() {
  document.getElementById('modoSelector').style.display = 'flex';
}

function cambiarModoAplicacion() {
  if (confirm('¿Deseas cambiar el modo de la aplicación? Se mostrará la pantalla de selección nuevamente.')) {
    localStorage.removeItem('tf_modo');
    modoApp = null;
    document.body.removeAttribute('data-modo');
    mostrarSelectorModo();
  }
}