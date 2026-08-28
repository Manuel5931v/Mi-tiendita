// ═══════════════════════════════════════
//  DASHBOARD
// ═══════════════════════════════════════

function renderDashboard() {
  // Fecha
  const hoy = new Date();
  document.getElementById('fechaHoy').textContent = hoy.toLocaleDateString('es-ES', { weekday:'long', day:'numeric', month:'long' });

  // Saludo personalizado si el usuario está logueado
  const bienvenida = document.querySelector('.bienvenida h1');
  if (bienvenida && typeof uidActual !== 'undefined' && uidActual) {
    // Obtener el nombre del usuario de Firebase Auth
    if (typeof auth !== 'undefined' && auth.currentUser) {
      const user = auth.currentUser;
      const nombre = user.displayName || user.email?.split('@')[0] || 'Usuario';
      bienvenida.textContent = `¡Hola, ${nombre}! 👋`;
    }
  } else if (bienvenida) {
    bienvenida.textContent = '¡Bienvenida/o! 👋';
  }

  // Stats
  const total = productos.length;
  const agotados = productos.filter(p => p.stock <= 0).length;
  const bajoStock = productos.filter(p => p.stock > 0 && p.stock <= (p.stockMin ?? config.umbralStock)).length;
  const vencidos = productos.filter(p => p.fechaVencimiento && diasHastaFecha(p.fechaVencimiento) < 0).length;
  const proxVencer = productos.filter(p => p.fechaVencimiento && diasHastaFecha(p.fechaVencimiento) >= 0 && diasHastaFecha(p.fechaVencimiento) <= config.diasAviso).length;

  const sg = document.getElementById('statsGrid');
  
  if (esModoBodega()) {
    // Modo Bodega: stats simplificados sin información financiera
    sg.innerHTML = `
      <div class="stat-card verde stat-click" onclick="abrirInventarioFiltrado('')">
        <span class="stat-icono">📦</span>
        <div class="stat-numero">${total}</div>
        <div class="stat-label">Productos</div>
      </div>
      <div class="stat-card rojo stat-click" onclick="abrirInventarioFiltrado('agotado')">
        <span class="stat-icono">🚫</span>
        <div class="stat-numero">${agotados}</div>
        <div class="stat-label">Agotados</div>
      </div>
      <div class="stat-card naranja stat-click" onclick="abrirInventarioFiltrado('vencido')">
        <span class="stat-icono">📅</span>
        <div class="stat-numero">${vencidos}</div>
        <div class="stat-label">Vencidos</div>
      </div>
      <div class="stat-card amarillo stat-click" onclick="abrirInventarioFiltrado('proximo')">
        <span class="stat-icono">⏰</span>
        <div class="stat-numero">${proxVencer}</div>
        <div class="stat-label">Por Vencer</div>
      </div>
    `;
  } else {
    // Modo Negocio: stats originales
    sg.innerHTML = `
      <div class="stat-card verde stat-click" onclick="abrirInventarioFiltrado('')">
        <span class="stat-icono">📦</span>
        <div class="stat-numero">${total}</div>
        <div class="stat-label">Productos</div>
      </div>
      <div class="stat-card rojo stat-click" onclick="abrirInventarioFiltrado('agotado')">
        <span class="stat-icono">🚫</span>
        <div class="stat-numero">${agotados}</div>
        <div class="stat-label">Agotados</div>
      </div>
      <div class="stat-card amarillo stat-click" onclick="abrirInventarioFiltrado('bajo')">
        <span class="stat-icono">⚠️</span>
        <div class="stat-numero">${bajoStock}</div>
        <div class="stat-label">Stock Bajo</div>
      </div>
      <div class="stat-card naranja stat-click" onclick="abrirInventarioFiltrado('vencido')">
        <span class="stat-icono">📅</span>
        <div class="stat-numero">${vencidos}</div>
        <div class="stat-label">Vencidos</div>
      </div>
    `;
  }

  // Alertas
  const alertas = [];
  productos.forEach(p => {
    if (p.fechaVencimiento) {
      const dias = diasHastaFecha(p.fechaVencimiento);
      if (dias < 0) alertas.push({ tipo: 'vencido', nombre: p.nombre, extra: `Venció hace ${Math.abs(dias)} día(s)` });
      else if (dias <= config.diasAviso) alertas.push({ tipo: 'proximo', nombre: p.nombre, extra: `Vence en ${dias} día(s)` });
    }
    const cs = claseStock(p);
    if (cs === 'agotado') alertas.push({ tipo: 'bajo-stock', nombre: p.nombre, extra: `Stock agotado` });
    else if (cs === 'bajo') alertas.push({ tipo: 'bajo-stock', nombre: p.nombre, extra: `Solo ${p.stock} ${p.unidad || 'unid.'}` });
  });

  const as = document.getElementById('alertasSection');
  if (alertas.length === 0) {
    as.innerHTML = `<div class="alerta" style="background:#E8F5E9; border-left:4px solid #4CAF50;">
      <span class="alerta-icon">✅</span>
      <div class="alerta-texto"><strong>¡Todo en orden!</strong><span>No hay alertas pendientes.</span></div>
    </div>`;
  } else {
    const mostrar = alertas.slice(0, 5);
    as.innerHTML = mostrar.map(a => `
      <div class="alerta ${a.tipo}">
        <span class="alerta-icon">${a.tipo === 'vencido' ? '🔴' : a.tipo === 'proximo' ? '🟠' : '🟡'}</span>
        <div class="alerta-texto"><strong>${a.nombre}</strong><span>${a.extra}</span></div>
      </div>
    `).join('') + (alertas.length > 5 ? `<p style="color:var(--texto-suave);font-size:0.83rem;text-align:center;margin-top:4px;">Y ${alertas.length - 5} alertas más...</p>` : '');
  }

  // Categorías
  const catMap = {};
  productos.forEach(p => {
    const c = p.categoria || 'Sin categoría';
    catMap[c] = (catMap[c] || 0) + 1;
  });
  const dc = document.getElementById('dashCategorias');
  if (Object.keys(catMap).length === 0) {
    dc.innerHTML = '<p style="color:var(--texto-suave);font-size:0.88rem;">Sin productos aún.</p>';
  } else {
    const max = Math.max(...Object.values(catMap));
    dc.innerHTML = '<ul class="top-productos">' +
      Object.entries(catMap).sort((a,b)=>b[1]-a[1]).map(([cat, cnt]) => `
        <li>
          <div style="flex:1">
            <span class="nombre">${cat}</span>
            <div class="barra-progreso"><div class="barra-fill" style="width:${(cnt/max*100).toFixed(0)}%"></div></div>
          </div>
          <span class="valor" style="margin-left:16px">${cnt}</span>
        </li>
      `).join('') + '</ul>';
  }

  // Vencimientos próximos 30 días
  const prox30 = productos
    .filter(p => p.fechaVencimiento && diasHastaFecha(p.fechaVencimiento) >= 0 && diasHastaFecha(p.fechaVencimiento) <= 30)
    .sort((a,b) => diasHastaFecha(a.fechaVencimiento) - diasHastaFecha(b.fechaVencimiento));

  const dv = document.getElementById('dashVencimientos');
  if (prox30.length === 0) {
    dv.innerHTML = '<p style="color:var(--texto-suave);font-size:0.88rem;">✅ Ningún producto vence en los próximos 30 días.</p>';
  } else {
    dv.innerHTML = '<ul class="top-productos">' +
      prox30.slice(0, 6).map(p => {
        const dias = diasHastaFecha(p.fechaVencimiento);
        return `<li>
          <span class="nombre">${p.nombre}</span>
          <span class="fecha-badge ${dias <= 7 ? 'fecha-pronto' : 'fecha-ok'}">${dias === 0 ? 'Hoy' : dias + 'd'}</span>
        </li>`;
      }).join('') + '</ul>';
  }

  // Predicción de agotamiento (IA)
  if (typeof renderPrediccionDashboard === 'function') renderPrediccionDashboard();
}