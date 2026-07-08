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
  if (esModoHogar()) {
    renderUbicaciones();
  }
}

function renderCategorias() {
  const lista = document.getElementById('listaCategorias');
  lista.innerHTML = config.categorias.map(c => `
    <div class="cat-tag">
      ${escHtml(c)}
      <button class="cat-eliminar" onclick="eliminarCategoria('${escHtml(c)}')" title="Eliminar">×</button>
    </div>
  `).join('');
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
  config.categorias = config.categorias.filter(c => c !== cat);
  guardarEnStorage();
  renderCategorias();
}

function renderUbicaciones() {
  const lista = document.getElementById('listaUbicaciones');
  lista.innerHTML = (config.ubicaciones || []).map(u => `
    <div class="cat-tag">
      ${escHtml(u)}
      <button class="cat-eliminar" onclick="eliminarUbicacion('${escHtml(u)}')" title="Eliminar">×</button>
    </div>
  `).join('');
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