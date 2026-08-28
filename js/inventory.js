// ═══════════════════════════════════════
//  INVENTARIO / TABLA
// ═══════════════════════════════════════

let filtroActual = { buscar: '', categoria: '', stock: '', ubicacion: '' };
let idEliminar = null;
let fotoBase64Actual = null;
let fotoEliminada = false;

function filtrarProductos() {
  filtroActual.buscar = document.getElementById('buscarInput').value.toLowerCase();
  filtroActual.categoria = document.getElementById('filtroCategoria').value;
  filtroActual.stock = document.getElementById('filtroStock').value;
  if (esModoBodega()) {
    filtroActual.ubicacion = document.getElementById('filtroUbicacion').value;
  }
  renderTabla();
}

function limpiarFiltros() {
  filtroActual.buscar = '';
  filtroActual.categoria = '';
  filtroActual.stock = '';
  if (esModoBodega()) filtroActual.ubicacion = '';
  const buscar = document.getElementById('buscarInput');
  if (buscar) buscar.value = '';
  const cat = document.getElementById('filtroCategoria');
  if (cat) cat.value = '';
  const stock = document.getElementById('filtroStock');
  if (stock) stock.value = '';
  if (esModoBodega()) {
    const ubic = document.getElementById('filtroUbicacion');
    if (ubic) ubic.value = '';
  }
  renderTabla();
}

function renderTabla() {
  // Actualizar opciones de categoría
  const sel = document.getElementById('filtroCategoria');
  const valActual = sel.value;
  sel.innerHTML = '<option value="">Todas las categorías</option>' +
    config.categorias.map(c => `<option value="${c}">${c}</option>`).join('');
  sel.value = valActual;

  // Actualizar opciones de ubicación (solo modo bodega)
  if (esModoBodega()) {
    const selUbic = document.getElementById('filtroUbicacion');
    const valUbic = selUbic.value;
    selUbic.innerHTML = '<option value="">Todas las ubicaciones</option>' +
      (config.ubicaciones || []).map(u => `<option value="${u}">${u}</option>`).join('');
    selUbic.value = valUbic;
  }

  let pFiltrados = productos.filter(p => {
    const matchBuscar = !filtroActual.buscar ||
      p.nombre.toLowerCase().includes(filtroActual.buscar) ||
      (p.marca||'').toLowerCase().includes(filtroActual.buscar) ||
      (p.proveedor||'').toLowerCase().includes(filtroActual.buscar);
    const matchCat = !filtroActual.categoria || p.categoria === filtroActual.categoria;
    const cs = claseStock(p);
    let matchStock = !filtroActual.stock;
    if (filtroActual.stock === 'vencido') {
      matchStock = p.fechaVencimiento && diasHastaFecha(p.fechaVencimiento) < 0;
    } else if (filtroActual.stock === 'proximo') {
      const d = diasHastaFecha(p.fechaVencimiento);
      matchStock = p.fechaVencimiento && d !== null && d >= 0 && d <= config.diasAviso;
    } else {
      matchStock = !filtroActual.stock || cs === filtroActual.stock;
    }
    const matchUbic = !esModoBodega() || !filtroActual.ubicacion || p.ubicacion === filtroActual.ubicacion;
    return matchBuscar && matchCat && matchStock && matchUbic;
  });

  const grid = document.getElementById('inventarioGrid');
  const sinProd = document.getElementById('sinProductos');

  if (pFiltrados.length === 0) {
    grid.innerHTML = '';
    sinProd.style.display = 'block';
    return;
  }

  sinProd.style.display = 'none';

  grid.innerHTML = pFiltrados.map(p => {
    const precioVenta = p.precioVenta != null ? formatPrecio(p.precioVenta) : '—';
    const fotoHtml = p.foto
      ? `<img class="inventario-card-img" src="${p.foto}" alt="${escHtml(p.nombre)}">`
      : `<div class="inventario-card-noimg">📦</div>`;

    return `
    <div class="inventario-card ${p.stock <= 0 ? 'agotado-card' : ''}" id="ic-${p.id}" onclick="abrirModalProducto('${p.id}')">
      ${fotoHtml}
      <div class="inventario-card-body">
        <div class="inventario-card-cat">${escHtml(p.categoria || 'General')}</div>
        <div class="inventario-card-nombre">${escHtml(p.nombre)}</div>
        ${esModoNegocio() ? `<div class="inventario-card-field">Precio: <strong>${precioVenta}</strong></div>` : ''}
        <div class="inventario-card-actions">
          <button class="btn btn-secundario btn-sm" type="button" onclick="event.stopPropagation(); editarProducto('${p.id}')">✏️ Editar</button>
          <button class="btn btn-peligro btn-sm" type="button" onclick="event.stopPropagation(); pedirEliminar('${p.id}')">🗑️ Eliminar</button>
        </div>
      </div>
    </div>`;
  }).join('');
}

// ─── FOTO DE PRODUCTO ──────────────────────────────────

function aplicarFotoEnZona(base64) {
  fotoBase64Actual = base64 || null;
  fotoEliminada = (base64 === null); // Marcar como eliminada si se pasa null
  const zona = document.getElementById('fotoZona');
  if (!zona) return;

  // Limpiar contenido previo (excepto el input)
  const inputFile = zona.querySelector('input[type="file"]');
  zona.innerHTML = '';
  zona.appendChild(inputFile);

  if (base64) {
    zona.classList.add('con-foto');
    const img = document.createElement('img');
    img.className = 'foto-preview';
    img.src = base64;
    zona.appendChild(img);
    const btnQuitar = document.createElement('button');
    btnQuitar.type = 'button';
    btnQuitar.className = 'foto-quitar';
    btnQuitar.title = 'Quitar foto';
    btnQuitar.innerHTML = '✕';
    btnQuitar.onclick = (e) => { e.stopPropagation(); aplicarFotoEnZona(null); };
    zona.appendChild(btnQuitar);
  } else {
    zona.classList.remove('con-foto');
    zona.insertAdjacentHTML('beforeend', `
      <span class="foto-placeholder-icon">📷</span>
      <span class="foto-placeholder-txt">Toca para subir una foto<br><small>JPG, PNG, WEBP · Máx. 15 MB</small></span>
    `);
  }
}

function previsualizarFoto(event) {
  const archivo = event.target.files[0];
  if (!archivo) return;

  if (archivo.size > 2 * 1024 * 1024) {
    toast('La imagen es muy grande. Máx. 2 MB.', 'aviso');
    event.target.value = '';
    return;
  }

  const reader = new FileReader();
  reader.onload = (e) => {
    const img = new Image();
    img.onload = () => {
      const MAX = 400;
      let w = img.width, h = img.height;
      if (w > MAX || h > MAX) {
        if (w > h) { h = Math.round(h * MAX / w); w = MAX; }
        else       { w = Math.round(w * MAX / h); h = MAX; }
      }
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      canvas.getContext('2d').drawImage(img, 0, 0, w, h);
      const base64 = canvas.toDataURL('image/jpeg', 0.75);
      aplicarFotoEnZona(base64);
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(archivo);
  event.target.value = '';
}

// ─── MODAL PRODUCTO ──────────────────────────────────

function abrirModalProducto(id = null) {
  document.getElementById('modalTitulo').textContent = id ? '✏️ Editar Producto' : '➕ Agregar Producto';
  document.getElementById('productoId').value = id || '';

  // Poblar categorías
  const sel = document.getElementById('fpCategoria');
  sel.innerHTML = config.categorias.map(c => `<option value="${c}">${c}</option>`).join('');

  // Poblar ubicaciones (solo modo bodega)
  if (esModoBodega()) {
    const selUbic = document.getElementById('fpUbicacion');
    selUbic.innerHTML = '<option value="">Sin ubicación</option>' +
      (config.ubicaciones || []).map(u => `<option value="${u}">${u}</option>`).join('');
  }

  // Hacer precioVenta obligatorio solo en modo negocio
  document.getElementById('fpPrecioVenta').required = esModoNegocio();

  if (id) {
    const p = productos.find(x => x.id === id);
    if (!p) return;
    document.getElementById('fpNombre').value = p.nombre || '';
    document.getElementById('fpMarca').value = p.marca || '';
    sel.value = p.categoria || 'General';
    document.getElementById('fpUnidad').value = p.unidad || 'unidad';
    document.getElementById('fpPrecioVenta').value = p.precioVenta ?? '';
    document.getElementById('fpPrecioCosto').value = p.precioCosto ?? '';
    document.getElementById('fpStock').value = p.stock ?? '';
    document.getElementById('fpStockMin').value = p.stockMin ?? '';
    document.getElementById('fpFechaVencimiento').value = p.fechaVencimiento || '';
    document.getElementById('fpFechaAbastecimiento').value = p.fechaAbastecimiento || '';
    document.getElementById('fpProxAbastecimiento').value = p.proxAbastecimiento || '';
    document.getElementById('fpProveedor').value = p.proveedor || '';
    document.getElementById('fpNotas').value = p.notas || '';
    if (esModoBodega()) {
      document.getElementById('fpUbicacion').value = p.ubicacion || '';
      document.getElementById('fpFechaCompra').value = p.fechaCompra || '';
    }
    // Cargar foto si existe
    fotoEliminada = false;
    aplicarFotoEnZona(p.foto || null);
  } else {
    document.getElementById('formProducto').reset();
    document.getElementById('productoId').value = '';
    if (esModoNegocio()) {
      document.getElementById('fpFechaAbastecimiento').value = new Date().toISOString().slice(0,10);
    }
    fotoEliminada = false;
    aplicarFotoEnZona(null);
  }

  document.getElementById('modalOverlay').classList.add('visible');
}

function cerrarModal() {
  document.getElementById('modalOverlay').classList.remove('visible');
}

function cerrarModalSiOverlay(e) {
  if (e.target === document.getElementById('modalOverlay')) cerrarModal();
}

function guardarProducto(e) {
  e.preventDefault();
  const id = document.getElementById('productoId').value;
  const producto = {
    id: id || genId(),
    nombre: document.getElementById('fpNombre').value.trim(),
    marca: document.getElementById('fpMarca').value.trim() || null,
    categoria: document.getElementById('fpCategoria').value,
    unidad: document.getElementById('fpUnidad').value,
    precioVenta: esModoNegocio() ? (parseFloat(document.getElementById('fpPrecioVenta').value) || 0) : null,
    precioCosto: esModoNegocio() ? (parseFloat(document.getElementById('fpPrecioCosto').value) || null) : null,
    stock: parseInt(document.getElementById('fpStock').value) || 0,
    stockMin: esModoNegocio() ? (parseInt(document.getElementById('fpStockMin').value) || null) : null,
    fechaVencimiento: document.getElementById('fpFechaVencimiento').value || null,
    fechaAbastecimiento: esModoNegocio() ? (document.getElementById('fpFechaAbastecimiento').value || null) : null,
    proxAbastecimiento: esModoNegocio() ? (document.getElementById('fpProxAbastecimiento').value || null) : null,
    proveedor: esModoNegocio() ? (document.getElementById('fpProveedor').value.trim() || null) : null,
    ubicacion: esModoBodega() ? (document.getElementById('fpUbicacion').value || null) : null,
    fechaCompra: esModoBodega() ? (document.getElementById('fpFechaCompra').value || null) : null,
    notas: document.getElementById('fpNotas').value.trim() || null,
    foto: fotoEliminada ? null : (fotoBase64Actual || (id ? (productos.find(p=>p.id===id)||{}).foto || null : null)),
    updatedAt: new Date().toISOString()
  };

  if (id) {
    const idx = productos.findIndex(p => p.id === id);
    if (idx !== -1) productos[idx] = producto;
    toast('Producto actualizado correctamente');
  } else {
    producto.createdAt = new Date().toISOString();
    productos.push(producto);
    toast('Producto agregado correctamente');
  }

  guardarEnStorage();
  cerrarModal();
  renderTabla();
  if (paginaActual === 'dashboard') renderDashboard();
}

function editarProducto(id) {
  abrirModalProducto(id);
}

// ─── ELIMINAR PRODUCTO ──────────────────────────────

function pedirEliminar(id) {
  idEliminar = id;
  const p = productos.find(x => x.id === id);
  document.getElementById('confirmNombre').textContent = p ? p.nombre : 'este producto';
  document.getElementById('modalConfirm').classList.add('visible');
}

function cerrarConfirm(e) {
  if (!e || e.target === document.getElementById('modalConfirm')) {
    document.getElementById('modalConfirm').classList.remove('visible');
    idEliminar = null;
  }
}

function confirmarEliminar() {
  if (!idEliminar) return;
  productos = productos.filter(p => p.id !== idEliminar);
  guardarEnStorage();
  document.getElementById('modalConfirm').classList.remove('visible');
  idEliminar = null;
  renderTabla();
  if (paginaActual === 'dashboard') renderDashboard();
  toast('Producto eliminado');
}

// Abrir el inventario ya filtrado según la tarjeta del dashboard
function abrirInventarioFiltrado(filtro) {
  if (filtroActual.buscar) filtroActual.buscar = '';
  filtroActual.categoria = '';
  if (esModoBodega()) filtroActual.ubicacion = '';
  filtroActual.stock = filtro;
  mostrarPagina('inventario');
  renderTabla();
}