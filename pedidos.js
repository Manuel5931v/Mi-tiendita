// ═══════════════════════════════════════
//  PEDIDOS TIENDA ↔ BODEGA (función de paga)
//  La tienda pide productos disponibles en la bodega;
//  la bodega los marca pendiente y luego enviado;
//  la tienda confirma la llegada y el stock se suma
//  automáticamente a su inventario (y se descuenta
//  el de la bodega). Requiere membresía activa (sync).
// ═══════════════════════════════════════

let pedidos = [];
let _pedidosCargados = false;

// Caché del inventario de la bodega usado para crear pedidos desde la tienda.
// Se alimenta de localStorage (y de Firebase si el sync está activo), porque
// la tienda puede estar viendo datos de la nube que aún no se reflejaron
// en la clave local 'tf_productos_bodega'.
let _bodegaCache = [];
let _bodegaFirebaseVerificado = false;

// ─── PERSISTENCIA (clave compartida entre modos) ───

function cargarPedidosDeStorage() {
  _pedidosCargados = true;
  try {
    const raw = localStorage.getItem('tf_pedidos');
    pedidos = raw ? JSON.parse(raw) : [];
  } catch(e) {
    pedidos = [];
  }
  actualizarBadgePedidos();
}

function guardarPedidos() {
  localStorage.setItem('tf_pedidos', JSON.stringify(pedidos));
  if (typeof guardarPedidosEnFirebase === 'function') guardarPedidosEnFirebase();
  actualizarBadgePedidos();
}

// ─── GATING: función de paga ───

function pedidosHabilitados() {
  return typeof syncHabilitado !== 'undefined' && syncHabilitado === true;
}

function actualizarBadgePedidos() {
  const badge = document.getElementById('pedidosBadge');
  if (!badge) return;
  if (!pedidosHabilitados()) {
    badge.style.display = 'inline-flex';
    badge.textContent = '🔒';
    return;
  }
  const activos = pedidos.filter(p => p.estado !== 'recibido').length;
  if (activos > 0) {
    badge.style.display = 'inline-flex';
    badge.textContent = activos;
  } else {
    badge.style.display = 'none';
  }
}

// ─── LECTURA DEL INVENTARIO DE OTRO MODO ───

function leerProductosOtroModo(modo) {
  const clave = (modo === 'bodega' || modo === 'hogar') ? 'bodega' : 'tienda';
  let raw = localStorage.getItem('tf_productos_' + clave);
  if (raw === null) raw = localStorage.getItem('tf_productos'); // migración
  try {
    const lista = raw ? JSON.parse(raw) : [];
    if (clave === 'bodega') _bodegaCache = lista;
    return lista;
  } catch(e) {
    return [];
  }
}

// Si la bodega está vacía en localStorage pero hay sync activo, los productos
// pueden vivir solo en Firebase (aún no cacheados localmente en esta sesión).
// Esta función los lee de la nube, los persiste y re-renderiza.
function cargarBodegaDesdeFirebase(callback) {
  const habilitarSync = (typeof syncHabilitado !== 'undefined') && syncHabilitado === true;
  const uid = (typeof uidActual !== 'undefined') ? uidActual : null;
  if (!habilitarSync || !uid || typeof db === 'undefined') {
    _bodegaFirebaseVerificado = true;
    if (callback) callback(_bodegaCache);
    return;
  }
  if (_bodegaFirebaseVerificado) {
    if (callback) callback(_bodegaCache);
    return;
  }
  _bodegaFirebaseVerificado = true;
  db.ref('usuarios/' + uid + '/productos/bodega')
    .once('value')
    .then(snap => {
      const val = snap.val();
      const lista = val ? Object.values(val) : [];
      if (lista.length > 0) {
        _bodegaCache = lista;
        localStorage.setItem('tf_productos_bodega', JSON.stringify(lista));
      }
      if (callback) callback(lista);
    })
    .catch(() => { if (callback) callback(_bodegaCache); });
}

// Devuelve la lista de bodega ya cacheada (localStorage y/o Firebase).
function obtenerBodegaCache() {
  return _bodegaCache;
}

// ─── MODAL ───

function abrirModalPedidos() {
  if (!_pedidosCargados) cargarPedidosDeStorage();
  renderPedidos();
  document.getElementById('modalPedidos').classList.add('visible');
}

function cerrarModalPedidos(e) {
  if (e && e.target !== document.getElementById('modalPedidos')) return;
  document.getElementById('modalPedidos').classList.remove('visible');
}

// ─── VISTA LISTA DE PEDIDOS ───

function renderPedidos() {
  const cont = document.getElementById('pedidosVista');
  if (!cont) return;

  // Función de paga: sin membresía activa no se muestra nada
  if (!pedidosHabilitados()) {
    cont.innerHTML = `
      <div class="pago-aviso">
        <span class="pago-icono">🔒</span>
        <strong>Los pedidos son una función de pago</strong>
        <p>La tienda puede pedir productos a la bodega y gestionar los envíos solo con una membresía activa.</p>
        <button class="btn btn-primario btn-sm" onclick="iniciarSesionConGoogle()">🔐 Activar membresía</button>
      </div>`;
    return;
  }

  const top = `
    <div class="pedidos-acciones-top">
      ${esModoNegocio() ? '<button class="btn btn-primario btn-sm" onclick="renderNuevoPedido()">➕ Nuevo pedido</button>' : ''}
      <span style="color:var(--texto-suave); font-size:0.85rem;">${pedidos.length} pedido(s)</span>
    </div>`;

  if (pedidos.length === 0) {
    cont.innerHTML = top + `<div class="sin-historial">${
      esModoNegocio()
        ? 'Aún no hay pedidos. ¡Pide productos a tu bodega!'
        : 'No hay pedidos de la tienda por ahora.'
    }</div>`;
    return;
  }

  cont.innerHTML = top + pedidos.map(renderPedidoCard).join('');
}

function renderPedidoCard(p) {
  const badges = {
    nuevo: ['pe-nuevo', '🆕 Nuevo'],
    pendiente: ['pe-pendiente', '⏳ Pendiente'],
    enviado: ['pe-enviado', '🚚 Enviado'],
    recibido: ['pe-recibido', '✅ Recibido']
  };
  const [cls, txt] = badges[p.estado] || badges.nuevo;
  const fecha = p.creadoEn
    ? formatearFechaMostrar(p.creadoEn.slice(0,10)) + ' ' + (p.creadoEn.slice(11,16) || '')
    : '';

  let acciones = '';
  if (esModoBodega()) {
    if (p.estado === 'nuevo') acciones = `<button class="btn btn-secundario btn-sm" onclick="marcarPendiente('${p.id}')">⏳ Marcar pendiente</button>`;
    if (p.estado === 'pendiente') acciones = `<button class="btn btn-primario btn-sm" onclick="marcarEnviado('${p.id}')">🚚 Marcar enviado</button>`;
  } else if (esModoNegocio()) {
    if (p.estado === 'enviado') acciones = `<button class="btn btn-primario btn-sm" onclick="marcarRecibido('${p.id}')">✅ Marcar recibido</button>`;
  }

  return `
  <div class="pedido-card">
    <div class="pedido-card-head">
      <span class="pedido-fecha">🕐 ${escHtml(fecha)}</span>
      <span class="pedido-estado ${cls}">${txt}</span>
    </div>
    <div class="pedido-items">
      ${p.items.map(i => `
        <div class="pedido-item">
          <span class="pedido-item-nombre">${escHtml(i.nombre)}</span>
          <span class="pedido-item-qty">× ${i.cantidad} ${escHtml(i.unidad || 'unid.')}</span>
        </div>`).join('')}
    </div>
    ${acciones ? `<div class="pedido-acciones">${acciones}</div>` : ''}
  </div>`;
}

// ─── VISTA NUEVO PEDIDO (solo modo tienda) ───

function renderNuevoPedido() {
  const cont = document.getElementById('pedidosVista');
  if (!cont || esModoBodega()) return;

  // Preservar cantidades ya seleccionadas entre re-renders
  const qtyPrevia = {};
  document.querySelectorAll('#pedidosVista .sc-cantidad').forEach(inp => {
    qtyPrevia[inp.id] = inp.value;
  });

  const bodega = leerProductosOtroModo('bodega');

  // Si la bodega local está vacía, intentar cargarla desde Firebase (sync)
  if (bodega.length === 0) {
    cargarBodegaDesdeFirebase(() => {
      renderNuevoPedido();
    });
  }

  const buscarInput = document.getElementById('pedidoBuscar');
  const buscar = (buscarInput ? buscarInput.value : '').toLowerCase();
  const filtrados = bodega.filter(p =>
    !buscar ||
    (p.nombre || '').toLowerCase().includes(buscar) ||
    (p.marca || '').toLowerCase().includes(buscar)
  );

  cont.innerHTML = `
    <div class="pedidos-toolbar">
      <div class="buscador" style="min-width:0">
        <span>🔍</span>
        <input type="text" id="pedidoBuscar" placeholder="Buscar en bodega..." value="${escHtml(buscar)}" oninput="renderNuevoPedido()">
      </div>
      <button class="btn btn-secundario btn-sm" onclick="renderPedidos()">← Volver</button>
    </div>
    ${bodega.length === 0
      ? '<div class="sin-historial">La bodega no tiene productos para pedir.</div>'
      : `<div class="pedidos-nuevo-grid">
          ${filtrados.map(p => `
            <div class="pedido-prod">
              <div class="pedido-prod-info">
                <div class="pedido-prod-nombre">${escHtml(p.nombre)}</div>
                <div class="pedido-prod-detalle">${escHtml(p.categoria || 'General')} · Stock bodega: ${p.stock || 0} ${escHtml(p.unidad || 'unid.')}</div>
              </div>
              <div class="stock-control">
                <button class="sc-btn restar" onclick="ajustarCantidadPedido('${p.id}', -1)">−</button>
                <input class="sc-cantidad" type="number" id="pqty-${p.id}" value="${qtyPrevia['pqty-' + p.id] || 0}" min="0" max="${p.stock || 0}" oninput="validarCantidadPedido(this)">
                <button class="sc-btn sumar" onclick="ajustarCantidadPedido('${p.id}', 1)">+</button>
              </div>
            </div>`).join('')}
        </div>`}
    <div class="form-acciones">
      <button class="btn btn-secundario" onclick="renderPedidos()">Cancelar</button>
      <button class="btn btn-primario" onclick="crearPedido()">📦 Crear pedido</button>
    </div>`;
}

function ajustarCantidadPedido(id, delta) {
  const inp = document.getElementById('pqty-' + id);
  if (!inp) return;
  const max = parseInt(inp.max) || 9999;
  let val = parseInt(inp.value) || 0;
  val = Math.max(0, Math.min(max, val + delta));
  inp.value = val;
}

function validarCantidadPedido(input) {
  const max = parseInt(input.max) || 9999;
  let val = parseInt(input.value);
  if (isNaN(val) || val < 0) val = 0;
  if (val > max) val = max;
  input.value = val;
}

function crearPedido() {
  const bodega = obtenerBodegaCache().length > 0 ? obtenerBodegaCache() : leerProductosOtroModo('bodega');
  const items = bodega
    .map(p => {
      const qty = parseInt((document.getElementById('pqty-' + p.id) || {}).value) || 0;
      return {
        productoId: p.id,
        nombre: p.nombre,
        marca: p.marca || null,
        categoria: p.categoria || 'General',
        unidad: p.unidad || 'unidad',
        cantidad: qty,
        precioVenta: p.precioVenta ?? null,
        precioCosto: p.precioCosto ?? null,
        fechaVencimiento: p.fechaVencimiento || null
      };
    })
    .filter(i => i.cantidad > 0);

  if (items.length === 0) {
    toast('Selecciona al menos un producto con cantidad mayor a 0', 'aviso');
    return;
  }

  pedidos.unshift({
    id: genId(),
    creadoEn: new Date().toISOString(),
    estado: 'nuevo',
    enviadoEn: null,
    recibidoEn: null,
    items
  });
  guardarPedidos();
  renderPedidos();
  toast('📦 Pedido creado correctamente');
}

// ─── ACCIONES DE LA BODEGA ───

function marcarPendiente(id) {
  const pedido = pedidos.find(p => p.id === id);
  if (!pedido || pedido.estado !== 'nuevo') return;
  pedido.estado = 'pendiente';
  guardarPedidos();
  renderPedidos();
  toast('⏳ Pedido marcado como pendiente');
}

function marcarEnviado(id) {
  const pedido = pedidos.find(p => p.id === id);
  if (!pedido || pedido.estado !== 'pendiente') return;

  // Validar que la bodega tenga el stock solicitado
  const faltantes = pedido.items
    .map(item => {
      const p = productos.find(x => x.id === item.productoId);
      return { item, disp: p ? (p.stock || 0) : 0 };
    })
    .filter(({ item, disp }) => disp < item.cantidad);

  if (faltantes.length > 0) {
    const lista = faltantes.map(f => `${f.item.nombre} (hay ${f.disp}, piden ${f.item.cantidad})`).join(' · ');
    toast('Stock insuficiente en bodega: ' + lista, 'error');
    return;
  }

  pedido.estado = 'enviado';
  pedido.enviadoEn = new Date().toISOString();
  guardarPedidos();
  renderPedidos();
  toast('🚚 Pedido marcado como enviado');
}

// ─── ACCIÓN DE LA TIENDA: RECIBIR PEDIDO ───

function marcarRecibido(id) {
  const pedido = pedidos.find(p => p.id === id);
  if (!pedido || pedido.estado !== 'enviado') return;

  const hoy = new Date().toISOString().slice(0, 10);
  pedido.items.forEach(item => {
    let p = productos.find(x =>
      (x.nombre || '').toLowerCase() === (item.nombre || '').toLowerCase() &&
      (x.marca || '') === (item.marca || '')
    );

    if (!p) {
      p = {
        id: genId(),
        nombre: item.nombre,
        marca: item.marca || null,
        categoria: item.categoria || 'General',
        unidad: item.unidad || 'unidad',
        precioVenta: item.precioVenta ?? null,
        precioCosto: item.precioCosto ?? null,
        stock: 0,
        stockMin: null,
        fechaVencimiento: item.fechaVencimiento || null,
        fechaAbastecimiento: hoy,
        proxAbastecimiento: null,
        proveedor: null,
        ubicacion: null,
        notas: null,
        foto: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      productos.push(p);
    }

    p.stock += item.cantidad;
    p.fechaAbastecimiento = hoy;
    p.updatedAt = new Date().toISOString();

    historialDia.unshift({
      tipo: 'abastecimiento',
      productoId: p.id,
      nombre: p.nombre,
      cantidad: item.cantidad,
      unidad: p.unidad || 'unid.',
      precioVenta: p.precioVenta,
      total: null,
      hora: new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
    });
  });

  pedido.estado = 'recibido';
  pedido.recibidoEn = new Date().toISOString();

  guardarEnStorage();
  guardarHistorial();
  guardarPedidos();
  descontarStockBodega(pedido);

  renderPedidos();
  if (paginaActual === 'inventario') renderTabla();
  if (paginaActual === 'dashboard') renderDashboard();
  toast('✅ Pedido recibido. Stock de la tienda actualizado.');
}

// ─── DESCUENTO CRUZADO DEL STOCK DE LA BODEGA ───

function descontarStockBodega(pedido) {
  const bodega = leerProductosOtroModo('bodega');
  pedido.items.forEach(item => {
    const p = bodega.find(x => x.id === item.productoId);
    if (p) {
      p.stock = Math.max(0, (p.stock || 0) - item.cantidad);
      p.updatedAt = new Date().toISOString();
    }
  });

  localStorage.setItem('tf_productos_bodega', JSON.stringify(bodega));

  if (typeof uidActual !== 'undefined' && uidActual &&
      typeof syncHabilitado !== 'undefined' && syncHabilitado &&
      typeof db !== 'undefined') {
    const obj = {};
    bodega.forEach(p => { obj[p.id] = p; });
    db.ref('usuarios/' + uidActual + '/productos/bodega')
      .set(obj)
      .catch(err => console.error('Error descontando stock de bodega en Firebase:', err));
  }
}

// ─── INICIALIZACIÓN ───
cargarPedidosDeStorage();