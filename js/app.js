// ═══════════════════════════════════════
//  INICIALIZACIÓN Y ARRANQUE
// ═══════════════════════════════════════

function cargarDemoSiVacio() {
  if (productos.length > 0) return;
  // Solo cargar la demo en la primera ejecución (si no hay datos guardados en ningún modo)
  const tieneDatosPrevios = ['tienda', 'bodega'].some(k => localStorage.getItem('tf_productos_' + k)) || localStorage.getItem('tf_productos');
  if (tieneDatosPrevios) return;
  const hoy = new Date();
  const enDias = (d) => {
    const f = new Date(hoy); f.setDate(f.getDate() + d);
    return f.toISOString().slice(0,10);
  };
  productos = [
    { id: genId(), nombre: 'Frijoles negros 1 lb', categoria: 'Alimentos', unidad: 'bolsa', precioVenta: 1.25, precioCosto: 0.80, stock: 15, stockMin: 5, fechaVencimiento: enDias(120), fechaAbastecimiento: enDias(-10), proxAbastecimiento: enDias(20), proveedor: 'Mercado Central', notas: null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
    { id: genId(), nombre: 'Arroz blanco 5 lb', categoria: 'Alimentos', unidad: 'bolsa', precioVenta: 3.50, precioCosto: 2.20, stock: 8, stockMin: 4, fechaVencimiento: enDias(200), fechaAbastecimiento: enDias(-5), proxAbastecimiento: enDias(25), proveedor: 'Distribuidora XYZ', notas: null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
    { id: genId(), nombre: 'Leche entera 1L', categoria: 'Bebidas', unidad: 'caja', precioVenta: 1.15, precioCosto: 0.85, stock: 3, stockMin: 5, fechaVencimiento: enDias(10), fechaAbastecimiento: enDias(-3), proxAbastecimiento: enDias(4), proveedor: 'Lácteos del Valle', notas: 'Revisar temperatura de almacenaje', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
    { id: genId(), nombre: 'Aceite de cocina 1L', categoria: 'Alimentos', unidad: 'botella', precioVenta: 2.75, precioCosto: 1.90, stock: 6, stockMin: 3, fechaVencimiento: enDias(365), fechaAbastecimiento: enDias(-20), proxAbastecimiento: enDias(40), proveedor: null, notas: null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
    { id: genId(), nombre: 'Jabón de baño x3', categoria: 'Cuidado personal', unidad: 'paquete', precioVenta: 1.80, precioCosto: 1.10, stock: 0, stockMin: 3, fechaVencimiento: null, fechaAbastecimiento: enDias(-30), proxAbastecimiento: enDias(2), proveedor: 'Super Ventas', notas: null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
    { id: genId(), nombre: 'Detergente líquido 500ml', categoria: 'Limpieza', unidad: 'botella', precioVenta: 2.25, precioCosto: 1.40, stock: 4, stockMin: 3, fechaVencimiento: enDias(5), fechaAbastecimiento: enDias(-15), proxAbastecimiento: enDias(7), proveedor: 'Distribuidora Limpia', notas: null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  ];
  guardarEnStorage();
}

// ─── INICIALIZACIÓN ────────────────────────────────

// Usar iniciarApp() de Firebase si está disponible, sino usar el método tradicional
if (typeof iniciarApp === 'function') {
  iniciarApp();
} else {
  cargarDeStorage();
  cargarHistorialDeStorage();
  cargarDemoSiVacio();

  // Inicializar modo
  if (modoApp) {
    aplicarModo();
  } else {
    mostrarSelectorModo();
  }

  if (modoApp) renderDashboard();
}

// ─── EVENT LISTENERS ────────────────────────────────

// Enter en categoría
document.getElementById('nuevaCatInput').addEventListener('keypress', function(e) {
  if (e.key === 'Enter') agregarCategoria();
});