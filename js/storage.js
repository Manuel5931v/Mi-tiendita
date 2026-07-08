// ═══════════════════════════════════════
//  PERSISTENCIA (localStorage)
// ═══════════════════════════════════════

let productos = [];
let config = {
  nombreTienda: 'Mi Tienda',
  moneda: '$',
  umbralStock: 5,
  diasAviso: 15,
  categorias: ['Alimentos', 'Bebidas', 'Limpieza', 'Cuidado personal', 'Papelería', 'Otros'],
  ubicaciones: ['Despensa', 'Refrigerador', 'Congelador', 'Baño', 'Lavandería', 'Dormitorio', 'Garaje', 'Otro']
};

function guardarEnStorage() {
  localStorage.setItem('tf_productos', JSON.stringify(productos));
  localStorage.setItem('tf_config', JSON.stringify(config));
  localStorage.setItem('tf_modo', modoApp);
}

function cargarDeStorage() {
  try {
    const p = localStorage.getItem('tf_productos');
    const c = localStorage.getItem('tf_config');
    const m = localStorage.getItem('tf_modo');
    if (p) productos = JSON.parse(p);
    if (c) config = { ...config, ...JSON.parse(c) };
    if (m) modoApp = m;
  } catch(e) { console.warn('Error cargando datos', e); }
}

function cargarHistorialDeStorage() {
  try {
    const hoy = new Date().toISOString().slice(0, 10);
    const raw = localStorage.getItem('tf_historial_' + hoy);
    if (raw) historialDia = JSON.parse(raw);
    else historialDia = [];
  } catch(e) { historialDia = []; }
}

function guardarHistorial() {
  const hoy = new Date().toISOString().slice(0, 10);
  localStorage.setItem('tf_historial_' + hoy, JSON.stringify(historialDia));
}

function exportarDatos() {
  const datos = { productos, config, exportadoEn: new Date().toISOString() };
  const blob = new Blob([JSON.stringify(datos, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'tiendafacil-respaldo-' + new Date().toISOString().slice(0,10) + '.json';
  a.click();
  URL.revokeObjectURL(url);
  toast('Datos exportados correctamente');
}

function importarDatos(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const datos = JSON.parse(e.target.result);
      if (!datos.productos) throw new Error('Formato inválido');
      productos = datos.productos;
      if (datos.config) config = { ...config, ...datos.config };
      guardarEnStorage();
      renderConfig();
      toast(`Importados ${productos.length} productos correctamente`);
    } catch(err) {
      toast('Error al importar: archivo inválido', 'error');
    }
  };
  reader.readAsText(file);
  event.target.value = '';
}

function borrarTodo() {
  if (!confirm('⚠️ ¿Seguro/a? Se borrarán TODOS los productos y configuraciones. Esta acción no se puede deshacer.')) return;
  productos = [];
  config = { nombreTienda: 'Mi Tienda', moneda: '$', umbralStock: 5, diasAviso: 15,
    categorias: ['Alimentos', 'Bebidas', 'Limpieza', 'Cuidado personal', 'Papelería', 'Otros'] };
  guardarEnStorage();
  renderConfig();
  toast('Todos los datos han sido borrados', 'aviso');
}