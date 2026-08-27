// ═══════════════════════════════════════
//  ASISTENTE IA — StockIA
//  Implementa las dos funciones de IA descritas en el
//  Entregable 2:
//   1) Análisis predictivo de datos (heurística local,
//      estima cuándo se agotará cada producto).
//   2) Recomendaciones inteligentes (llama a la API de
//      Gemini con el historial resumido como contexto,
//      igual que en la Figura 5: Usuario → App → BD →
//      Contexto → Motor IA → Sugerencia).
// ═══════════════════════════════════════

let sugerenciasIA = [];        // historial de sugerencias generadas (cache local)
let cargandoSugerenciaIA = false;

// -----------------------------------------------------------
// 0. PERSISTENCIA
// -----------------------------------------------------------
function cargarSugerenciasDeStorage() {
  try {
    const raw = localStorage.getItem('tf_sugerencias_ia');
    sugerenciasIA = raw ? JSON.parse(raw) : [];
  } catch (e) { sugerenciasIA = []; }
}

function guardarSugerenciasIA() {
  localStorage.setItem('tf_sugerencias_ia', JSON.stringify(sugerenciasIA.slice(0, 10)));
}

// -----------------------------------------------------------
// 1. ANÁLISIS PREDICTIVO (local, sin llamar a la IA externa)
//    Estima días restantes hasta agotamiento según el ritmo
//    real de ventas/consumo registrado en el historial.
// -----------------------------------------------------------
function obtenerMovimientosHistoricos(productoId) {
  const hist = window.historialCompleto || {};
  const hoy = new Date().toISOString().slice(0, 10);
  const combinado = { ...hist, [hoy]: historialDia };
  const movs = [];
  Object.entries(combinado).forEach(([fecha, dia]) => {
    (dia || []).forEach(m => { if (m.productoId === productoId) movs.push({ ...m, fecha }); });
  });
  return movs.sort((a, b) => a.fecha.localeCompare(b.fecha));
}

function calcularPrediccionAgotamiento(p) {
  const movs = obtenerMovimientosHistoricos(p.id);
  const ventas = movs.filter(m => m.tipo === 'venta');
  if (ventas.length < 2) return null; // datos insuficientes para predecir

  const fechas = [...new Set(ventas.map(v => v.fecha))].sort();
  const diasSpan = Math.max(1, (new Date(fechas[fechas.length - 1]) - new Date(fechas[0])) / 86400000);
  const totalVendido = ventas.reduce((s, v) => s + v.cantidad, 0);
  const promedioDiario = totalVendido / diasSpan;

  if (promedioDiario <= 0) return null;
  const diasRestantes = Math.max(0, Math.round(p.stock / promedioDiario));

  return { promedioDiario, diasRestantes };
}

function renderPrediccionDashboard() {
  const cont = document.getElementById('dashPrediccionIA');
  if (!cont) return;

  const predicciones = productos
    .map(p => ({ p, pred: calcularPrediccionAgotamiento(p) }))
    .filter(x => x.pred && x.p.stock > 0)
    .sort((a, b) => a.pred.diasRestantes - b.pred.diasRestantes)
    .slice(0, 6);

  if (predicciones.length === 0) {
    cont.innerHTML = '<p style="color:var(--texto-suave);font-size:0.88rem;">Aún no hay suficiente historial de ventas para predecir agotamientos. Registra algunas ventas en la sección "Ventas".</p>';
    return;
  }

  cont.innerHTML = '<ul class="top-productos">' + predicciones.map(({ p, pred }) => {
    const urgente = pred.diasRestantes <= 3;
    return `<li>
      <span class="nombre">${escHtml(p.nombre)}</span>
      <span class="fecha-badge ${urgente ? 'fecha-pronto' : 'fecha-ok'}">
        ${pred.diasRestantes === 0 ? 'Se agota hoy' : `~${pred.diasRestantes} día(s)`}
      </span>
    </li>`;
  }).join('') + '</ul>';
}

// -----------------------------------------------------------
// 2. CONTEXTO ESTRUCTURADO PARA LA IA (paso 4 de la Figura 5)
//    Arma un resumen legible del historial de abastecimiento
//    y consumo, tal como se describe en el documento:
//    "Arroz: comprado cada 15 días, última compra hace 14 días"
// -----------------------------------------------------------
function construirContextoIA() {
  const hoy = new Date();
  const lineas = [];

  productos.forEach(p => {
    const movs = obtenerMovimientosHistoricos(p.id);
    const abastecimientos = movs.filter(m => m.tipo === 'abastecimiento');
    const pred = calcularPrediccionAgotamiento(p);

    const ultimoAbastecimiento = abastecimientos[abastecimientos.length - 1];
    const diasDesdeUltimoAbast = ultimoAbastecimiento
      ? Math.round((hoy - new Date(ultimoAbastecimiento.fecha + 'T00:00:00')) / 86400000)
      : null;

    const diasVence = p.fechaVencimiento ? diasHastaFecha(p.fechaVencimiento) : null;

    const partes = [
      `Producto: ${p.nombre}`,
      `Stock actual: ${p.stock} ${p.unidad || 'unid.'}`,
      esModoNegocio() ? `Stock mínimo: ${p.stockMin ?? config.umbralStock}` : null,
      pred ? `Consumo estimado: ${pred.promedioDiario.toFixed(2)} ${p.unidad || 'unid.'}/día (se agotaría en ~${pred.diasRestantes} días)` : 'Consumo: sin historial suficiente',
      diasDesdeUltimoAbast !== null ? `Último abastecimiento: hace ${diasDesdeUltimoAbast} día(s)` : 'Sin registro de abastecimiento previo',
      diasVence !== null ? (diasVence < 0 ? `Vencido hace ${Math.abs(diasVence)} día(s)` : `Vence en ${diasVence} día(s)`) : null,
    ].filter(Boolean);

    lineas.push('- ' + partes.join(' | '));
  });

  return lineas.join('\n');
}

// -----------------------------------------------------------
// 3. MOTOR DE IA — llamada a Gemini vía Firebase AI Logic (paso 5)
//    A diferencia de la versión anterior (OpenAI / API key en el
//    navegador), aquí NO se maneja ninguna API key del lado del
//    cliente. El SDK de Firebase AI Logic (ver ai-firebase-bridge.js)
//    actúa como intermediario protegido con App Check, usando el
//    tier gratuito de la "Gemini Developer API". El usuario nunca
//    configura nada.
// -----------------------------------------------------------
async function obtenerSugerenciaIA() {
  if (cargandoSugerenciaIA) return;

  if (typeof window.generarConGeminiFirebase !== 'function') {
    toast('El Asistente IA todavía no está listo. Espera un momento y vuelve a intentar.', 'aviso');
    return;
  }
  if (productos.length === 0) {
    toast('Agrega productos a tu inventario antes de pedir una sugerencia', 'aviso');
    return;
  }

  cargandoSugerenciaIA = true;
  renderAsistente();

  const contexto = construirContextoIA();
  const instruccionSistema =
    'Eres el Asistente IA de Mi-Tiendita (StockIA), una app de control de inventario. ' +
    'Analizas patrones de consumo y abastecimiento y das recomendaciones breves, prácticas y en español, ' +
    'para reducir desperdicio y evitar quedarse sin productos (ODS 12).';
  const promptUsuario =
    `Este es el historial resumido de inventario de "${esModoNegocio() ? (config.nombreTienda || 'mi tienda') : 'mi bodega'}":\n\n${contexto}\n\n` +
    `Con base en estos datos, da una recomendación breve (máximo 4-5 líneas) de reabastecimiento: ` +
    `qué productos conviene reabastecer pronto y por qué, y qué productos por vencer conviene usar primero ` +
    `${esModoNegocio() ? 'o poner en promoción' : 'o trasladar primero a la tienda'}. Sé concreto y en tono cercano.`;

  try {
    const texto = (await window.generarConGeminiFirebase(instruccionSistema, promptUsuario))?.trim()
      || 'La IA no devolvió ninguna sugerencia.';

    sugerenciasIA.unshift({ texto, generadaEn: new Date().toISOString() });
    sugerenciasIA = sugerenciasIA.slice(0, 10);
    guardarSugerenciasIA();
    toast('Nueva sugerencia generada por la IA ✨');
  } catch (err) {
    console.error('Error consultando Gemini vía Firebase AI Logic:', err);
    toast('No se pudo obtener la sugerencia: ' + err.message, 'error');
  } finally {
    cargandoSugerenciaIA = false;
    renderAsistente();
  }
}

function borrarSugerenciasIA() {
  if (!confirm('¿Borrar el historial de sugerencias de la IA?')) return;
  sugerenciasIA = [];
  guardarSugerenciasIA();
  renderAsistente();
}

// -----------------------------------------------------------
// 4. RENDER de la pantalla "Asistente IA"
// -----------------------------------------------------------
function renderAsistente() {
  const cont = document.getElementById('sugerenciasIALista');
  const btn = document.getElementById('btnGenerarSugerenciaIA');
  if (!cont) return;

  if (btn) {
    btn.disabled = cargandoSugerenciaIA;
    btn.textContent = cargandoSugerenciaIA ? '🤖 Analizando historial...' : '✨ Generar sugerencia';
  }

  if (typeof window.generarConGeminiFirebase !== 'function') {
    cont.innerHTML = `<div class="empty-card">
      <span class="icono">⏳</span>
      <h3>Cargando el Asistente IA...</h3>
      <p>Si este mensaje no desaparece, revisa que <code>js/ai-firebase-bridge.js</code> esté cargando correctamente (consola del navegador).</p>
    </div>`;
    renderPrediccionAsistente();
    return;
  }

  if (sugerenciasIA.length === 0 && !cargandoSugerenciaIA) {
    cont.innerHTML = `<div class="empty-card">
      <span class="icono">🤖</span>
      <h3>Sin sugerencias todavía</h3>
      <p>Pulsa "Generar sugerencia" para que la IA analice tu historial de compras y consumo.</p>
    </div>`;
  } else if (cargandoSugerenciaIA) {
    cont.innerHTML = `<div class="empty-card">
      <span class="icono">⏳</span>
      <h3>Analizando tu inventario...</h3>
      <p>La IA está revisando tu historial de compras y consumo.</p>
    </div>`;
  } else {
    cont.innerHTML = sugerenciasIA.map(s => `
      <div class="alerta" style="align-items:flex-start; background:#EEF6FF; border-left:4px solid #3B82F6;">
        <span class="alerta-icon">🤖</span>
        <div class="alerta-texto">
          <span style="white-space:pre-line">${escHtml(s.texto)}</span>
          <span style="font-size:0.75rem; color:var(--texto-suave); margin-top:6px; display:block;">
            ${new Date(s.generadaEn).toLocaleString('es-ES')}
          </span>
        </div>
      </div>
    `).join('');
  }

  renderPrediccionAsistente();
}

function renderPrediccionAsistente() {
  const cont = document.getElementById('asistentePrediccion');
  if (!cont) return;

  const predicciones = productos
    .map(p => ({ p, pred: calcularPrediccionAgotamiento(p) }))
    .filter(x => x.pred)
    .sort((a, b) => a.pred.diasRestantes - b.pred.diasRestantes);

  if (predicciones.length === 0) {
    cont.innerHTML = '<p style="color:var(--texto-suave);font-size:0.88rem;">Registra ventas o consumo en la sección "Ventas" para que la IA pueda calcular predicciones de agotamiento.</p>';
    return;
  }

  cont.innerHTML = '<ul class="top-productos">' + predicciones.map(({ p, pred }) => {
    const urgente = pred.diasRestantes <= 3;
    return `<li>
      <span class="nombre">${escHtml(p.nombre)} <span style="font-weight:400;color:var(--texto-suave)">(${pred.promedioDiario.toFixed(1)} ${p.unidad || 'unid.'}/día)</span></span>
      <span class="fecha-badge ${urgente ? 'fecha-pronto' : 'fecha-ok'}">${pred.diasRestantes === 0 ? 'Hoy' : `~${pred.diasRestantes}d`}</span>
    </li>`;
  }).join('') + '</ul>';
}
