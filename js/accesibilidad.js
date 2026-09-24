// accesibilidad.js — Tamaño de letra (escala tipográfica)
// Persiste en localStorage 'tf_fontScale' (normal | grande | extra) — global, no por modo.
// Escala vía CSS variable --font-scale aplicada a html { font-size: calc(16px * var(--font-scale)) }

const FONT_SCALES = { normal: 1, grande: 1.12, extra: 1.25 };
const FONT_ORDER = ['normal', 'grande', 'extra'];
const FONT_LABELS = { normal: 'Normal 100%', grande: 'Grande 112%', extra: 'Extra grande 125%' };

function aplicarTamanoLetra(escala) {
  document.documentElement.style.setProperty('--font-scale', escala);
}

function actualizarBotonesFuente(nivel) {
  const ids = { normal: 'btnFontNormal', grande: 'btnFontGrande', extra: 'btnFontExtra' };
  Object.keys(ids).forEach(function(k) {
    const el = document.getElementById(ids[k]);
    if (!el) return;
    const activo = k === nivel;
    el.classList.toggle('activo', activo);
    // craft: activo usa btn-primario, inactivo btn-secundario
    if (activo) {
      el.classList.remove('btn-secundario');
      el.classList.add('btn-primario');
      el.setAttribute('aria-pressed', 'true');
    } else {
      el.classList.remove('btn-primario');
      el.classList.add('btn-secundario');
      el.setAttribute('aria-pressed', 'false');
    }
  });
  // estado deshabilitado de controles rápidos
  const idx = FONT_ORDER.indexOf(nivel);
  const dec = document.getElementById('fontDecrease');
  const inc = document.getElementById('fontIncrease');
  if (dec) dec.disabled = idx <= 0;
  if (inc) inc.disabled = idx >= FONT_ORDER.length - 1;
}

function cambiarTamanoLetra(nivel) {
  if (!FONT_SCALES[nivel]) nivel = 'normal';
  try { localStorage.setItem('tf_fontScale', nivel); } catch (e) {}
  aplicarTamanoLetra(FONT_SCALES[nivel]);
  actualizarBotonesFuente(nivel);
  if (typeof toast === 'function') toast('Tamaño de letra: ' + (FONT_LABELS[nivel] || nivel));
  try { if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons(); } catch (e) {}
  console.log('[accesibilidad] tamaño aplicado:', nivel, FONT_SCALES[nivel]);
}

function fontStep(dir) {
  let actual = 'normal';
  try { actual = localStorage.getItem('tf_fontScale') || 'normal'; } catch (e) {}
  if (FONT_ORDER.indexOf(actual) === -1) actual = 'normal';
  let idx = FONT_ORDER.indexOf(actual) + dir;
  if (idx < 0) idx = 0;
  if (idx >= FONT_ORDER.length) idx = FONT_ORDER.length - 1;
  cambiarTamanoLetra(FONT_ORDER[idx]);
}

function inicializarFuente() {
  let nivel = 'normal';
  try { nivel = localStorage.getItem('tf_fontScale') || 'normal'; } catch (e) {}
  if (!FONT_SCALES[nivel]) nivel = 'normal';
  aplicarTamanoLetra(FONT_SCALES[nivel]);
  // esperar DOM para botones
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() {
      actualizarBotonesFuente(nivel);
      try { if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons(); } catch (e) {}
    });
  } else {
    actualizarBotonesFuente(nivel);
  }
  console.log('[accesibilidad] inicializado:', nivel);
}

// init inmediato (script cargado antes de app.js, sin bloquear)
inicializarFuente();
