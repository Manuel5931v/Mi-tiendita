// ═══════════════════════════════════════
//  CONFIGURACIÓN
// ═══════════════════════════════════════

function _getDiasAvisoInput() {
  // Soporta id duplicado legacy + nuevo id único para bodega
  const principal = document.getElementById('configDiasAviso');
  const bodega = document.getElementById('configDiasAvisoBodega');
  if (esModoBodega() && bodega) return bodega;
  if (principal) return principal;
  const all = document.querySelectorAll('#configDiasAviso');
  for (const el of all) { if (el.offsetParent !== null) return el; }
  return all[0] || bodega || principal;
}
function _setDiasAvisoValor(val) {
  const all = document.querySelectorAll('#configDiasAviso');
  all.forEach(el => el.value = val);
  const bodega = document.getElementById('configDiasAvisoBodega');
  if (bodega) bodega.value = val;
}

function guardarConfig() {
  if (esModoNegocio()) {
    const elNombre = document.getElementById('configNombreTienda');
    const elMoneda = document.getElementById('configMoneda');
    const elUmbral = document.getElementById('configUmbral');
    if (elNombre) config.nombreTienda = elNombre.value;
    if (elMoneda) config.moneda = elMoneda.value;
    if (elUmbral) config.umbralStock = parseInt(elUmbral.value) || 5;
  }
  const elDias = _getDiasAvisoInput();
  config.diasAviso = parseInt(elDias ? elDias.value : 15) || 15;
  guardarEnStorage();
  toast('Configuración guardada');
}

function renderConfig() {
  if (esModoNegocio()) {
    const elNombre = document.getElementById('configNombreTienda');
    const elMoneda = document.getElementById('configMoneda');
    const elUmbral = document.getElementById('configUmbral');
    if (elNombre) elNombre.value = config.nombreTienda;
    if (elMoneda) elMoneda.value = config.moneda;
    if (elUmbral) elUmbral.value = config.umbralStock;
  }
  _setDiasAvisoValor(config.diasAviso);
  renderCategorias();
  actualizarUIAuth();
  _syncFuenteUI();
  try{ if(typeof lucide!=='undefined'&&lucide.createIcons) lucide.createIcons(); }catch(e){}
}

function _syncFuenteUI(){
  try{
    const n = localStorage.getItem('tf_fontScale') || 'normal';
    if(typeof actualizarBotonesFuente==='function') actualizarBotonesFuente(n);
  }catch(e){}
}

function renderCategorias() {
  const lista = document.getElementById('listaCategorias');
  if (lista) {
    lista.innerHTML = config.categorias.map(c => {
      const esc = escHtml(c).replace(/'/g, "\\'");
      return `
      <div class="cat-tag">
        ${escHtml(c)}
        <button class="cat-eliminar" onclick="eliminarCategoria('${esc}')" title="Eliminar">×</button>
      </div>`;
    }).join('');
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

function cambiarModoAplicacion() {
  localStorage.removeItem('tf_modo');
  modoApp = null;
  document.body.removeAttribute('data-modo');
  mostrarSelectorModo();
}

// ═══════════════════════════════════════
//  AUTENTICACIÓN FIREBASE (solo Google)
// ═══════════════════════════════════════

function actualizarUIAuth() {
  const authButtons = document.getElementById('authButtons');
  const logoutButton = document.getElementById('logoutButton');
  const estadoCuenta = document.getElementById('estadoCuenta');
  
  if (typeof uidActual !== 'undefined' && uidActual) {
    if (authButtons) authButtons.style.display = 'none';
    if (logoutButton) logoutButton.style.display = 'flex';
    if (estadoCuenta) estadoCuenta.textContent = '✅ Conectado como ' + ((typeof usuarioActual !== 'undefined' && usuarioActual?.email) || 'usuario');
  } else {
    if (authButtons) authButtons.style.display = 'flex';
    if (logoutButton) logoutButton.style.display = 'none';
    if (estadoCuenta) estadoCuenta.textContent = 'No has iniciado sesión (modo local)';
  }
}
