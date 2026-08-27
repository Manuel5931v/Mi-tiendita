// ═══════════════════════════════════════
//  VENTAS RÁPIDAS
// ═══════════════════════════════════════

let modoVentas = 'vender';
let historialDia = [];

function cambiarModoVentas(modo) {
  modoVentas = modo;
  document.getElementById('modoVender').classList.toggle('activo', modo === 'vender');
  document.getElementById('modoAbastecer').classList.toggle('activo', modo === 'abastecer');
  renderVentas();
}

function renderVentas() {
  // Actualizar filtro de categorías
  const selCat = document.getElementById('ventasCategoria');
  const valCat = selCat.value;
  selCat.innerHTML = '<option value="">Todas las categorías</option>' +
    config.categorias.map(c => `<option value="${c}">${c}</option>`).join('');
  selCat.value = valCat;

  const buscar = document.getElementById('ventasBuscar').value.toLowerCase();
  const catFiltro = selCat.value;

  let pFiltrados = productos.filter(p => {
    const matchB = !buscar || p.nombre.toLowerCase().includes(buscar);
    const matchC = !catFiltro || p.categoria === catFiltro;
    return matchB && matchC;
  });

  // En modo vender: primero los que tienen stock, luego agotados
  if (modoVentas === 'vender') {
    pFiltrados.sort((a, b) => {
      if (a.stock <= 0 && b.stock > 0) return 1;
      if (a.stock > 0 && b.stock <= 0) return -1;
      return a.nombre.localeCompare(b.nombre);
    });
  } else {
    pFiltrados.sort((a, b) => a.nombre.localeCompare(b.nombre));
  }

  const grid = document.getElementById('ventasGrid');

  if (pFiltrados.length === 0) {
    grid.innerHTML = `<div style="grid-column:1/-1" class="empty-card">
      <span class="icono">🔍</span>
      <h3>Sin resultados</h3>
      <p>No hay productos que coincidan con la búsqueda.</p>
    </div>`;
    renderHistorial();
    return;
  }

  grid.innerHTML = pFiltrados.map(p => {
    const agotado = p.stock <= 0;
    const cs = claseStock(p);
    const stockLabel = agotado ? 'Agotado' : `${p.stock} ${p.unidad || 'unid.'}`;
    const stockColor = cs === 'ok' ? 'var(--verde)' : cs === 'bajo' ? 'var(--naranja)' : 'var(--rojo)';
    const fotoHtml = p.foto
      ? `<img class="venta-card-img" src="${p.foto}" alt="${escHtml(p.nombre)}">`
      : '';

    return `
    <div class="venta-card ${agotado && modoVentas === 'vender' ? 'agotado-card' : ''}" id="vc-${p.id}">
      ${agotado ? '<span class="agotado-banner">AGOTADO</span>' : ''}
      ${fotoHtml}
      <div>
        <div class="venta-card-cat">${escHtml(p.categoria || 'General')}</div>
        <div class="venta-card-nombre">${escHtml(p.nombre)}</div>
        ${p.marca ? `<div class="venta-card-marca">${escHtml(p.marca)}</div>` : ''}
      </div>
      <div style="display:flex; justify-content:space-between; align-items:baseline; gap:8px;">
        <span class="venta-card-precio">${formatPrecio(p.precioVenta)}</span>
        <span class="venta-card-stock" id="vcs-${p.id}" style="color:${stockColor}">
          ${stockLabel}
        </span>
      </div>

      <!-- Control cantidad -->
      <div class="stock-control">
        <button class="sc-btn restar" onclick="ajustarCantidadInput('${p.id}', -1)" title="Menos">−</button>
        <input
          class="sc-cantidad"
          type="number"
          id="qty-${p.id}"
          value="1"
          min="1"
          max="9999"
          oninput="validarCantidad(this)"
        >
        <button class="sc-btn sumar" onclick="ajustarCantidadInput('${p.id}', 1)" title="Más">+</button>
      </div>

      <!-- Botón principal -->
      ${modoVentas === 'vender'
        ? `<button class="sc-aplicar sc-vender" onclick="registrarVenta('${p.id}')"
            ${agotado ? 'disabled' : ''}>
            💸 Vender
           </button>`
        : `<button class="sc-aplicar sc-vender" onclick="registrarAbastecimiento('${p.id}')"
            style="background:var(--verde-medio)">
            📦 Abastecer
           </button>`
      }
    </div>`;
  }).join('');

  renderHistorial();
}

function validarCantidad(input) {
  let val = parseInt(input.value);
  if (isNaN(val) || val < 1) input.value = 1;
  if (val > 9999) input.value = 9999;
}

function ajustarCantidadInput(id, delta) {
  const inp = document.getElementById('qty-' + id);
  let val = parseInt(inp.value) || 1;
  val = Math.max(1, Math.min(9999, val + delta));
  inp.value = val;
}

function registrarVenta(id) {
  const p = productos.find(x => x.id === id);
  if (!p) return;
  const qty = parseInt(document.getElementById('qty-' + id).value) || 1;

  if (p.stock < qty) {
    toast(`Solo hay ${p.stock} ${p.unidad || 'unid.'} disponibles`, 'aviso');
    return;
  }

  p.stock -= qty;
  p.updatedAt = new Date().toISOString();

  // Registrar en historial
  historialDia.unshift({
    tipo: 'venta',
    productoId: id,
    nombre: p.nombre,
    cantidad: qty,
    unidad: p.unidad || 'unid.',
    precioVenta: p.precioVenta,
    total: (p.precioVenta || 0) * qty,
    hora: new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
  });

  guardarEnStorage();
  guardarHistorial();

  // Animación en la tarjeta
  const card = document.getElementById('vc-' + id);
  if (card) {
    card.classList.remove('stock-flash', 'stock-flash-rojo');
    void card.offsetWidth;
    card.classList.add('stock-flash-rojo');
  }

  // Actualizar solo el stock visible sin rerenderizar todo
  actualizarStockVisible(p);
  renderHistorial();
  guardarEnStorage();

  const agotadoAhora = p.stock <= 0;
  toast(`✅ Vendido: ${qty} × ${p.nombre}${agotadoAhora ? ' — ¡Stock agotado!' : ''}`, agotadoAhora ? 'aviso' : 'ok');

  // Si se agotó, rerenderizar la tarjeta completa para mostrar banner
  if (agotadoAhora) setTimeout(() => renderVentas(), 600);
}

function registrarAbastecimiento(id) {
  const p = productos.find(x => x.id === id);
  if (!p) return;
  const qty = parseInt(document.getElementById('qty-' + id).value) || 1;

  p.stock += qty;
  p.fechaAbastecimiento = new Date().toISOString().slice(0, 10);
  p.updatedAt = new Date().toISOString();

  historialDia.unshift({
    tipo: 'abastecimiento',
    productoId: id,
    nombre: p.nombre,
    cantidad: qty,
    unidad: p.unidad || 'unid.',
    precioVenta: p.precioVenta,
    total: null,
    hora: new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
  });

  guardarEnStorage();
  guardarHistorial();

  const card = document.getElementById('vc-' + id);
  if (card) {
    card.classList.remove('stock-flash', 'stock-flash-rojo');
    void card.offsetWidth;
    card.classList.add('stock-flash');
  }

  actualizarStockVisible(p);
  renderHistorial();

  toast(`📦 Abastecido: +${qty} × ${p.nombre}`);
  setTimeout(() => renderVentas(), 600);
}

function actualizarStockVisible(p) {
  const el = document.getElementById('vcs-' + p.id);
  if (!el) return;
  const cs = claseStock(p);
  const colorMap = { ok: 'var(--verde)', bajo: 'var(--naranja)', agotado: 'var(--rojo)' };
  el.style.color = colorMap[cs];
  el.textContent = p.stock <= 0 ? 'Agotado' : `${p.stock} ${p.unidad || 'unid.'}`;
}

function renderHistorial() {
  // Resumen
  const ventas = historialDia.filter(h => h.tipo === 'venta');
  const totalItems = ventas.reduce((s, h) => s + h.cantidad, 0);
  const totalDinero = ventas.reduce((s, h) => s + (h.total || 0), 0);
  const abastecimientos = historialDia.filter(h => h.tipo === 'abastecimiento').length;

  document.getElementById('resumenDia').innerHTML = `
    <div class="resumen-item">
      <span class="r-num" style="color:var(--verde)">${ventas.length}</span>
      <span class="r-label">Ventas</span>
    </div>
    <div class="resumen-item">
      <span class="r-num" style="color:var(--verde-medio)">${totalItems}</span>
      <span class="r-label">Unidades</span>
    </div>
    <div class="resumen-item">
      <span class="r-num" style="color:var(--naranja)">${formatPrecio(totalDinero)}</span>
      <span class="r-label">Total día</span>
    </div>
  `;

  const lista = document.getElementById('historialLista');
  if (historialDia.length === 0) {
    lista.innerHTML = '<div class="sin-historial">Aún no hay movimientos hoy. ¡Empieza a registrar tus ventas!</div>';
    return;
  }

  lista.innerHTML = historialDia.slice(0, 50).map(h => {
    const esVenta = h.tipo === 'venta';
    return `
    <div class="historial-item">
      <div class="h-icon ${h.tipo}">${esVenta ? '💸' : '📦'}</div>
      <div class="h-info">
        <div class="h-nombre">${escHtml(h.nombre)}</div>
        <div class="h-detalle">${esVenta ? 'Vendido' : 'Abastecido'}: ${h.cantidad} ${h.unidad}</div>
      </div>
      <div style="text-align:right">
        <div class="h-monto" style="color:${esVenta ? 'var(--verde)' : 'var(--naranja)'}">
          ${esVenta ? formatPrecio(h.total) : '+' + h.cantidad}
        </div>
        <div class="h-hora">${h.hora}</div>
      </div>
    </div>`;
  }).join('');
}

function limpiarHistorialDia() {
  if (!confirm('¿Limpiar el historial de hoy? Los cambios de stock ya realizados no se revierten.')) return;
  historialDia = [];
  guardarHistorial();
  renderHistorial();
  toast('Historial del día limpiado', 'aviso');
}