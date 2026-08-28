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

// ═══════════════════════════════════════
//  REPORTE PDF DEL DÍA
// ═══════════════════════════════════════

function descargarReportePDF() {
  const { jsPDF } = window.jspdf || {};
  if (!jsPDF) {
    toast('No se pudo cargar la librería de PDF. Revisa tu conexión a internet.', 'error');
    return;
  }

  const doc = new jsPDF();
  const ancho = doc.internal.pageSize.getWidth();
  const margen = 14;
  let y = 20;

  const hoy = new Date();
  const fechaLarga = hoy.toLocaleDateString('es-ES', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  const fechaArchivo = hoy.toISOString().slice(0, 10);

  // Datos del día
  const ventas = historialDia.filter(h => h.tipo === 'venta');
  const abastecimientos = historialDia.filter(h => h.tipo === 'abastecimiento');
  const totalDinero = ventas.reduce((s, h) => s + (h.total || 0), 0);
  const unidadesVendidas = ventas.reduce((s, h) => s + h.cantidad, 0);
  const unidadesAbastecidas = abastecimientos.reduce((s, h) => s + h.cantidad, 0);
  const hoyMidnight = new Date(); hoyMidnight.setHours(0,0,0,0);
  const bajos = productos.filter(p => p.stock <= (p.stockMin ?? config.umbralStock)).length;
  const vencidos = productos.filter(p => p.fechaVencimiento && new Date(p.fechaVencimiento + 'T00:00:00') < hoyMidnight).length;

  // ─── Encabezado ───
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text((config.nombreTienda || 'Mi Tienda').toUpperCase(), margen, y);
  y += 7;
  doc.setFontSize(13);
  doc.text('Reporte de ventas del día', margen, y);
  y += 6;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(100);
  doc.text(fechaLarga.charAt(0).toUpperCase() + fechaLarga.slice(1), margen, y);
  y += 5;
  doc.text('Modo: ' + (esModoNegocio() ? 'Negocio' : 'Bodega') + '   ·   Generado: ' + hoy.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }), margen, y);
  doc.setTextColor(0);
  y += 6;
  doc.setDrawColor(80);
  doc.line(margen, y, ancho - margen, y);
  y += 8;

  // ─── Resumen del día ───
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text('RESUMEN DEL DÍA', margen, y);
  y += 6;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  const resumen = [
    ['Ventas registradas', String(ventas.length)],
    ['Unidades vendidas', String(unidadesVendidas)],
    ['Total vendido', formatPrecio(totalDinero)],
    ['Abastecimientos', String(abastecimientos.length)],
    ['Unidades abastecidas', String(unidadesAbastecidas)],
    ['Productos en inventario', String(productos.length)],
    ['Productos con stock bajo', String(bajos)],
    ['Productos vencidos', String(vencidos)]
  ];
  resumen.forEach(([k, v]) => {
    doc.setFont('helvetica', 'normal');
    doc.text(k, margen + 2, y);
    doc.setFont('helvetica', 'bold');
    doc.text(v, ancho - margen - 2, y, { align: 'right' });
    y += 5.5;
  });
  y += 4;
  doc.setDrawColor(200);
  doc.line(margen, y, ancho - margen, y);
  y += 8;

  // ─── Productos vendidos (agrupados) ───
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text('PRODUCTOS VENDIDOS', margen, y);
  y += 6;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);

  const porProducto = {};
  ventas.forEach(h => {
    if (!porProducto[h.nombre]) porProducto[h.nombre] = { cantidad: 0, total: 0, unidad: h.unidad };
    porProducto[h.nombre].cantidad += h.cantidad;
    porProducto[h.nombre].total += (h.total || 0);
  });
  const vendidos = Object.entries(porProducto).sort((a, b) => b[1].total - a[1].total);

  if (vendidos.length === 0) {
    doc.setTextColor(100);
    doc.text('No se registraron ventas hoy.', margen + 2, y);
    doc.setTextColor(0);
    y += 6;
  } else {
    vendidos.forEach(([nombre, d]) => {
      if (y > 262) { doc.addPage(); y = 20; }
      const lineas = doc.splitTextToSize(nombre, ancho - margen - 30);
      doc.setFont('helvetica', 'bold');
      doc.text(lineas, margen + 2, y);
      y += lineas.length * 5 + 1;
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(100);
      doc.text(`Cantidad: ${d.cantidad} ${d.unidad} · Precio unitario: ${formatPrecio(d.total / d.cantidad)} · Total: ${formatPrecio(d.total)}`, margen + 4, y);
      doc.setTextColor(0);
      y += 9;
    });
  }
  y += 4;
  doc.setDrawColor(200);
  doc.line(margen, y, ancho - margen, y);
  y += 8;

  // ─── Abastecimientos del día ───
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text('ABASTECIMIENTOS DEL DÍA', margen, y);
  y += 6;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  if (abastecimientos.length === 0) {
    doc.setTextColor(100);
    doc.text('No se abastecieron productos hoy.', margen + 2, y);
    doc.setTextColor(0);
    y += 6;
  } else {
    abastecimientos.forEach(h => {
      if (y > 272) { doc.addPage(); y = 20; }
      const lineas = doc.splitTextToSize(`+${h.cantidad} ${h.unidad}  —  ${h.nombre}`, ancho - margen - 30);
      doc.text(lineas, margen + 2, y);
      y += lineas.length * 5 + 2;
    });
  }
  y += 4;
  doc.setDrawColor(200);
  doc.line(margen, y, ancho - margen, y);
  y += 8;

  // ─── Valor del inventario ───
  const totalVenta = productos.reduce((s, p) => s + (p.precioVenta || 0) * p.stock, 0);
  const totalCosto = productos.filter(p => p.precioCosto).reduce((s, p) => s + (p.precioCosto || 0) * p.stock, 0);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text('VALOR DEL INVENTARIO', margen, y);
  y += 6;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  [
    ['Valor a precio de venta', formatPrecio(totalVenta)],
    ['Valor a precio de costo', totalCosto > 0 ? formatPrecio(totalCosto) : 'N/A'],
    ['Ganancia estimada', totalCosto > 0 ? formatPrecio(totalVenta - totalCosto) : 'N/A']
  ].forEach(([k, v]) => {
    doc.text(k, margen + 2, y);
    doc.setFont('helvetica', 'bold');
    doc.text(v, ancho - margen - 2, y, { align: 'right' });
    doc.setFont('helvetica', 'normal');
    y += 5.5;
  });

  doc.save(`reporte-ventas-${fechaArchivo}.pdf`);
  toast('PDF descargado correctamente');
}