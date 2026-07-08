// ═══════════════════════════════════════
//  UTILIDADES
// ═══════════════════════════════════════

function genId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function formatPrecio(n) {
  if (n === undefined || n === null || n === '') return '—';
  return config.moneda + parseFloat(n).toFixed(2);
}

function diasHastaFecha(fechaStr) {
  if (!fechaStr) return null;
  const hoy = new Date(); hoy.setHours(0,0,0,0);
  const fecha = new Date(fechaStr + 'T00:00:00');
  return Math.round((fecha - hoy) / (1000 * 60 * 60 * 24));
}

function claseFecha(dias) {
  if (dias === null) return '';
  if (dias < 0) return 'fecha-vencida';
  if (dias <= config.diasAviso) return 'fecha-pronto';
  return 'fecha-ok';
}

function textoFecha(fechaStr) {
  if (!fechaStr) return null;
  const dias = diasHastaFecha(fechaStr);
  if (dias < 0) return `Vencido (${Math.abs(dias)}d)`;
  if (dias === 0) return 'Vence hoy';
  if (dias <= config.diasAviso) return `${dias} días`;
  const [y, m, d] = fechaStr.split('-');
  return `${d}/${m}/${y}`;
}

function claseStock(producto) {
  const umbral = producto.stockMin ?? config.umbralStock;
  if (producto.stock <= 0) return 'agotado';
  if (producto.stock <= umbral) return 'bajo';
  return 'ok';
}

function toast(msg, tipo = 'ok') {
  const c = document.getElementById('toastContainer');
  const t = document.createElement('div');
  t.className = 'toast' + (tipo === 'error' ? ' error' : tipo === 'aviso' ? ' aviso' : '');
  t.innerHTML = (tipo === 'error' ? '❌' : tipo === 'aviso' ? '⚠️' : '✅') + ' ' + msg;
  c.appendChild(t);
  setTimeout(() => t.remove(), 3000);
}

function escHtml(str) {
  return (str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function formatearFechaMostrar(fechaStr) {
  if (!fechaStr) return '';
  const [y, m, d] = fechaStr.split('-');
  return `${d}/${m}/${y}`;
}