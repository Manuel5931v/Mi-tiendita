// ═══════════════════════════════════════
//  REPORTES
// ═══════════════════════════════════════

function renderReportes() {
  // Valor del inventario
  const totalVenta = productos.reduce((sum, p) => sum + (p.precioVenta || 0) * p.stock, 0);
  const totalCosto = productos.filter(p => p.precioCosto).reduce((sum, p) => sum + (p.precioCosto || 0) * p.stock, 0);
  const gananciaEst = totalVenta - totalCosto;

  document.getElementById('reporteValor').innerHTML = `
    <ul class="top-productos">
      <li><span class="nombre">Valor a precio de venta</span><span class="valor" style="color:var(--verde)">${formatPrecio(totalVenta)}</span></li>
      <li><span class="nombre">Valor a precio de costo</span><span class="valor" style="color:var(--texto-suave)">${totalCosto > 0 ? formatPrecio(totalCosto) : 'N/A'}</span></li>
      <li><span class="nombre">Ganancia estimada</span><span class="valor" style="color:var(--naranja)">${totalCosto > 0 ? formatPrecio(gananciaEst) : 'N/A'}</span></li>
      <li><span class="nombre">Total de productos</span><span class="valor">${productos.length}</span></li>
    </ul>
  `;

  // Bajo stock
  const bajos = productos.filter(p => {
    const umbral = p.stockMin ?? config.umbralStock;
    return p.stock <= umbral;
  }).sort((a,b) => a.stock - b.stock);

  document.getElementById('reporteBajoStock').innerHTML = bajos.length === 0
    ? '<p style="color:var(--texto-suave);font-size:0.88rem;">✅ Todos los productos tienen stock suficiente.</p>'
    : '<ul class="top-productos">' + bajos.slice(0,8).map(p => `
      <li>
        <span class="nombre">${escHtml(p.nombre)}</span>
        <span class="stock-badge stock-${claseStock(p)}">${p.stock} ${p.unidad||''}</span>
      </li>`).join('') + '</ul>';

  // Vencidos
  const hoy = new Date(); hoy.setHours(0,0,0,0);
  const vencidos = productos.filter(p => p.fechaVencimiento && new Date(p.fechaVencimiento + 'T00:00:00') < hoy);
  document.getElementById('reporteVencidos').innerHTML = vencidos.length === 0
    ? '<p style="color:var(--texto-suave);font-size:0.88rem;">✅ No hay productos vencidos.</p>'
    : '<ul class="top-productos">' + vencidos.map(p => `
      <li>
        <span class="nombre">${escHtml(p.nombre)}</span>
        <span class="fecha-badge fecha-vencida">${textoFecha(p.fechaVencimiento)}</span>
      </li>`).join('') + '</ul>';

  // Por categoría
  const catMap = {};
  productos.forEach(p => {
    const c = p.categoria || 'Sin categoría';
    if (!catMap[c]) catMap[c] = { count: 0, valor: 0 };
    catMap[c].count++;
    catMap[c].valor += (p.precioVenta || 0) * p.stock;
  });
  document.getElementById('reporteCategorias').innerHTML = Object.keys(catMap).length === 0
    ? '<p style="color:var(--texto-suave);font-size:0.88rem;">Sin datos aún.</p>'
    : '<ul class="top-productos">' + Object.entries(catMap).sort((a,b)=>b[1].count-a[1].count).map(([c, d]) => `
      <li>
        <span class="nombre">${c} <span style="font-weight:400;color:var(--texto-suave)">(${d.count})</span></span>
        <span class="valor">${formatPrecio(d.valor)}</span>
      </li>`).join('') + '</ul>';
}