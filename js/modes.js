// ═══════════════════════════════════════
//  FUNCIONES DE MODO
// ═══════════════════════════════════════

let modoApp = null;

function esModoHogar() {
  return modoApp === 'hogar';
}

function esModoNegocio() {
  return modoApp === 'negocio';
}

function seleccionarModo(modo) {
  modoApp = modo;
  localStorage.setItem('tf_modo', modo);
  aplicarModo();
  mostrarPagina('dashboard');
}

function aplicarModo() {
  document.body.setAttribute('data-modo', modoApp);
  
  // Ocultar selector de modo
  document.getElementById('modoSelector').style.display = 'none';
  
  // Actualizar logo según modo
  const logo = document.getElementById('appLogo');
  if (esModoHogar()) {
    logo.innerHTML = '🏠 Mi<span>Hogar</span>';
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
  if (esModoHogar()) {
    grid.style.gridTemplateColumns = 'repeat(3, 1fr)';
  } else {
    grid.style.gridTemplateColumns = 'repeat(5, 1fr)';
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