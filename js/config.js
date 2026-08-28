// ═══════════════════════════════════════
//  CONFIGURACIÓN
// ═══════════════════════════════════════

function guardarConfig() {
  if (esModoNegocio()) {
    config.nombreTienda = document.getElementById('configNombreTienda').value;
    config.moneda = document.getElementById('configMoneda').value;
    config.umbralStock = parseInt(document.getElementById('configUmbral').value) || 5;
  }
  config.diasAviso = parseInt(document.getElementById('configDiasAviso').value) || 15;
  guardarEnStorage();
  toast('Configuración guardada');
}

function renderConfig() {
  if (esModoNegocio()) {
    document.getElementById('configNombreTienda').value = config.nombreTienda;
    document.getElementById('configMoneda').value = config.moneda;
    document.getElementById('configUmbral').value = config.umbralStock;
  }
  document.getElementById('configDiasAviso').value = config.diasAviso;
  renderCategorias();
  if (esModoBodega()) {
    renderUbicaciones();
  }
  
  // Inicializar UI de autenticación
  actualizarUIAuth();
}

function renderCategorias() {
  const lista = document.getElementById('listaCategorias');
  if (lista) {
    lista.innerHTML = config.categorias.map(c => `
      <div class="cat-tag">
        ${escHtml(c)}
        <button class="cat-eliminar" onclick="eliminarCategoria('${escHtml(c)}')" title="Eliminar">×</button>
      </div>
    `).join('');
  }
}

function agregarCategoria() {
  const inp = document.getElementById('nuevaCatInput');
  const val = inp.value.trim();
  if (!val) return;
  if (config.categorias.includes(val)) { toast('Esa categoría ya existe', 'aviso'); return; }
  config.categorias.push(val);
  inp.value = '';
  guardarEnStorage();
  renderCategorias();
  toast(`Categoría "${val}" agregada`);
}

function eliminarCategoria(cat) {
  // Verificar si hay productos usando esta categoría
  const productosConCat = productos.filter(p => p.categoria === cat);
  if (productosConCat.length > 0) {
    toast(`No puedes eliminar "${cat}" porque ${productosConCat.length} producto(s) la usan. Primero reasigna o elimina esos productos.`, 'error');
    return;
  }
  config.categorias = config.categorias.filter(c => c !== cat);
  guardarEnStorage();
  renderCategorias();
  toast(`Categoría "${cat}" eliminada`);
}

// ❌ ELIMINADA: función eliminarCategoriaSeleccionada()

function renderUbicaciones() {
  const lista = document.getElementById('listaUbicaciones');
  if (lista) {
    lista.innerHTML = (config.ubicaciones || []).map(u => `
      <div class="cat-tag">
        ${escHtml(u)}
        <button class="cat-eliminar" onclick="eliminarUbicacion('${escHtml(u)}')" title="Eliminar">×</button>
      </div>
    `).join('');
  }
}

function agregarUbicacion() {
  const inp = document.getElementById('nuevaUbicInput');
  const val = inp.value.trim();
  if (!val) return;
  if (!config.ubicaciones) config.ubicaciones = [];
  if (config.ubicaciones.includes(val)) { toast('Esa ubicación ya existe', 'aviso'); return; }
  config.ubicaciones.push(val);
  inp.value = '';
  guardarEnStorage();
  renderUbicaciones();
  toast(`Ubicación "${val}" agregada`);
}

function eliminarUbicacion(ubic) {
  config.ubicaciones = config.ubicaciones.filter(u => u !== ubic);
  guardarEnStorage();
  renderUbicaciones();
}

function cambiarModoAplicacion() {
  localStorage.removeItem('tf_modo');
  modoApp = null;
  document.body.removeAttribute('data-modo');
  mostrarSelectorModo();
}

// ═══════════════════════════════════════
//  AUTENTICACIÓN FIREBASE (solo Google)
// ═══════════════════════════════════════

// Actualizar UI de autenticación
function actualizarUIAuth() {
  const authButtons = document.getElementById('authButtons');
  const logoutButton = document.getElementById('logoutButton');
  const estadoCuenta = document.getElementById('estadoCuenta');
  
  if (typeof uidActual !== 'undefined' && uidActual) {
    if (authButtons) authButtons.style.display = 'none';
    if (logoutButton) logoutButton.style.display = 'flex';
    if (estadoCuenta) estadoCuenta.textContent = '✅ Conectado como ' + (usuarioActual?.email || 'usuario');
  } else {
    if (authButtons) authButtons.style.display = 'flex';
    if (logoutButton) logoutButton.style.display = 'none';
    if (estadoCuenta) estadoCuenta.textContent = 'No has iniciado sesión (modo local)';
  }
}