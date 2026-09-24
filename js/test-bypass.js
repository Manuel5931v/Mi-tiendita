/* ═══════════════════════════════════════
   🧪 MODO PRUEBAS — SOLO PARA DESARROLLO
   Desbloquea las funciones premium (pedidos,
   sync) SIN usar Firebase. No sube ni baja
   nada de la nube: todo queda en localStorage.
   FIX 2026-09-13: Hace pedidosHabilitados siempre true
   y asegura que syncHabilitado no sea apagado por
   el listener de Firebase (race condition).
   ═══════════════════════════════════════ */
(function () {
  // 1) Desbloquear funciones premium — forzar true
  syncHabilitado = true;

  // 1b) Gate directo: pedidos siempre habilitados en modo pruebas
  // Esto es la clave del bug: aunque Firebase ponga syncHabilitado=false,
  // pedidosHabilitados() seguirá retornando true.
  pedidosHabilitados = function () { return true; };

  // 2) Nunca escribir en la nube durante las pruebas
  if (typeof guardarEnFirebase === 'function') guardarEnFirebase = function () {};
  if (typeof guardarHistorialEnFirebase === 'function') guardarHistorialEnFirebase = function () {};
  if (typeof guardarPedidosEnFirebase === 'function') guardarPedidosEnFirebase = function () {};

  // 3) No verificar membresía (evita que apague el bypass y evita leer la nube)
  // FIX: en vez de noop, fuerza sync true y limpia listener previo
  if (typeof verificarYEscucharMembresia === 'function') {
    verificarYEscucharMembresia = function (uid) {
      syncHabilitado = true;
      try {
        if (typeof _membresiaListenerRef !== 'undefined' && _membresiaListenerRef) {
          _membresiaListenerRef.off();
          _membresiaListenerRef = null;
        }
      } catch (e) {}
      if (typeof actualizarBadgePedidos === 'function') actualizarBadgePedidos();
      if (typeof actualizarUIEstadoCuenta === 'function') actualizarUIEstadoCuenta();
    };
  }
  // Limpiar listener que Firebase ya pudo haber registrado antes del override
  try {
    if (typeof _membresiaListenerRef !== 'undefined' && _membresiaListenerRef) {
      _membresiaListenerRef.off();
      _membresiaListenerRef = null;
    }
  } catch (e) {}

  // 4) El descuento cruzado de stock de la bodega tampoco debe tocar Firebase
  if (typeof descontarStockBodega === 'function') {
    var originalDescuento = descontarStockBodega;
    descontarStockBodega = function (pedido) {
      var uidPrev = (typeof uidActual !== 'undefined') ? uidActual : null;
      try { if (typeof uidActual !== 'undefined') uidActual = null; originalDescuento(pedido); } finally { if (typeof uidActual !== 'undefined') uidActual = uidPrev; }
    };
  }

  // 5) Mantener el bypass activo ante cualquier cambio de sesión
  if (typeof actualizarUIEstadoCuenta === 'function') {
    var originalUI = actualizarUIEstadoCuenta;
    actualizarUIEstadoCuenta = function () {
      syncHabilitado = true;
      originalUI();
      var el = document.getElementById('estadoCuenta');
      if (el) el.textContent = '🧪 Modo pruebas — funciones premium desbloqueadas';
      if (typeof actualizarBadgePedidos === 'function') actualizarBadgePedidos();
    };
  }

  // 5b) Listener extra para auth: siempre forzar sync true (cubre race condition)
  try {
    if (typeof auth !== 'undefined' && auth && typeof auth.onAuthStateChanged === 'function') {
      auth.onAuthStateChanged(function (user) {
        syncHabilitado = true;
        if (user && typeof uidActual !== 'undefined') uidActual = user.uid;
        if (typeof actualizarBadgePedidos === 'function') actualizarBadgePedidos();
        if (typeof actualizarUIEstadoCuenta === 'function') actualizarUIEstadoCuenta();
      });
    }
  } catch (e) {}

  // 6) Indicadores visuales de que estamos en modo pruebas
  if (typeof actualizarBadgePedidos === 'function') actualizarBadgePedidos();
  if (typeof actualizarUIEstadoCuenta === 'function') actualizarUIEstadoCuenta();
  if (typeof toast === 'function') {
    setTimeout(function () {
      toast('🧪 Modo pruebas: funciones premium desbloqueadas (sin Firebase)', 'aviso');
    }, 800);
  }
})();
