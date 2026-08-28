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

function claveModo() {
  // 'hogar' era el valor antiguo del modo bodega; se migra a 'bodega' al cargar
  return (modoApp === 'bodega' || modoApp === 'hogar') ? 'bodega' : 'tienda';
}

function guardarEnStorage() {
  const clave = claveModo();
  localStorage.setItem('tf_productos_' + clave, JSON.stringify(productos));
  localStorage.setItem('tf_config_' + clave, JSON.stringify(config));
  localStorage.setItem('tf_modo', modoApp);
  
  // Sincronizar con Firebase si está habilitado
  if (typeof guardarEnFirebase === 'function') {
    guardarEnFirebase();
  }
}

function cargarDeStorage() {
  try {
    let m = localStorage.getItem('tf_modo');
    if (m === 'hogar') {
      // Migración: 'hogar' pasó a llamarse 'bodega'
      m = 'bodega';
      localStorage.setItem('tf_modo', m);
    }
    if (m) modoApp = m;

    const clave = claveModo();
    let p = localStorage.getItem('tf_productos_' + clave);
    let c = localStorage.getItem('tf_config_' + clave);

    // Migración: datos de la versión anterior (una sola lista compartida)
    if (p === null) p = localStorage.getItem('tf_productos');
    if (c === null) c = localStorage.getItem('tf_config');

    if (p) productos = JSON.parse(p);
    if (c) config = { ...config, ...JSON.parse(c) };
    if (typeof cargarSugerenciasDeStorage === 'function') cargarSugerenciasDeStorage();
  } catch(e) { console.warn('Error cargando datos', e); }
}

function cargarHistorialDeStorage() {
  try {
    const hoy = new Date().toISOString().slice(0, 10);
    let raw = localStorage.getItem('tf_historial_' + claveModo() + '_' + hoy);
    if (raw === null) raw = localStorage.getItem('tf_historial_' + hoy); // migración
    if (raw) historialDia = JSON.parse(raw);
    else historialDia = [];
  } catch(e) { historialDia = []; }
}
1
function guardarHistorial() {
  const hoy = new Date().toISOString().slice(0, 10);
  localStorage.setItem('tf_historial_' + claveModo() + '_' + hoy, JSON.stringify(historialDia));
  
  // Sincronizar con Firebase si está habilitado
  if (typeof guardarHistorialEnFirebase === 'function') {
    guardarHistorialEnFirebase();
  }
}

function exportarDatos() {
  const datos = { productos, config, pedidos: (typeof pedidos !== 'undefined') ? pedidos : [], exportadoEn: new Date().toISOString() };
  const blob = new Blob([JSON.stringify(datos, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'Mi-guardado' + new Date().toISOString().slice(0,10) + '.json';
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
      if (typeof pedidos !== 'undefined' && Array.isArray(datos.pedidos)) {
        pedidos = datos.pedidos;
        if (typeof guardarPedidos === 'function') guardarPedidos();
      }
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
  sugerenciasIA = [];
  if (typeof guardarSugerenciasIA === 'function') guardarSugerenciasIA();
  if (typeof pedidos !== 'undefined') {
    pedidos = [];
    if (typeof guardarPedidos === 'function') guardarPedidos();
  }
  guardarEnStorage();
  renderConfig();
  toast('Todos los datos han sido borrados', 'aviso');
}