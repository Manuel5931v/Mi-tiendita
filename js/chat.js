// ═══════════════════════════════════════
//  MI ASISTENTE — chat conversacional + voz
//  Interpreta frases como "se vendieron 2 bolsas de
//  arroz" contra el inventario REAL del modo actual,
//  pide confirmación y registra la venta/abastecimiento.
// ═══════════════════════════════════════

let chatEsperando = false;        // deshabilita botones mientras Gemini responde
let chatConfirmacion = null;      // { accion, productoId, cantidad } pendiente de confirmar
let chatCandidatos = null;        // lista de candidatos cuando la IA no desambigua
let chatReconocedor = null;       // reconocedor de voz activo
let chatEscuchando = false;
let chatInputVacioAlIniciar = false; // si el input estaba vacío al empezar el dictado

// ─── UI ────────────────────────────────────────────────

function iniciarChat() {
  const feed = document.getElementById('chatFeed');
  if (!feed) return;

  agregarMensajeChat(
    'Hola, soy tu asistente. Dime algo como "se vendieron 2 bolsas de arroz" o "se abastecieron 5 cocas".',
    'asistente'
  );

  // Enter envía el mensaje
  const input = document.getElementById('chatInput');
  if (input) {
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') enviarMensajeChat();
    });
    // Si el usuario escribe a mano mientras se dicta, el campo deja de ser reconstruible sin
    // perder su texto: se marca chatUsuarioEditoVoz y escribirTextoVoz() deja de escribir en él. Este
    // listener solo adelanta la marca; el criterio que decide es la comparación de valores dentro de
    // escribirTextoVoz (asignar input.value desde JS no dispara 'input', así que ambos caminos
    // convergen en la misma bandera sin pisarse).
    input.addEventListener('input', function () {
      if (chatIntencionVozActiva) chatUsuarioEditoVoz = true;
    });
  }

  // Voz: Web Speech API o, si no existe, grabación + IA (MediaRecorder)
  const mic = document.getElementById('chatMic');
  const soportaVoz = window.SpeechRecognition || window.webkitSpeechRecognition;
  const soportaGrabacion = typeof MediaRecorder !== 'undefined' &&
    navigator.mediaDevices && typeof navigator.mediaDevices.getUserMedia === 'function';
  if (mic) {
    if (soportaVoz || soportaGrabacion) {
      mic.style.display = '';
    } else {
      mic.style.display = 'none';
      const aviso = document.getElementById('chatAvisoVoz');
      if (aviso) aviso.textContent = 'Tu navegador no soporta dictado por voz: escribe a mano.';
    }
  }
}

function agregarMensajeChat(texto, tipo) {
  const feed = document.getElementById('chatFeed');
  if (!feed) return null;
  const div = document.createElement('div');
  div.className = 'chat-burbuja chat-burbuja-' + (tipo === 'usuario' ? 'usuario' : 'asistente');
  if (tipo === 'error') div.classList.add('chat-burbuja-error');
  div.textContent = texto;
  feed.appendChild(div);
  feed.scrollTop = feed.scrollHeight;
  return div;
}

function setChatOcupado(ocupado) {
  chatEsperando = ocupado;
  const enviar = document.getElementById('chatEnviar');
  const input = document.getElementById('chatInput');
  const mic = document.getElementById('chatMic');
  if (enviar) enviar.disabled = ocupado;
  if (input) input.disabled = ocupado;
  if (mic) mic.disabled = ocupado;
}

// ─── CORTE DE LAS ESPERAS A GEMINI ─────────────────────
// API REAL verificada en ai-firebase-bridge.js: generarJSONConGemini(systemPrompt, userPrompt) y
// transcribirAudioConGemini(base64Audio, mimeType) son promesas de DOS argumentos, sin opciones,
// sin timeout y SIN AbortController — no hay forma de cancelar la petición por debajo. Un fallo de
// red que no resuelve (móvil con datos que se caen, wifi del colegio que no levanta el TLS, el
// service worker de Firebase AI que se queda a medias) deja entonces la promesa colgada PARA SIEMPRE
// y, con ella, chatInput/chatEnviar/chatMic en disabled con el aviso "Analizando..." eterno: la
// única salida era recargar la página. Aquí se envuelve la promesa con un reloj que la rechaza, así
// que el `catch`/`finally` de cada esperador se ejecutan siempre y la UI siempre vuelve.
//
// La respuesta tardía se descarta sola: `esperarConGemini` ya se resolvió (por el reloj) y su
// manejador hace `if (resuelto) return`, así que una venta NO se aplica dos veces ni se repinta un
// aviso que ya cambió. Lo único que sobrevive al corte es la petición de red, que no se puede
// cancelar con esta API; a diferencia del estado de la UI, no deja nada inutilizable.
function esperarConGemini(promesa, ms, mensaje) {
  return new Promise(function (resolve, reject) {
    let resuelto = false;
    const reloj = setTimeout(function () {
      if (resuelto) return;
      resuelto = true;
      const err = new Error(mensaje);
      err.chatSinRespuesta = true;   // lo distingue el catch de un fallo real de Gemini
      reject(err);
    }, ms);
    promesa.then(
      function (valor) {
        if (resuelto) return;
        resuelto = true;
        clearTimeout(reloj);
        resolve(valor);
      },
      function (err) {
        if (resuelto) return;
        resuelto = true;
        clearTimeout(reloj);
        reject(err);
      }
    );
  });
}

// ─── FLUJO DE TEXTO ───────────────────────────────────

function enviarMensajeChat() {
  const input = document.getElementById('chatInput');
  if (!input || chatEsperando) return;
  const texto = input.value.trim();
  if (!texto) return;
  input.value = '';
  // Enviar cierra la pulsación de voz si había una viva: el campo se reconstruye desde
  // chatInputValorAlIniciar, así que un reconocedor sobreviviente resucitaría en el próximo
  // onresult el texto que el usuario acaba de mandar. Ver cerrarIntencionVozTrasEnvio().
  cerrarIntencionVozTrasEnvio();
  agregarMensajeChat(texto, 'usuario');
  procesarFrase(texto);
}

async function procesarFrase(texto) {
  if (chatEsperando) return;

  // Prefiere el modo JSON; si el puente viejo no existe pero el clásico sí, lo usa igual
  const generar = window.generarJSONConGemini;
  if (typeof generar !== 'function') {
    agregarMensajeChat(
      'El Asistente IA todavía no está listo: requiere conexión y la configuración de Firebase AI Logic. ' +
      'Mientras tanto, puedes revisar tu inventario en la página de Inventario.',
      'error'
    );
    return;
  }
  if (productos.length === 0) {
    agregarMensajeChat('Tu inventario está vacío. Agrega productos primero para que pueda interpretar tus frases.', 'error');
    return;
  }

  setChatOcupado(true);
  let pendiente = agregarMensajeChat('Analizando...', 'asistente');

  try {
    // El corte va AQUÍ, dentro del try, y no envolviendo la función entera: si la respuesta llega
    // tarde se descarta en esperarConGemini, así que nunca vuelve a entrar a manejarAccionIA con la
    // UI ya liberada. El `finally` de abajo es la garantía dura de que el campo nunca queda
    // disabled para siempre, cuelgue o no.
    const textoIA = (await esperarConGemini(
      generar(construirSystemPromptChat(), texto),
      CHAT_MS_IA_ENVIO,
      'La IA no respondió a tiempo.'
    )) || '';
    const datos = parsearRespuestaIA(textoIA);
    if (pendiente) pendiente.remove();
    pendiente = null;
    if (!datos || typeof datos !== 'object') {
      agregarMensajeChat('No entendí tu frase, intenta de nuevo. Ejemplos: "se vendieron 2 bolsas de arroz" o "se abastecieron 5 cocas".', 'error');
      return;
    }
    manejarAccionIA(datos);
  } catch (err) {
    console.error('Error del chat IA:', err);
    if (pendiente) pendiente.remove();
    if (err && err.chatSinRespuesta) {
      // El campo YA se recuperó en el finally; el mensaje dice qué hacer para no dejar al usuario
      // solo con un error.
      agregarMensajeChat('La IA no respondió. Escribe a mano o intenta de nuevo.', 'error');
    } else {
      agregarMensajeChat('Ocurrió un error al consultar la IA. Revisa tu conexión e intenta de nuevo.', 'error');
    }
  } finally {
    setChatOcupado(false);
  }
}

function construirSystemPromptChat() {
  const modo = esModoNegocio() ? 'negocio (tienda)' : 'bodega';
  // Fecha ISO + días relativos para que la IA pueda responder "hace N días" / "en N días"
  const fmtRel = function (f) {
    if (!f) return '—';
    const d = diasHastaFecha(f);
    if (d === null) return f;
    if (d < 0) return f + ' (hace ' + Math.abs(d) + 'd)';
    if (d === 0) return f + ' (hoy)';
    return f + ' (en ' + d + 'd)';
  };
  const lineas = productos.map(p => {
    const vence = p.fechaVencimiento ? textoFecha(p.fechaVencimiento) : 'sin fecha';
    return '- id:' + p.id +
      ' | nombre:' + p.nombre +
      ' | categoria:' + (p.categoria || 'sin categoria') +
      ' | marca:' + (p.marca || 'sin marca') +
      ' | unidad:' + (p.unidad || 'unidad') +
      ' | precioVenta:' + (p.precioVenta ?? 0) +
      ' | precioCosto:' + (p.precioCosto ?? 0) +
      ' | stock:' + p.stock +
      ' | stockMin:' + (p.stockMin ?? config.umbralStock) +
      ' | fechaVencimiento:' + vence +
      ' | ultimoAbastecimiento:' + fmtRel(p.fechaAbastecimiento) +
      ' | proximoAbastecimiento:' + fmtRel(p.proxAbastecimiento) +
      ' | proveedor:' + (p.proveedor || 'sin proveedor') +
      ' | notas:' + (p.notas || 'sin notas');
  });
  // Resumen del inventario (misma lógica que el dashboard)
  const total = productos.length;
  const agotados = productos.filter(p => p.stock <= 0).length;
  const bajoStock = productos.filter(p => p.stock > 0 && p.stock <= (p.stockMin ?? config.umbralStock)).length;
  const vencidos = productos.filter(p => p.fechaVencimiento && diasHastaFecha(p.fechaVencimiento) < 0).length;
  const proxVencer = productos.filter(p => p.fechaVencimiento && diasHastaFecha(p.fechaVencimiento) >= 0 && diasHastaFecha(p.fechaVencimiento) <= config.diasAviso).length;
  let resumen = 'RESUMEN DEL INVENTARIO (modo ' + modo + '): totalProductos:' + total +
    ' | agotados:' + agotados +
    ' | stockBajo:' + bajoStock +
    ' | vencidos:' + vencidos +
    ' | porVencer:' + proxVencer;
  if (esModoNegocio()) {
    const valorInventario = productos.reduce((s, p) => s + (p.precioCosto || 0) * p.stock, 0);
    resumen += ' | valorInventario:' + config.moneda + valorInventario.toFixed(2);
  }
  return 'Eres "Asistente", el asistente conversacional en español de una app de control de inventario llamada "Mi Tiendita". ' +
    'Debes interpretar la frase del usuario pensando en el INVENTARIO REAL del modo ' + modo + ' que se lista abajo, ' +
    'y responder ÚNICAMENTE con un objeto JSON válido: sin texto adicional, sin markdown, sin comentarios.\n' +
    'INVENTARIO REAL (usa SIEMPRE el campo "id" exacto tal como aparece):\n' + lineas.join('\n') + '\n\n' +
    resumen + '\n\n' +
    'FORMATO DE RESPUESTA (elige EXACTAMENTE una de estas opciones):\n' +
    '1) Venta identificable sin duda: {"accion":"venta","productoId":"<id exacto>","cantidad":<entero 1-9999>}\n' +
    '2) Abastecimiento identificable sin duda: {"accion":"abastecer","productoId":"<id exacto>","cantidad":<entero 1-9999>}\n' +
    '3) Pregunta o consulta (cuánto hay, precio, vencimiento, categoría, proveedor, stock mínimo, abastecimientos, estadísticas del inventario, información): {"accion":"consulta","respuesta":"<texto corto en español>"}\n' +
    '4) La frase pide una acción pero NO puedes identificar SIN DUDA el producto (varios similares o nombre distinto al de la lista): ' +
    '{"accion":"ambiguo","candidatos":[{"productoId":"<id exacto>","nombre":"<nombre exacto>","marca":"...","unidad":"...","precioVenta":<número>,"cantidad":<cantidad inferida o 1>,"accion":"venta o abastecer"}]}\n\n' +
    'Reglas: nunca inventes productos ni ids que no estén en la lista; la cantidad siempre entre 1 y 9999; ' +
    'para consultas usa los datos del inventario listado arriba (precios, stock, vencimientos, proveedores, categorías, etc.) y responde con datos reales, sin inventar; ' +
    'si la frase no trata de ventas, abastecimientos ni inventario, responde como consulta con una respuesta breve y amable en español.';
}

function parsearRespuestaIA(texto) {
  const t = (texto || '').trim().replace(/^```(?:json)?/i, '').replace(/```\s*$/, '').trim();
  const extraer = s => {
    try { return JSON.parse(s); } catch (e) { return null; }
  };
  let datos = extraer(t);
  if (!datos) {
    // Si el modelo metió texto extra, toma el primer objeto {...}
    const ini = t.indexOf('{');
    const fin = t.lastIndexOf('}');
    if (ini !== -1 && fin > ini) datos = extraer(t.slice(ini, fin + 1));
  }
  return datos;
}

function manejarAccionIA(datos) {
  const accion = datos.accion;

  if (accion === 'consulta') {
    agregarMensajeChat(String(datos.respuesta || 'No tengo una respuesta para eso.'), 'asistente');
    return;
  }

  if (accion === 'venta' || accion === 'abastecer') {
    const p = productos.find(x => x.id === String(datos.productoId));
    if (!p) {
      agregarMensajeChat('No encontré ese producto en tu inventario. Revisa el nombre y vuelve a intentar.', 'error');
      return;
    }
    const cantidad = Number(datos.cantidad);
    if (!Number.isInteger(cantidad) || cantidad < 1 || cantidad > 9999) {
      agregarMensajeChat(`La cantidad "${datos.cantidad}" no es válida. Debe ser un número entero entre 1 y 9999.`, 'error');
      return;
    }
    if (accion === 'venta' && p.stock < cantidad) {
      agregarMensajeChat(`No hay suficiente stock de ${p.nombre}: solo hay ${p.stock} ${p.unidad || 'unid.'}. No se registró nada.`, 'error');
      return;
    }
    chatConfirmacion = { accion, productoId: p.id, cantidad };
    mostrarConfirmacionChat(accion, p, cantidad);
    return;
  }

  if (accion === 'ambiguo' && Array.isArray(datos.candidatos) && datos.candidatos.length > 0) {
    const candidatos = datos.candidatos
      .slice(0, 6)
      .map(c => {
        const producto = productos.find(x => x.id === String(c.productoId));
        return producto ? {
          productoId: producto.id,
          nombre: producto.nombre,
          marca: producto.marca,
          unidad: producto.unidad,
          precioVenta: producto.precioVenta,
          cantidad: Number(c.cantidad),
          accion: c.accion === 'abastecer' ? 'abastecer' : 'venta',
          producto
        } : null;
      })
      .filter(Boolean);
    if (candidatos.length === 0) {
      agregarMensajeChat('La IA no pudo identificar ningún producto real de tu inventario. Intenta ser más específico.', 'error');
      return;
    }
    chatCandidatos = candidatos;
    mostrarCandidatosChat(candidatos);
    return;
  }

  agregarMensajeChat('No entendí tu frase, intenta de nuevo.', 'error');
}

// ─── CONFIRMACIÓN (obligatoria antes de ejecutar) ──────

function mostrarConfirmacionChat(accion, p, cantidad) {
  const feed = document.getElementById('chatFeed');
  if (!feed) return;
  const verbo = accion === 'venta' ? 'venta de' : 'abastecimiento de';
  const marca = p.marca ? ` (${escHtml(p.marca)})` : '';
  const precio = esModoNegocio() ? ` por ${formatPrecio(p.precioVenta)}` : '';
  const div = document.createElement('div');
  div.className = 'chat-burbuja chat-burbuja-asistente';
  div.innerHTML =
    `<span>¿Registrar ${verbo} ${cantidad} × ${escHtml(p.nombre)}${marca}${precio}?</span>` +
    `<span class="chat-detalle">Stock actual: ${escHtml(String(p.stock))} ${escHtml(p.unidad || 'unid.')}</span>` +
    `<div class="chat-acciones">` +
      `<button class="btn btn-primario btn-sm" onclick="confirmarAccionChat(true)">Sí, registrar</button>` +
      `<button class="btn btn-secundario btn-sm" onclick="confirmarAccionChat(false)">No</button>` +
    `</div>`;
  feed.appendChild(div);
  feed.scrollTop = feed.scrollHeight;
}

function confirmarAccionChat(aceptar) {
  const pend = chatConfirmacion;
  chatConfirmacion = null;
  if (!pend) return;

  if (!aceptar) {
    agregarMensajeChat('Perfecto, no se registró nada.', 'asistente');
    return;
  }

  const p = productos.find(x => x.id === pend.productoId);
  if (!p) {
    agregarMensajeChat('Ya no encontré ese producto en el inventario.', 'error');
    return;
  }

  // Revalidar antes de ejecutar (el stock pudo cambiar desde la confirmación)
  if (pend.accion === 'venta' && p.stock < pend.cantidad) {
    agregarMensajeChat(`Ya no hay suficiente stock: solo quedan ${p.stock} ${p.unidad || 'unid.'}. No se registró la venta.`, 'error');
    return;
  }

  if (pend.accion === 'venta') {
    registrarVenta(pend.productoId, pend.cantidad);
  } else {
    registrarAbastecimiento(pend.productoId, pend.cantidad);
  }
  agregarMensajeChat(`Listo, ${pend.accion === 'venta' ? 'venta' : 'abastecimiento'} de ${pend.cantidad} × ${p.nombre} registrada.`, 'asistente');
}

// Limpia confirmaciones/candidatos pendientes del chat.
// El cambio de modo se dispara desde `seleccionarModo()` (modes.js), invocado por
// onclick inline en index.html; no existe un evento/hook global que chat.js pueda
// escuchar sin modificar modes.js o index.html, así que esta función queda expuesta
// pero sin conectar. Para activarla, llamar `limpiarEstadoChat()` dentro de
// `seleccionarModo()` en modes.js (fuera del alcance de este fix).
function limpiarEstadoChat() {
  chatConfirmacion = null;
  chatCandidatos = null;
}

// ─── DESAMBIGUACIÓN ───────────────────────────────────

function mostrarCandidatosChat(candidatos) {
  const feed = document.getElementById('chatFeed');
  if (!feed) return;
  const items = candidatos.map((c, i) => {
    const p = c.producto;
    const cantidad = c.cantidad > 1 ? ` · x${c.cantidad}` : '';
    return `<li>
      <button class="chat-candidato" onclick="elegirCandidatoChat(${i})">
        <strong>${i + 1}.</strong>
        <span>${escHtml(p.nombre)}${p.marca ? ' — ' + escHtml(p.marca) : ''} · ${escHtml(p.unidad || 'unidad')} · ${formatPrecio(p.precioVenta)}${cantidad}</span>
      </button>
    </li>`;
  }).join('');
  const div = document.createElement('div');
  div.className = 'chat-burbuja chat-burbuja-asistente';
  div.innerHTML = `<span>Hay varios productos que coinciden. Elige cuál es:</span><ul class="chat-candidatos">${items}</ul>`;
  feed.appendChild(div);
  feed.scrollTop = feed.scrollHeight;
}

function elegirCandidatoChat(indice) {
  const lista = chatCandidatos;
  chatCandidatos = null;
  const cand = (lista && lista[indice]) || null;
  if (!cand || !cand.producto) {
    agregarMensajeChat('Ocurrió un error al elegir el producto. Intenta de nuevo.', 'error');
    return;
  }
  const p = cand.producto;
  const accion = cand.accion === 'abastecer' ? 'abastecer' : 'venta';
  const cantidad = cand.cantidad;

  if (!Number.isInteger(cantidad) || cantidad < 1 || cantidad > 9999) {
    agregarMensajeChat('La cantidad indicada no es válida. Debe ser un número entero entre 1 y 9999.', 'error');
    return;
  }
  if (accion === 'venta' && p.stock < cantidad) {
    agregarMensajeChat(`No hay suficiente stock de ${p.nombre}: solo hay ${p.stock} ${p.unidad || 'unid.'}.`, 'error');
    return;
  }
  chatConfirmacion = { accion, productoId: p.id, cantidad };
  mostrarConfirmacionChat(accion, p, cantidad);
}

let chatReintentosVoz = 0;          // reintentos CONSUMIDOS en la pulsación actual (no se resetea al tocar)
let chatDetenidoPorUsuario = false; // true si el usuario detuvo (o hubo error fatal): no reintentar
let chatHuboResultadoFinal = false; // se transcribió al menos un resultado final EN ESTA INTENCIÓN
let chatErrorVoz = false;           // true si se mostró un error fatal (no sobrescribir el aviso)
let chatIniciandoVoz = false;       // RUTA 2: true mientras getUserMedia pide permiso. En la ruta 1
                                    // (Web Speech) NUNCA se pone en true: quien refleja esa ventana
                                    // es chatIntencionVozActiva, que iniciarIntencionVoz() levanta
                                    // antes de pedir nada (ver chatearPorVoz)
let chatIdiomaVoz = 'es-419';       // idioma activo; cae a es-ES/es-MX si no se soporta
let chatUltimoErrorVoz = null;      // último error recuperable ('no-speech'/'aborted'/'network') o null
let chatStreamMic = null;           // stream del pre-check de permiso; se libera al terminar
let chatSesionVoz = 0;              // token monotónico: un reconocedor por número (ver iniciarReconocedorVoz)
let chatTimerReintento = null;      // setTimeout del auto-reinicio; se cancela al parar o cambiar de pulsación
let chatTimerWatchdog = null;       // setTimeout del watchdog contra el cuelgue silencioso
let chatWatchdogDisparos = 0;       // veces que el watchdog cortó esta pulsación (2 → pasa a la ruta 2)
let chatIntencionVozActiva = false; // hay una pulsación de micrófono viva, incluido el hueco entre
                                    // r.start() y onstart donde `chatEscuchando` todavía miente
let chatUsuarioEditoVoz = false;    // el usuario tomó el control del campo a mano mientras dictaba
let chatTranscripcionPendiente = '';// última transcripción completa (NO se pega: solo informa al cerrar)
let chatTextoVozEnCampo = null;     // valor EXACTO que esta pulsación escribió en el input (null = aún
                                    // no escribió). Es el criterio ÚNICO de "el usuario editó": si
                                    // input.value !== chatTextoVozEnCampo, el campo es suyo.
let chatTextoVozTranscrito = '';    // acumulador monótono de la transcripción de la sesión (sigue
                                    // avanzando aunque el campo esté congelado: alimenta el merge)
let chatTextoVozAceptado = '';      // acumulador TAL COMO ESTABA la última vez que se escribió en el
                                    // input. Es contra este valor, no contra el acumulador, contra
                                    // el que se calcula lo que se descarta: si se comparara con el
                                    // acumulador, el "descarte" saldría vacío y la pérdida sería
                                    // silenciosa justo cuando el usuario corrigió lo dictado
let chatEvidenciaFalloVoz = false;  // hubo un error REAL de plataforma (network/service-not-allowed/
                                    // audio-capture) en esta pulsación. Solo eso habilita el salto
                                    // PERMANENTE a la ruta 2: un cuelgue por reloj no es evidencia.
let chatIdiomaPendienteEnOnEnd = false; // ver onerror/onend: el reintento de idioma sobrevive al onend

let chatGrabadora = null;           // MediaRecorder activo (modo grabación + IA)
let chatChunksAudio = [];           // chunks de audio acumulados durante la grabación
let chatGrabando = false;           // true mientras se graba (ruta 2)
let chatDeteniendoGrabacion = false;// true entre stop() y onstop: hace detenerGrabacion() idempotente
let chatStreamGrabacion = null;     // stream del micrófono en modo grabación
let chatTranscribiendo = false;     // true mientras Gemini transcribe el audio grabado
let chatTimeoutGrabacion = null;    // timeout del tope de 60s de grabación
let chatInputValorAlIniciar = '';   // valor del input al iniciar la pulsación (ambas rutas)
let chatErrorGrabacion = false;     // true si el MediaRecorder falló (onerror)

let CHAT_REINTENTOS_ESCRITORIO = 3; // presupuesto histórico de escritorio; NO se resetea al tocar
let CHAT_REINTENTOS_MOVIL = 1;      // en móvil solo se reintenta ante un error real, nunca por silencio
// El reloj del watchdog sube de 8s a 12s por un motivo medido: con push-to-talk e
// interimResults:false el ÚNICO evento que lo rearma es un resultado FINAL, así que "el usuario
// está pensando qué decir" y "el navegador está colgado" son el MISMO silencio en el reloj. Un
// usuario que lee la lista de productos antes de dictar disparaba el corte a los 8s, y abort()
// DESCARGA el audio pendiente (pérdida real, no un falso aviso). 12s cubre la pausa legítima.
// NO se rearma con onaudiostart/onsoundstart a propósito: no es fiable —varios WebKit los
// disparan sin audio real— y desactivaría el watchdog justo en la plataforma para la que existe.
let CHAT_MS_WATCHDOG_MOVIL = 12000; // sin NINGÚN evento en 12s la sesión está colgada (bugs.webkit 317741)
let CHAT_MS_WATCHDOG_WEBKIT = 20000;// Safari de escritorio sufre el mismo cuelgue: reloj más laxo
let CHAT_ANCHO_MOVIL = 699;         // mismo corte que styles.css: a 700px las columnas ya no se apilan
// Errores que SÍ prueban que la Web Speech API no funciona en este dispositivo. 'no-speech' y
// 'aborted' NO están: describen al usuario en silencio, no a la plataforma.
let CHAT_ERRORES_FALLO_PLATAFORMA = ['network', 'service-not-allowed', 'audio-capture'];
// Cortes de las esperas a Gemini. Son relojes INDEPENDIENTES entre sí y del watchdog de la ruta 1
// (12s/20s) y del tope de grabación (60s): cada uno nace en su propio punto y muere con su propia
// limpieza, así que ninguno puede dispararse durante otro. CHAT_MS_IA_TRANSCRIPCION corre DESPUÉS
// de que procesarAudioGrabado() ya llamó a limpiarTimeoutGrabacion(), o sea que el reloj de
// grabación está cancelado antes de que este empiece: nunca coexisten.
let CHAT_MS_IA_ENVIO = 45000;        // envío normal: "Analizando..."
let CHAT_MS_IA_TRANSCRIPCION = 60000;// ruta 2: "Transcribiendo con IA..."
let CHAT_HORAS_VOZ_GRABACION = 24;  // caducidad de vozUsarGrabacion: un 'network' de una demo puede
                                    // ser transitorio (WiFi del colegio, VPN) y sin caducidad el
                                    // usuario quedaba atrapado en Gemini para siempre

// ─── Plataforma ──────────────────────────────────────

// ¿Teléfono/tablet de verdad, o escritorio? Se cruzan varias señales porque ninguna basta sola:
// el UA de un iPad en modo escritorio dice "Macintosh", una laptop con pantalla táctil puede tener
// la ventana angosta, y hay equipos sin maxTouchPoints con pantalla táctil. Pero el UA de un
// TELÉFONO sí es concluyente y se respeta por sí mismo, sin exigir que la ventana esté angosta.
function esPlataformaMovil() {
  const ua = navigator.userAgent || '';
  const anchoEstrecho = window.matchMedia
    ? window.matchMedia('(max-width: ' + CHAT_ANCHO_MOVIL + 'px)').matches
    : window.innerWidth <= CHAT_ANCHO_MOVIL;
  const uaMovil = /Android|iPhone|iPad|iPod|IEMobile|BlackBerry|Opera Mini|Mobile/i.test(ua);
  const punteroGrueso = window.matchMedia ? window.matchMedia('(pointer: coarse)').matches : false;
  // (pointer: fine) = hay ratón/trackpad. Un portátil con pantalla táctil tiene LAS DOS señales a la
  // vez, así que (pointer:coarse) NO alcanza para separar un móvil de un portátil.
  const punteroFino = window.matchMedia ? window.matchMedia('(pointer: fine)').matches : false;
  const tactil = (navigator.maxTouchPoints || 0) > 0;
  // iPadOS 13+ en modo escritorio: UA "Macintosh" + varios puntos táctiles.
  const esIPadOS = /Macintosh/i.test(ua) && (navigator.maxTouchPoints || 0) > 1;
  // Tablet Android en horizontal: su UA NO lleva el token "Mobile" (los teléfonos Android sí), así
  // que con el criterio de ancho caía en la rama de escritorio: continuous:true + interimResults:true
  // y crbug 40272768 — el bug que todo este código viene a matar — presente igual. Se reconoce por
  // UA Android sin "Mobile" + señal táctil, sin mirar el ancho.
  const esTabletAndroid = /Android/i.test(ua) && !/Mobile/i.test(ua) && (tactil || punteroGrueso);
  // EL UA DE TELÉFONO DECIDE POR SÍ SOLO. Antes el ancho era un filtro: `anchoEstrecho && (...)`, y
  // todo teléfono moderno en horizontal mide más de 699px de viewport (iPhone 15 Pro Max 932,
  // iPhone 15 Pro 874, Pixel 8 915, Galaxy S23 780), así que caían en la rama de escritorio con
  // continuous:true + interimResults:true — y con eso volvía entero el bug original (crbug
  // 40272768: Android reemite los finales y las palabras se doblan). El ancho solo puede SUMAR
  // señal a partir de aquí, nunca filtrarla.
  //
  // La rama del ancho se cierra con `!punteroFino` a propósito: es la que evita degradar el
  // escritorio (requisito que no se toca) cuando la ventana es angosta. Exige las tres cosas —
  // angosto + táctil + SIN ratón/trackpad — porque un portátil táctil o ChromeOS reporta
  // (pointer:coarse) y (pointer:fine) a la vez, y se habría clasificado como móvil, degradando el dictado en vivo.
  return uaMovil || esIPadOS || esTabletAndroid || (anchoEstrecho && tactil && !punteroFino);
}

// Safari es el único motor con el cuelgue silencioso de bugs.webkit.org 317741. En Chrome
// `SpeechRecognition` existe sin prefijo, así que esto identifica WebKit sin adivinar.
function esMotorWebKit() {
  return !window.SpeechRecognition && !!window.webkitSpeechRecognition;
}

// ─── Utilidades de texto ──────────────────────────────

function normalizarEspacios(t) {
  return String(t || '')
    .replace(/\s+/g, ' ')
    // Los signos de apertura (¿¡) no van separados de lo que abren, y la puntuación de cierre no
    // lleva espacio delante. Va al final a propósito: unirSegmentos() respeta el MUST de espaciado de
    // la spec (el hueco llega DENTRO del texto de cada resultado) y aquí se corrige solo el
    // texto que ya se va a mandar a la IA.
    .replace(/([¿¡(\[{«"'])\s+/g, '$1')
    .replace(/\s+([,.;:!?)\]}»…])/g, '$1')
    .trim();
}

// Une dos segmentos del MISMO resultado de reconocimiento sin pegar ni partir palabras.
// La spec (§4.1.7, SpeechRecognitionAlternative) lo pone como MUST: "For continuous recognition,
// leading or trailing whitespace MUST be included where necessary such that concatenation of
// consecutive SpeechRecognitionResults produces a proper transcript of the session". O sea, el
// espacio ya viene DENTRO del texto de cada resultado: concatenar con += / join('') es lo
// correcto y join(' ') está mal (produce espacios dobles o palabras pegadas).
// Aun así, si un navegador no cumple el MUST y entrega dos segmentos sin espacio en la frontera
// ("woke" + "up" → "wokeup"), se inserta UN espacio SOLO en esa frontera. Nunca se duplica un
// espacio porque normalizarEspacios() colapsa cualquier corrida en el texto final.
function unirSegmentos(acc, seg) {
  if (!seg) return acc;
  if (!acc) return seg;
  const fin = acc.charAt(acc.length - 1);
  const inicio = seg.charAt(0);
  if (/\s/.test(fin) || /\s/.test(inicio)) return acc + seg;
  // Casos de frontera que el MUST no cubre y que salen mal con un espacio ingenuo. El criterio es
  // "¿unir sin espacio es legible?": si el nuevo segmento EMPIEZA con puntuación de apertura se
  // separa, salvo que lo anterior ya sea apertura ("¿" + "cómo estás" → "¿cómo estás", no
  // "¿ cómo estás"); si empieza con puntuación de cierre no se separa ("hola." + ",¿qué tal" →
  // "hola.,¿qué tal", no "hola. ,¿qué tal").
  const ABRE = /[¿¡«"'(\[{]/;
  const CIERRA = /[)\]}»…,;:!?.]/;
  if (ABRE.test(inicio)) return ABRE.test(fin) ? acc + seg : acc + ' ' + seg;
  if (CIERRA.test(inicio)) return acc + seg;
  // Y si lo anterior YA es algo que no admite cola, tampoco.
  if (/[¿¡«"')\]}»…]/.test(fin)) return acc + seg;
  return acc + ' ' + seg;
}

// ─── Flag adaptativo ──────────────────────────────────

// Si la Web Speech API falló DE VERDAD (error de plataforma), la próxima vez ir directo a
// grabación + IA (MediaRecorder → Gemini), que sí es confiable en móvil. Un cuelgue por reloj ya NO
// cuenta: no distingue "el usuario pensando" de "el navegador colgado" (ver armarWatchdog).
// El flag lleva CADUCIDAD. Antes era irreversible: bastaba un 'network' momentáneo (WiFi del
// colegio, VPN, service worker) para que el usuario quedara en Gemini para siempre, con el coste de
// cuota, la latencia y la dependencia de que el módulo ES haya cargado. Con caducidad, un fallo de
// red transitorio se re-evalúa solo en el siguiente uso de la ruta 1.
const MS_VOZ_GRABACION_TTL = CHAT_HORAS_VOZ_GRABACION * 60 * 60 * 1000;

function usarGrabacionDirecta() {
  try {
    if (localStorage.getItem('vozUsarGrabacion') !== '1') return false;
    const marca = Number(localStorage.getItem('vozUsarGrabacionFecha'));
    if (!marca || !isFinite(marca)) {
      // Bandera heredada de una versión SIN caducidad: se respeta (el dispositivo puede estar
      // realmente roto) pero se sella con la fecha de ahora para que a partir de aquí expire.
      marcarUsarGrabacion();
      return true;
    }
    if (Date.now() - marca > MS_VOZ_GRABACION_TTL) {
      localStorage.removeItem('vozUsarGrabacion');
      localStorage.removeItem('vozUsarGrabacionFecha');
      return false; // expirada: el próximo uso vuelve a probar la ruta 1
    }
    return true;
  } catch (e) { return false; }
}

function marcarUsarGrabacion() {
  try {
    localStorage.setItem('vozUsarGrabacion', '1');
    localStorage.setItem('vozUsarGrabacionFecha', String(Date.now()));
  } catch (e) { /* almacenamiento no disponible */ }
}

// ─── Ciclo de vida de una pulsación de micrófono ──────

// Arranca UNA pulsación del usuario. Todos los flags de "intención" se resetean AQUÍ y en ningún
// otro lado: antes cada onstart los pisaba, y eso invalidaba guards que describían lo que pasó en
// los últimos 300 ms en vez de lo que el usuario quiere (duplicaba palabras y sesiones fantasma).
function iniciarIntencionVoz() {
  const input = document.getElementById('chatInput');
  const mic = document.getElementById('chatMic');
  const aviso = document.getElementById('chatAvisoVoz');

  // El token sube antes de tocar nada: cualquier onresult/onend/timer de una pulsación anterior
  // queda invalidado en el acto, sin depender de ningún otro flag.
  chatSesionVoz++;
  chatIntencionVozActiva = true;
  chatDetenidoPorUsuario = false;
  chatErrorVoz = false;
  chatHuboResultadoFinal = false;
  chatUltimoErrorVoz = null;
  chatWatchdogDisparos = 0;
  chatEvidenciaFalloVoz = false;
  chatIdiomaPendienteEnOnEnd = false;
  chatUsuarioEditoVoz = false;
  chatTranscripcionPendiente = '';
  chatTextoVozEnCampo = null;
  chatTextoVozTranscrito = '';
  chatTextoVozAceptado = '';
  // Se calcula UNA vez por pulsación: antes se recalculaba en cada onstart, así que la 2ª
  // sesión de un auto-restart veía el input ya sucio, caía a la rama de "append" y pegaba el
  // final entero ENCIMA de los interims de la sesión 1. Esa era la causa directa del doblado.
  chatInputValorAlIniciar = input ? input.value : '';
  chatInputVacioAlIniciar = normalizarEspacios(chatInputValorAlIniciar) === '';

  limpiarTimerReintento();
  limpiarWatchdog();
  abortarReconocedorVoz();
  if (mic) mic.classList.add('chat-mic-activo');
  if (aviso) aviso.textContent = 'Solicitando permiso del micrófono...';
}

// Cierra la pulsación: limpia temporizadores y resuelve la transcripción pendiente.
function cerrarIntencionVoz() {
  chatIntencionVozActiva = false;
  chatDetenidoPorUsuario = false;
  chatReintentosVoz = 0;   // el presupuesto se reinicia al terminar, no al tocar el micrófono
  chatWatchdogDisparos = 0;
  limpiarTimerReintento();
  limpiarWatchdog();
  resolverTextoVozPendiente();
}

// ENVIAR también cierra la pulsación. escribirTextoVoz() reconstruye el campo desde
// chatInputValorAlIniciar, congelado al inicio de la pulsación; si el reconocedor siguiera vivo, su
// próximo onresult resucitaba la frase que el usuario ya mandó ("se vendieron 2 cocas" → se envía →
// llega "y 2 aguas" → el input vuelve a "se vendieron 2 cocas y 2 aguas"). Y no se pierde
// continuidad: procesarFrase() deshabilita input y micrófono mientras Gemini piensa, así que no
// existe ventana útil para seguir dictando.
function cerrarIntencionVozTrasEnvio() {
  const hayVozViva = chatIntencionVozActiva || chatEscuchando || chatGrabando ||
    chatDeteniendoGrabacion || chatIniciandoVoz ||
    !!chatReconocedor || !!chatGrabadora;
  if (!hayVozViva) return;
  // Lo que el usuario ve se está mandando: la transcripción pendiente se DESCARTA, no se le pega.
  chatTranscripcionPendiente = '';
  chatUsuarioEditoVoz = false;
  chatTextoVozEnCampo = null;
  // El token sube ANTES de abortar: el onend que dispara el abort no debe repintar el aviso ni dejar
  // el micrófono en modo "detener" para el siguiente toque.
  chatSesionVoz++;
  abortarReconocedorVoz();
  if (chatGrabadora) detenerGrabacion();
  chatIniciandoVoz = false;
  chatGrabando = false;
  chatEscuchando = false;
  liberarStreamMic();
  const mic = document.getElementById('chatMic');
  if (mic) mic.classList.remove('chat-mic-activo');
  cerrarIntencionVoz();
}

// Escribe la transcripción RECONSTRUYENDO el campo a partir de event.results (acumulativo) en vez de
// pegar deltas: un final re-emitido por Android produce el MISMO valor y no duplica palabras.
function escribirTextoVoz(texto) {
  const input = document.getElementById('chatInput');
  if (!input) return;
  const transcripcion = normalizarEspacios(texto);
  if (!transcripcion) return;

  // MONOTONÍA. Reconstruir desde cero es idempotente pero NO monótono: si el navegador resetea
  // event.results (bug conocido de Chrome/Safari) la reconstrucción devuelve solo la cola y BORRA
  // lo ya escrito ("se vendieron 2 cocas" → "2 cocas"). Se fusiona con lo ya aceptado buscando el
  // solapamiento más largo entre la cola de lo escrito y la cabeza del texto nuevo: nunca se pierde
  // texto y nunca se repite una palabra en la frontera.
  let acumulada = chatTextoVozTranscrito;
  if (!acumulada) {
    acumulada = transcripcion;
  } else if (transcripcion !== acumulada && transcripcion.indexOf(acumulada) === 0) {
    acumulada = transcripcion;                 // results creció, o Android re-emitió desde más abajo
  } else if (acumulada.indexOf(transcripcion) !== 0) {
    // El navegador devolvió una transcripción distinta de la misma sesión (results reseteado).
    let solapa = 0;
    let solapaEnFrontera = 0;
    const max = Math.min(acumulada.length, transcripcion.length);
    for (let k = max; k > 0; k--) {
      if (acumulada.slice(acumulada.length - k) !== transcripcion.slice(0, k)) continue;
      if (!solapa) solapa = k;
      // Un solape solo deja la unión limpia si el corte cae ENTRE palabras por los dos lados: en A
      // lo precede un espacio (o es el inicio) y en T lo sigue un espacio (o es el final). Si el
      // corte cae a media palabra el texto no se duplica pero la unión suena mal
      // ("... dos coca" + "s dos cocas" → "...cocas s dos cocas", con el "s" colgando). Por eso se
      // busca el solape MÁS LARGO que caiga en frontera de palabra y, si no hay ninguno, se usa el
      // más largo de a secas como antes. La MONOTONÍA no cambia: el acumulador sigue siendo
      // prefijo del resultado en los dos casos, así que no se pierde texto.
      const enFronteraDeA = k >= acumulada.length || /\s/.test(acumulada.charAt(acumulada.length - k - 1));
      const enFronteraDeT = k >= transcripcion.length || /\s/.test(transcripcion.charAt(k));
      if (enFronteraDeA && enFronteraDeT) { solapaEnFrontera = k; break; }
    }
    solapa = solapaEnFrontera || solapa;
    acumulada = solapa
      ? acumulada + transcripcion.slice(solapa)
      : unirSegmentos(acumulada, transcripcion);
  }
  chatTextoVozTranscrito = acumulada;

  // Criterio ÚNICO de "el usuario tomó el control": el campo ya no es lo que esta pulsación escribió.
  // Antes la decisión vivía en dos sitios con criterios distintos —indexOf sobre la transcripción en
  // la rama congelada y comparación con chatInputValorAlIniciar aquí— y se podían contradecir.
  const valorEsperado = chatTextoVozEnCampo === null ? chatInputValorAlIniciar : chatTextoVozEnCampo;
  if (input.value !== valorEsperado) {
    chatUsuarioEditoVoz = true;
    chatTranscripcionPendiente = acumulada;
    return; // no se pisa su texto
  }

  const base = chatInputVacioAlIniciar ? '' : normalizarEspacios(chatInputValorAlIniciar);
  const valor = base ? base + ' ' + acumulada : acumulada;
  input.value = valor;
  chatTextoVozEnCampo = valor;
  chatTextoVozAceptado = acumulada;
}

// El usuario escribió a mano mientras dictaba. NO se le concatena nada: el texto del usuario manda.
// Antes se intentaba deducir con una contención textual (input.indexOf(transcripcion) !== -1) y esa
// contención falla JUSTO en el caso para el que existe la rama congelada: si corrigió lo dictado, el
// campo ya no contiene la transcripción, así que la daba por nueva y le pegaba encima la versión
// INCORRECTA que acababa de corregir ("SE VENDIERON 3 COCAS" + "se vendieron 2 cocas y 1
// agua"). De la rama congelada se conserva solo la INFORMACIÓN de lo que se descartó, para que la
// pérdida no sea silenciosa.
function resolverTextoVozPendiente() {
  if (!chatUsuarioEditoVoz) {
    chatTranscripcionPendiente = '';
    return;
  }
  const transcripcion = normalizarEspacios(chatTranscripcionPendiente);
  // `previo` es lo ÚLTIMO que llegó al campo, no el acumulador: si el campo se congeló, el
  // acumulador siguió avanzando con palabras que el usuario nunca vio, y comparar contra él
  // devolvería una cola vacía (pérdida silenciosa justo en el caso de la corrección).
  const previo = normalizarEspacios(chatTextoVozAceptado);
  chatTranscripcionPendiente = '';
  chatTextoVozEnCampo = null;
  chatTextoVozAceptado = '';
  if (!transcripcion) return;
  const cola = previo && transcripcion.indexOf(previo) === 0
    ? transcripcion.slice(previo.length)
    : transcripcion;
  // La cola se normaliza antes de imprimirse: al cortar por un espacio de palabra la cola arranca
  // con ese espacio y el aviso salía « y 1 agua», con el hueco DENTRO de las comillas angulares.
  const colaLimpia = normalizarEspacios(cola);
  const aviso = document.getElementById('chatAvisoVoz');
  if (aviso && colaLimpia) {
    aviso.textContent = normalizarEspacios(aviso.textContent) +
      ' Se descartó «' + colaLimpia + '» del dictado porque escribiste a mano.';
  }
}

function limpiarTimerReintento() {
  if (chatTimerReintento) {
    clearTimeout(chatTimerReintento);
    chatTimerReintento = null;
  }
}

function limpiarWatchdog() {
  if (chatTimerWatchdog) {
    clearTimeout(chatTimerWatchdog);
    chatTimerWatchdog = null;
  }
}

function abortarReconocedorVoz() {
  const r = chatReconocedor;
  chatReconocedor = null;
  if (!r) return;
  try { r.abort(); } catch (e) { /* la sesión ya estaba cerrada */ }
}

// ─── Watchdog contra el cuelgue silencioso (iOS) ──────

// bugs.webkit.org 317741: en iOS la sesión se CUELGA sin emitir NADA — ni onresult, ni onerror,
// ni onend — así que ningún evento puede avisarnos y el reinicio desde onend nunca corre. No hay
// arreglo en JS; la única detección posible es por reloj. Se arma antes de r.start() (así también
// cubre el caso de que ni siquiera llegue onstart) y se rearma en cada evento que sí llega.
function armarWatchdog(token, r) {
  limpiarWatchdog();
  const ms = esPlataformaMovil()
    ? CHAT_MS_WATCHDOG_MOVIL
    : (esMotorWebKit() ? CHAT_MS_WATCHDOG_WEBKIT : 0);
  if (!ms) return; // Chrome de escritorio no se cuelga: su comportamiento queda intacto

  chatTimerWatchdog = setTimeout(function () {
    chatTimerWatchdog = null;
    if (token !== chatSesionVoz) return;
    const mic = document.getElementById('chatMic');
    const aviso = document.getElementById('chatAvisoVoz');

    chatWatchdogDisparos++;
    // El token sube ANTES de abortar: el onend del reconocedor colgado tiene que quedar
    // invalidado tanto si el navegador lo despacha ya (síncrono) como después (lo habitual),
    // y no debe cerrar la pulsación ni borrar el reintento que se programa aquí abajo.
    const tokenNuevo = ++chatSesionVoz;
    try { r.abort(); } catch (e) { /* ya estaba cerrada */ }
    if (chatReconocedor === r) chatReconocedor = null;
    chatEscuchando = false;
    if (mic) mic.classList.remove('chat-mic-activo');

    if (chatWatchdogDisparos >= 2) {
      const movil = esPlataformaMovil();
      // DOS CUELGUES POR RELOJ NO SON EVIDENCIA DE PLATAFORMA. Con push-to-talk e
      // interimResults:false el reloj solo lo rearma un final, así que un usuario que lee la lista
      // de productos antes de dictar produce exactamente el mismo silencio que un cuelgue real: se
      // llegaba aquí con onerror:0 y onend:0, sesión perfectamente sana, y aun así se quemaba el
      // presupuesto, se marcaba vozUsarGrabacion y el usuario quedaba en Gemini PARA SIEMPRE.
      // Ahora decide solo con lo que hay de verdad en la pulsación:
      //   · con error de plataforma (network/service-not-allowed/audio-capture) sí hay diagnóstico:
      //     se va a la ruta 2 y se recuerda la preferencia, ya con caducidad (marcarUsarGrabacion);
      //   · en escritorio NO se escala NUNCA por reloj: se cierra y el usuario intenta otra vez, que
      //     es el comportamiento que el escritorio debe conservar;
      //   · en móvil sin error se ofrece la ruta 2 solo para ESTA pulsación y sin recordarla: la
      //     grabación sí funciona en iOS y, si no había texto capturado, no se pierde nada.
      chatDetenidoPorUsuario = true;
      const conEvidencia = chatEvidenciaFalloVoz;
      const hayTexto = chatHuboResultadoFinal || chatTextoVozEnCampo !== null;
      if (conEvidencia) marcarUsarGrabacion();
      // EL AVISO SE ESCRIBE ANTES de cerrarIntencionVoz(), no después: esa llamada resuelve el
      // texto pendiente y resolverTextoVozPendiente() APPENDE en este mismo nodo el aviso de
      // descarte ("Se descartó «…» del dictado"), así que escribir después lo pisaba entero y el usuario
      // se quedaba sin saber que se perdió texto dictado. Escribir primero deja los dos avisos
      // en orden: motivo del corte y, detrás, lo que se descartó.
      if (hayTexto || !movil) {
        if (aviso) {
          aviso.textContent = hayTexto
            ? 'El dictado se cortó porque no llegaba nada. Revisa el texto antes de enviar.'
            : 'El dictado por voz no respondió. Toca el micrófono e inténtalo de nuevo.';
        }
        cerrarIntencionVoz();
        return;
      }
      if (aviso) aviso.textContent = 'El dictado no respondió; se intenta grabar y transcribir con IA.';
      cerrarIntencionVoz();
      grabarConMicrofono(true);
      return;
    }

    // Primer cuelgue: un solo reintento con backoff dentro de la misma pulsación.
    programarReintento(tokenNuevo, r);
  }, ms);
}

// ─── Programación del reinicio automático ─────────────

function programarReintento(token, recon, forzarIdioma) {
  if (!chatIntencionVozActiva || chatDetenidoPorUsuario) {
    // No hay a quién reintentar: se suelta la marca para que el onend que llega detrás no la
    // consuma y deje la pulsación colgada sin cerrar.
    chatIdiomaPendienteEnOnEnd = false;
    return;
  }

  const aviso = document.getElementById('chatAvisoVoz');
  const movil = esPlataformaMovil();
  const maxReintentos = movil ? CHAT_REINTENTOS_MOVIL : CHAT_REINTENTOS_ESCRITORIO;
  // Un cambio de idioma es un error de CONFIGURACIÓN de la sesión, no un silencio: se reintenta
  // siempre y sin consumir presupuesto. La cadena es finita POR EL CÓDIGO, no por el reloj:
  // chatIdiomaVoz avanza una vez por onerror y se detiene en es-MX, y un onend sin error de idioma ya
  // NO la reinicia (antes sí lo hacía: un silencio tras un cambio devolvía la cadena a es-419 y
  // recargaba el modelo de idioma en pleno dictado).
  if (!forzarIdioma) chatReintentosVoz++;

  const delay = chatUltimoErrorVoz === 'network' ? 900 : (forzarIdioma ? 400 : 300);
  if (aviso && !forzarIdioma && aviso.textContent.indexOf('Reintentando con idioma') === -1) {
    if (chatUltimoErrorVoz === 'network') {
      aviso.textContent = 'El servicio de voz no respondió, reintentando (' + chatReintentosVoz + '/' + maxReintentos + ')...';
    } else if (chatWatchdogDisparos > 0) {
      aviso.textContent = 'Volviendo a abrir el micrófono (' + chatReintentosVoz + '/' + maxReintentos + ')...';
    } else {
      aviso.textContent = 'No te escuché, reintentando (' + chatReintentosVoz + '/' + maxReintentos + ')...';
    }
  }

  limpiarTimerReintento();
  const esperado = recon;
  chatTimerReintento = setTimeout(function () {
    chatTimerReintento = null;
    // Triple guard. Antes este timer nunca se cancelaba y su guard se apoyaba en chatEscuchando,
    // que está en false entre r.start() y onstart: un onend viejo arrancaba una sesión nueva
    // DESPUÉS de que el usuario ya había empezado otra, dejando dos SpeechRecognition
    // escribiendo en el mismo #chatInput.
    if (!chatIntencionVozActiva || chatDetenidoPorUsuario) return;
    if (token !== chatSesionVoz) return;
    if (chatReconocedor && chatReconocedor !== esperado) return;
    iniciarReconocedorVoz();
  }, delay);
}

// ─── Detener ──────────────────────────────────────────

// Segunda pulsación: PARAR, siempre. Nunca reiniciar.
function detenerVozAhora() {
  chatDetenidoPorUsuario = true;
  limpiarTimerReintento();
  limpiarWatchdog();
  // La marca del reintento de idioma se suelta AQUÍ, no solo en el onend: desde este instante el
  // cierre ya no es el programado por onerror sino "el usuario.paró", así que dejarla puesta
  // mantendría una mentira en el estado durante lo que dure el pulso. Es la segunda de las dos
  // capas del arreglo del onend; la que decide es la guarda `!chatDetenidoPorUsuario` de la rama 0.
  chatIdiomaPendienteEnOnEnd = false;

  if (chatGrabando || chatDeteniendoGrabacion) {
    detenerGrabacion();
    return;
  }

  const mic = document.getElementById('chatMic');
  const aviso = document.getElementById('chatAvisoVoz');

  const r = chatReconocedor;
  if (r) {
    // stop() y NO abort(): abort() descarta el resultado pendiente y el usuario pierde la frase
    // que acababa de decir. El token NO sube, para que ese último onresult/onend siga contando.
    let ok = false;
    try { r.stop(); ok = true; } catch (e) { ok = false; }
    if (ok) return; // onend hace el cierre y pinta "Dictado detenido..."
    chatSesionVoz++;
    abortarReconocedorVoz();
    chatEscuchando = false;
    if (mic) mic.classList.remove('chat-mic-activo');
    if (aviso) aviso.textContent = 'Dictado detenido.';
    cerrarIntencionVoz();
    return;
  }

  // No había reconocedor vivo: lo que estaba en vuelo era el pre-check de permiso. El token sube
  // para que su .then no arranque nada, y se suelta el stream por si ya llegó a concederse.
  chatSesionVoz++;
  chatIniciandoVoz = false;
  chatEscuchando = false;
  chatIntencionVozActiva = false;
  chatGrabando = false;
  liberarStreamMic();
  if (mic) mic.classList.remove('chat-mic-activo');
  if (aviso) aviso.textContent = 'Dictado detenido.';
  cerrarIntencionVoz();
}

function chatearPorVoz() {
  const Reconocedor = window.SpeechRecognition || window.webkitSpeechRecognition;
  const mic = document.getElementById('chatMic');
  const aviso = document.getElementById('chatAvisoVoz');

  // Segunda pulsación = detener SIEMPRE. El guard anterior era solo `chatEscuchando`, que está
  // en false entre r.start() y onstart: tocar dos veces seguidas dejaba DOS reconocedores
  // escribiendo en el mismo input, y el toque de "cancelar" reiniciaba en vez de parar.
  if (chatIntencionVozActiva || chatIniciandoVoz || chatEscuchando || chatGrabando || chatDeteniendoGrabacion) {
    detenerVozAhora();
    return;
  }
  if (chatTranscribiendo) return; // la transcripción IA está en curso: ignora clics

  // Cierra el teclado móvil ANTES de arrancar cualquier ruta: con el input enfocado el teclado
  // tapa el aviso y el foco obliga al navegador a competir por el micrófono.
  const input = document.getElementById('chatInput');
  if (input && typeof input.blur === 'function') input.blur();

  // Flag adaptativo: Web Speech falló antes (network o cuelgue) → directo a grabación + IA
  if (usarGrabacionDirecta() || !Reconocedor) {
    grabarConMicrofono();
    return;
  }

  iniciarIntencionVoz();

  // Pre-check de permiso: diagnóstico claro si el navegador bloqueó el micrófono.
  if (navigator.mediaDevices && typeof navigator.mediaDevices.getUserMedia === 'function') {
    // Ya hay un stream vivo (Chrome escritorio mantiene el del pre-check): no se vuelve a pedir.
    // Pedirlo otra vez devuelve un stream NUEVO y el anterior se pierde sin detener sus tracks:
    // liberarStreamMic() solo conoce el valor actual, así que el viejo seguía tomando el
    // micrófono para siempre (punto 7).
    if (chatStreamMic) {
      iniciarReconocedorVoz();
      return;
    }
    const token = chatSesionVoz;
    navigator.mediaDevices.getUserMedia({ audio: true })
      .then(function (stream) {
        if (token !== chatSesionVoz) {          // el usuario canceló mientras se pedía permiso
          try { stream.getTracks().forEach(function (t) { t.stop(); }); } catch (e) {}
          return;
        }
        liberarStreamMic();                     // por si acaso: nunca sobrescribir un stream vivo
        // En escritorio el stream se mantiene vivo durante la sesión: liberarlo justo antes de
        // r.start() provoca una carrera en Chrome y el reconocimiento no recibe audio (network).
        // En móvil se suelta antes de r.start() (ver iniciarReconocedorVoz): un track extra
        // compite por el micrófono y produce no-speech y resultados vacíos.
        chatStreamMic = stream;
        chatIniciandoVoz = false;
        iniciarReconocedorVoz();
      })
      .catch(function () {
        if (token !== chatSesionVoz) return;
        chatIniciandoVoz = false;
        chatStreamMic = null;
        if (mic) mic.classList.remove('chat-mic-activo');
        if (aviso) aviso.textContent = 'El navegador bloqueó el micrófono. Verifica el permiso y vuelve a intentar.';
        // cerrarIntencionVoz() y no un reset a mano: además de chatIntencionVozActiva, este camino no
        // limpiaba chatReintentosVoz, chatTimerReintento ni la transcripción pendiente, así que el
        // siguiente toque heredaba el presupuesto de la pulsación fallida.
        cerrarIntencionVoz();
      });
    return;
  }

  chatIniciandoVoz = false;
  iniciarReconocedorVoz();
}

function liberarStreamMic() {
  if (chatStreamMic) {
    try {
      chatStreamMic.getTracks().forEach(function (t) { t.stop(); });
    } catch (e) { /* el stream ya no existe */ }
    chatStreamMic = null;
  }
}

function iniciarReconocedorVoz() {
  const Reconocedor = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!Reconocedor) {
    abortarReconocedorVoz();
    liberarStreamMic();
    cerrarIntencionVoz();
    return;
  }
  // Nunca dos reconocedores vivos: el anterior se aborta antes de crear el nuevo.
  abortarReconocedorVoz();
  // Se crea un reconocedor ⇒ el reintento de idioma anterior ya se consumió: la marca se suelta para
  // que el onend de ESTE reconocedor se comporte como cualquier fin de sesión real.
  chatIdiomaPendienteEnOnEnd = false;

  const movil = esPlataformaMovil();
  // Token monotónico de sesión. onstart/onresult/onerror/onend y el callback del timer de
  // reinicio comparan contra este valor: un evento de una sesión vieja no escribe nada.
  const token = ++chatSesionVoz;

  const r = new Reconocedor();
  chatReconocedor = r;
  r.lang = chatIdiomaVoz;
  if (movil) {
    // Push-to-talk: continuous:false hace que CADA pausa cierre la sesión, que es lo único
    // determinista en móvil (crbug 40948113 cierra el micro a ~1s de silencio igual, pero al
    // menos el cierre lo pedimos nosotros y no cae a mitad de una frase).
    r.continuous = false;
    // interimResults:false mata crbug 40272768 de raíz. Con interims, results los conserva y
    // Android los reemite, y cualquier lectura acumulativa da "II wokeI woke upI woke up".
    r.interimResults = false;
  } else {
    r.continuous = true;   // la sesión queda abierta hasta que el usuario la detenga
    r.interimResults = true;
  }

  const mic = document.getElementById('chatMic');
  const aviso = document.getElementById('chatAvisoVoz');

  r.onstart = function () {
    if (token !== chatSesionVoz) { try { r.abort(); } catch (e) {} return; }
    chatEscuchando = true;
    // chatDetenidoPorUsuario NO se resetea aquí: los flags de la pulsación se tocan solo en
    // iniciarIntencionVoz(). Si se pisara, un onstart tardío levantaría la orden de parar.
    if (mic) mic.classList.add('chat-mic-activo');
    // onstart dispara cuando la sesión ARRANCA, no cuando el micrófono ya entrega audio, así que
    // decir "Escuchando..." ahí era mentir. Estado honesto: el micrófono está abierto; "te
    // escucho" se muestra recién cuando llega el primer resultado.
    if (aviso) {
      aviso.textContent = 'Micrófono abierto, habla ahora (' + chatIdiomaVoz + ')' +
        (movil ? '. Al terminar, haz una pausa.' : '. Clic en el micrófono para detener.');
    }
    armarWatchdog(token, r);
  };

  r.onresult = function (event) {
    if (token !== chatSesionVoz) return; // sesión vieja: ni el input ni el aviso se tocan
    armarWatchdog(token, r);
    const res = event.results;

    // FINALES: reconstrucción IDEMPOTENTE desde 0. `results` es acumulativo (spec, SpeechRecognition
    // Event: "consists of zero or more final results followed by zero or more interim results") y
    // Android RE-EMITE finales ya procesados. Un acumulador de deltas duplica aunque el código sea
    // correcto, así que el texto final se recalcula desde cero en cada evento. Leer desde 0 es
    // seguro: la spec garantiza que las entradas por debajo de resultIndex son IDÉNTICAS a las del
    // evento anterior, así que no hay datos rancios.
    let final = '';
    for (let i = 0; i < res.length; i++) {
      if (!res[i].isFinal) continue;
      final = unirSegmentos(final, res[i][0].transcript);
    }

    // INTERIMS: solo desde event.resultIndex (marca de agua baja). Los resultados anteriores ya
    // son finales, pero sus interims siguen DENTRO de results: volver a leerlos desde 0 es
    // exactamente lo que producía el texto encadenado tipo "I wokeI woke up".
    let interim = '';
    if (r.interimResults) {
      for (let i = event.resultIndex; i < res.length; i++) {
        if (res[i].isFinal) continue;
        interim = unirSegmentos(interim, res[i][0].transcript);
      }
    }

    if (final) {
      // Este flag se marca UNA vez por pulsación, no en cada onstart: la pregunta que responde el
      // guard de reinicio es "¿el usuario obtuvo algo?", no "¿esta sesión capturó algo?".
      chatHuboResultadoFinal = true;
    }

    // DÓNDE va el texto en vivo, por plataforma:
    //  · Escritorio (continuous:true + interimResults:true): el interim SÍ va al input. Es el
    //    comportamiento histórico y es correcto ahí —con results acumulativo y el merge monótono de
    //    escribirTextoVoz() un interim re-emitido o refined no duplica nada—. Antes de esta rama el
    //    cambio a "nunca al input" se aplicaba a TODAS las plataformas y en escritorio el campo
    //    quedaba congelado en el último final mientras el usuario hablaba, que era la regresión que
    //    rompía el dictado en vivo de escritorio.
    //  · Móvil: no hay interims que escribir (interimResults:false, ver arriba). Cuando aun así llega
    //    uno, NO se escribe: la spec permite que el navegador lo sobrescriba, lo convierta en final
    //    o lo BORRE, así que no es texto definitivo (crbug 40272768).
    if (movil) {
      if (final) escribirTextoVoz(final);
    } else {
      escribirTextoVoz(unirSegmentos(final, interim));
    }

    if (aviso) {
      if (interim && movil) aviso.textContent = 'Te escucho… ' + normalizarEspacios(interim);
      else if (final) aviso.textContent = 'Texto transcrito. Puedes corregirlo y luego enviar.';
    }
  };

  r.onerror = function (event) {
    if (token !== chatSesionVoz) return;
    console.warn('Error de reconocimiento de voz:', event.error);
    const err = event.error || 'desconocido';

    // Fallback de idioma: se mantiene, pero SOLO ante 'language-not-supported'. El código anterior
    // además cambiaba es-419 → es-ES tras un silencio; en Android el silencio por la pausa es la
    // norma, así que se disparaba en el primer fallo y recargaba el modelo de idioma en pleno
    // dictado. Deja el cambio donde corresponde: un error de idioma declarado.
    if (err === 'language-not-supported' && chatIdiomaVoz !== 'es-MX') {
      chatIdiomaVoz = chatIdiomaVoz === 'es-419' ? 'es-ES' : 'es-MX';
      if (aviso) aviso.textContent = 'Reintentando con idioma ' + chatIdiomaVoz + '...';
      // La spec dispara `error` y LUEGO `end` (§ SpeechRecognitionErrorEvent). Ese onend llega
      // detrás y antes caía en la rama "fin de sesión": en móvil cerrabaIntencionVoz() —que hace
      // limpiarTimerReintento()— mataba el timer recién armado aquí y ponía
      // chatIntencionVozActiva = false, así que en móvil el fallback de idioma era CÓDIGO MUERTO:
      // unrecognized 1 → 1, nunca un segundo intento. (El código anterior no llamaba
      // programarReintento desde onerror justamente por eso: "onend reintentará".)
      // La marca le dice al onend "este cierre es mío, no cierres la pulsación". Se consume una vez
      // y programarReintento la suelta si no tenía a quién reintentar.
      chatIdiomaPendienteEnOnEnd = true;
      programarReintento(token, r, true);
      return;
    }

    // Errores recuperables: sin mensaje; onend decide si reintenta o cambia a la ruta 2
    if (err === 'no-speech' || err === 'aborted' || err === 'network') {
      if (err === 'network' && navigator.onLine === false) {
        chatEscuchando = false;
        chatDetenidoPorUsuario = true;
        chatErrorVoz = true;
        liberarStreamMic();
        if (mic) mic.classList.remove('chat-mic-activo');
        if (aviso) aviso.textContent = 'No hay conexión a internet. El dictado por voz necesita internet. Escribe a mano o reconecta.';
        return;
      }
      chatUltimoErrorVoz = err;
      // Evidencia de plataforma para el watchdog: solo estos errores prueban que la Web Speech API
      // no funciona en este dispositivo. 'no-speech' y 'aborted' describen al usuario en silencio.
      if (CHAT_ERRORES_FALLO_PLATAFORMA.indexOf(err) !== -1) chatEvidenciaFalloVoz = true;
      return;
    }

    if (CHAT_ERRORES_FALLO_PLATAFORMA.indexOf(err) !== -1) chatEvidenciaFalloVoz = true;
    chatEscuchando = false;
    chatDetenidoPorUsuario = true; // error real: no reintentar
    chatErrorVoz = true;
    liberarStreamMic();
    if (mic) mic.classList.remove('chat-mic-activo');
    if (aviso) aviso.textContent = 'No se pudo escuchar (error: ' + err + '). Escribe a mano.';
  };

  r.onend = function () {
    if (token !== chatSesionVoz) return; // sesión vieja: ni UI ni temporizadores
    limpiarWatchdog();
    chatEscuchando = false;
    if (chatReconocedor === r) chatReconocedor = null;
    // El stream del pre-check se suelta AQUÍ, no justo antes de reiniciar como antes: cualquier
    // stream vivo compite por el micrófono y en Android/iOS produce no-speech y resultados vacíos.
    liberarStreamMic();
    if (mic) mic.classList.remove('chat-mic-activo');

    // 0) Cierre PROGRAMADO por onerror (fallback de idioma). La spec dispara error y luego end; este
    //    end NO es el final de la pulsación sino el final de un intento que ya tiene Replacement
    //    armado. Se consume la marca y se sale sin cerrar: cerrar aquí mataba el timer y apagaba la
    //    pulsación, que era el motivo de que en móvil no hubiera NUNCA un segundo intento de idioma.
    //
    //    PERO solo si el usuario NO.paró en medio. La marca se levanta en onerror y el onend llega
    //    detrás, así que un toque de PARAR entre ambos hacía que el cierre del usuario se
    //    consumiera como si fuera el programado: se salía sin cerrar, la pulsación seguía viva y
    //    el toque de "cerrar" se gastaba; al siguiente toque el micrófono ya no escuchaba y hacía
    //    falta un TERCER toque para volver a hablar. Además quedaba congelado el aviso mentiroso
    //    "Reintentando con idioma es-ES..." con el micrófono ya cerrado. La condición que
    //    significa "este cierre es el mío" es chatDetenidoPorUsuario, así que se exige su
    //    ausencia: arregla la CLASE de bug, no solo este camino, porque cualquier vía que levante
    //    chatDetenidoPorUsuario antes de un onend sufría lo mismo.
    if (chatIdiomaPendienteEnOnEnd && !chatDetenidoPorUsuario) {
      chatIdiomaPendienteEnOnEnd = false;
      return;
    }

    // 1) Error fatal ya comunicado en onerror → no pisar su aviso.
    if (chatErrorVoz) {
      chatErrorVoz = false;
      chatUltimoErrorVoz = null;
      cerrarIntencionVoz();
      return;
    }

    // 2) El usuario paró a propósito. Aquí se distingue "no te escuché" de "se cortó": el usuario
    //    necesita saber si quedó texto en el campo o no.
    if (chatDetenidoPorUsuario) {
      if (aviso) {
        aviso.textContent = chatHuboResultadoFinal
          ? 'Dictado detenido. Revisa el texto antes de enviar.'
          : 'Dictado detenido, no se escribió nada.';
      }
      cerrarIntencionVoz();
      return;
    }

    // 3) ¿Auto-reinicio? En escritorio se conserva el comportamiento histórico (hasta 3), que hace
    //    falta porque el silencio en Chrome Desktop NO cierra la sesión. En móvil NO: con
    //    push-to-talk el final de sesión es el final de la pulsación, y reintentar ahí es
    //    justamente lo que concatenaba palabras. Solo se reintenta ante un error real.
    const falloRecuperable = chatUltimoErrorVoz === 'network' ||
      chatUltimoErrorVoz === 'no-speech' || chatUltimoErrorVoz === 'aborted';
    const maxReintentos = movil ? CHAT_REINTENTOS_MOVIL : CHAT_REINTENTOS_ESCRITORIO;
    if (!chatHuboResultadoFinal && chatReintentosVoz < maxReintentos && (!movil || falloRecuperable)) {
      programarReintento(token, r);
      return;
    }

    // 4) Fin de sesión.
    if (!chatHuboResultadoFinal) {
      if (chatUltimoErrorVoz === 'network') {
        // Único 'network' que sí es diagnóstico: lo reportó el motor de voz, no el reloj. Aun así
        // la preferencia se guarda con CADUCIDAD (marcarUsarGrabacion) para que un problema de red
        // del cole o una VPN no atrapen al usuario en Gemini de forma permanente.
        marcarUsarGrabacion();
        if (aviso) aviso.textContent = 'El servicio de voz no respondió. Cambiando a modo grabación + IA...';
        cerrarIntencionVoz();
        grabarConMicrofono(true);
        return;
      }
      if (aviso) aviso.textContent = 'No te escuché, no se escribió nada. Toca el micrófono e inténtalo de nuevo.';
    } else if (aviso) {
      aviso.textContent = 'Texto transcrito. Puedes corregirlo y luego enviar.';
    }
    cerrarIntencionVoz();
  };

  try {
    // Móvil: se suelta el stream del pre-check antes de arrancar. Un MediaStreamTrack extra compite
    // por el micrófono en Android/iOS y produce no-speech y resultados vacíos.
    if (movil) liberarStreamMic();
    r.start();
    // `chatEscuchando` en true desde YA: cubre la ventana entre r.start() y onstart, en la que
    // antes un segundo toque pasaba como "no está escuchando" y arrancaba otra sesión.
    chatEscuchando = true;
    // Watchdog armado antes de r.start(): cubre también el caso de que ni siquiera llegue onstart.
    armarWatchdog(token, r);
  } catch (err) {
    console.warn('No se pudo iniciar el reconocimiento de voz:', err);
    limpiarWatchdog();
    chatEscuchando = false;
    if (chatReconocedor === r) chatReconocedor = null;
    liberarStreamMic();
    if (mic) mic.classList.remove('chat-mic-activo');
    // Sin cerrar la pulsación el micrófono quedaba en "modo detener" para siempre: el siguiente
    // toque entraba por la rama de parada y no volvía a escuchar nunca.
    chatDetenidoPorUsuario = true;
    if (aviso) aviso.textContent = 'El navegador bloqueó el micrófono. Verifica el permiso y vuelve a intentar.';
    cerrarIntencionVoz();
  }
}

// ─── GRABACIÓN + IA (ruta 2: cuando Web Speech falla, se cuelga o no existe) ──

function grabarConMicrofono(desdeFallback) {
  const mic = document.getElementById('chatMic');
  const aviso = document.getElementById('chatAvisoVoz');

  if (chatIniciandoVoz) return;
  if (chatTranscribiendo) return; // ya se está transcribiendo: ignora
  if (!navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== 'function' || typeof MediaRecorder === 'undefined') {
    if (aviso) aviso.textContent = 'Tu navegador no permite grabar audio. Escribe a mano.';
    return;
  }
  if (typeof window.transcribirAudioConGemini !== 'function') {
    if (aviso) aviso.textContent = 'La transcripción con IA requiere conexión y Firebase AI Logic. Escribe a mano.';
    return;
  }

  chatIniciandoVoz = true;
  chatErrorGrabacion = false;
  chatDeteniendoGrabacion = false;
  // La ruta 2 NO usa chatUsuarioEditoVoz / chatTranscripcionPendiente / chatTextoVozEnCampo: aquí la
  // transcripción es ÚNICA y llega de golpe, así que detectar si el usuario escribió mientras se
  // transcribe se hace comparando el valor del input contra el de la pulsación (ver
  // transcribirConGemini). Es el mismo criterio único que usa la ruta 1 en escribirTextoVoz, sin
  // necesidad de un segundo estado congelado.
  // El valor del input se captura UNA vez al empezar la pulsación: es lo que permite distinguir
  // "el usuario escribió mientras grababa" de "quedó transcripción".
  const input = document.getElementById('chatInput');
  chatInputValorAlIniciar = input ? input.value : '';
  chatInputVacioAlIniciar = normalizarEspacios(chatInputValorAlIniciar) === '';
  const token = ++chatSesionVoz; // permite cancelar con un toque mientras se pide el permiso
  if (aviso && !desdeFallback) aviso.textContent = 'Solicitando permiso del micrófono...';

  navigator.mediaDevices.getUserMedia({ audio: true })
    .then(function (stream) {
      if (token !== chatSesionVoz) {   // el usuario detuvo mientras se pedía el permiso
        try { stream.getTracks().forEach(function (t) { t.stop(); }); } catch (e) {}
        return;
      }
      chatIniciandoVoz = false;
      liberarStreamGrabacion();        // nunca sobrescribir un stream vivo sin soltar el anterior
      chatStreamGrabacion = stream;
      const mime = typeof MediaRecorder.isTypeSupported === 'function' && MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : '';
      let grabadora;
      try {
        grabadora = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
      } catch (e) {
        grabadora = new MediaRecorder(stream); // fallback al formato default
      }
      chatGrabadora = grabadora;
      chatChunksAudio = [];
      grabadora.ondataavailable = function (e) {
        if (e.data && e.data.size > 0) chatChunksAudio.push(e.data);
      };
      grabadora.onstop = function () {
        procesarAudioGrabado(grabadora);
      };
      grabadora.onerror = function (e) {
        console.warn('Error del MediaRecorder:', e && e.error);
        limpiarTimeoutGrabacion();
        chatGrabando = false;
        chatDeteniendoGrabacion = false;
        chatEscuchando = false;
        chatGrabadora = null;
        chatChunksAudio = [];
        chatErrorGrabacion = true;
        liberarStreamGrabacion();
        if (mic) mic.classList.remove('chat-mic-activo');
        if (aviso) aviso.textContent = 'La grabación falló (error del micrófono). Escribe a mano.';
      };
      try {
        grabadora.start();
      } catch (e) {
        chatGrabadora = null;
        chatGrabando = false;
        chatEscuchando = false;
        liberarStreamGrabacion();
        if (aviso) aviso.textContent = 'No se pudo iniciar la grabación. Escribe a mano.';
        return;
      }
      chatGrabando = true;
      chatEscuchando = true;
      chatDetenidoPorUsuario = false;
      if (mic) mic.classList.add('chat-mic-activo');
      if (aviso) aviso.textContent = 'Grabando... clic para detener.';
      // Tope de duración: Gemini inline tiene límite de tamaño (~20MB)
      limpiarTimeoutGrabacion();
      chatTimeoutGrabacion = setTimeout(function () {
        if (chatGrabando) {
          if (aviso) aviso.textContent = 'Grabación máxima alcanzada (60s).';
          detenerGrabacion();
        }
      }, 60000);
    })
    .catch(function () {
      if (token !== chatSesionVoz) return;
      chatIniciandoVoz = false;
      chatStreamGrabacion = null;
      if (mic) mic.classList.remove('chat-mic-activo');
      if (aviso) aviso.textContent = 'El navegador bloqueó el micrófono. Verifica el permiso y vuelve a intentar.';
      // cerrarIntencionVoz() y no un reset a mano: sin él quedan sin limpiar chatReintentosVoz,
      // chatTimerReintento, chatWatchdogDisparos y la transcripción pendiente.
      cerrarIntencionVoz();
    });
}

function limpiarTimeoutGrabacion() {
  if (chatTimeoutGrabacion) {
    clearTimeout(chatTimeoutGrabacion);
    chatTimeoutGrabacion = null;
  }
}

function detenerGrabacion() {
  limpiarTimeoutGrabacion();
  // IDEMPOTENTE. Sin este flag un doble toque en "detener" llamaba dos veces a
  // procesarAudioGrabado: chatGrabando seguía en true, el MediaRecorder seguía en 'recording'
  // (stop() se aceptaba otra vez) y se generaba un segundo onstop. La segunda pasada veía
  // chatChunksAudio ya vaciado y pisaba el aviso con "No se capturó audio", tirando una
  // transcripción que sí estaba bien.
  if (chatDeteniendoGrabacion) return;
  if (!chatGrabadora) return; // ya se limpió (error o stop previo)
  if (chatGrabadora.state !== 'inactive') {
    chatDeteniendoGrabacion = true; // se pone ANTES de stop(), que dispara onstop de forma asíncrona
    chatGrabadora.stop(); // onstop → procesarAudioGrabado
    return;
  }
  // El recorder ya se detuvo (doble clic o error): limpia el estado visual
  chatGrabando = false;
  chatEscuchando = false;
  const mic = document.getElementById('chatMic');
  const aviso = document.getElementById('chatAvisoVoz');
  if (mic) mic.classList.remove('chat-mic-activo');
  if (aviso && aviso.textContent.indexOf('Grabando') !== -1) {
    aviso.textContent = 'Grabación detenida.';
  }
}

function liberarStreamGrabacion() {
  if (chatStreamGrabacion) {
    try {
      chatStreamGrabacion.getTracks().forEach(function (t) { t.stop(); });
    } catch (e) { /* el stream ya no existe */ }
    chatStreamGrabacion = null;
  }
}

// Devuelve el micrófono y el flag de transcripción tras una transcripción fallida. Vive fuera del
// handler del FileReader a propósito: las rutas de fallo del reader están POR ENCIMA de
// transcribirConGemini(), así que el `finally` de esa función no se alcanzaba nunca y el botón se
// quedaba en disabled + chatTranscribiendo=true PARA SIEMPRE: no había forma de volver a hablar sin
// recargar la página. Es idempotente y respeta setChatOcupado (que puede tener el botón deshabilitado
// porque Gemini está pensando), igual que el `finally` de transcribirConGemini.
function liberarMicrofonoTrasFalloTranscripcion() {
  chatTranscribiendo = false;
  const mic = document.getElementById('chatMic');
  if (mic) mic.disabled = chatEsperando;
}

function procesarAudioGrabado(grabadora) {
  const mic = document.getElementById('chatMic');
  const aviso = document.getElementById('chatAvisoVoz');

  limpiarTimeoutGrabacion();
  chatDeteniendoGrabacion = false;
  if (chatErrorGrabacion) {
    chatErrorGrabacion = false;
    return; // onerror ya limpió el estado y mostró el aviso
  }
  chatGrabando = false;
  chatEscuchando = false;
  if (mic) mic.classList.remove('chat-mic-activo');
  liberarStreamGrabacion();

  const blob = new Blob(chatChunksAudio, { type: grabadora.mimeType || 'audio/webm' });
  chatChunksAudio = [];
  chatGrabadora = null;

  if (blob.size === 0) {
    if (aviso) aviso.textContent = 'No se capturó audio. Intenta de nuevo.';
    return;
  }

  if (aviso) aviso.textContent = 'Transcribiendo con IA...';
  chatTranscribiendo = true;
  if (mic) mic.disabled = true; // evita un segundo clic mientras transcribe

  const mimeType = (blob.type || 'audio/webm').split(';')[0];
  const lector = new FileReader();
  let entregadoAGemini = false;
  lector.onload = function () {
    try {
      const dataUrl = String(lector.result || '');
      const base64 = dataUrl.split(',')[1] || '';
      if (!base64) {
        liberarMicrofonoTrasFalloTranscripcion();
        if (aviso) aviso.textContent = 'No se pudo leer el audio grabado. Escribe a mano.';
        return;
      }
      entregadoAGemini = true;
      transcribirConGemini(base64, mimeType);
    } finally {
      // Defensa en profundidad: cualquier salida del handler —incluida una excepción inesperada—
      // devuelve el micrófono. Cuando el audio SÍ se entregó, el `finally` de transcribirConGemini
      // es quien restaura (y lo hace al FINAL de la transcripción, no antes): por eso el flag, para
      // no liberar el botón mientras Gemini sigue trabajando.
      if (!entregadoAGemini) liberarMicrofonoTrasFalloTranscripcion();
    }
  };
  lector.onerror = function () {
    liberarMicrofonoTrasFalloTranscripcion();
    if (aviso) aviso.textContent = 'No se pudo leer el audio grabado. Escribe a mano.';
  };
  try {
    lector.readAsDataURL(blob);
  } catch (e) {
    liberarMicrofonoTrasFalloTranscripcion();
    if (aviso) aviso.textContent = 'No se pudo leer el audio grabado. Escribe a mano.';
  }
}

async function transcribirConGemini(base64, mimeType) {
  const aviso = document.getElementById('chatAvisoVoz');
  try {
    const texto = (await esperarConGemini(
      window.transcribirAudioConGemini(base64, mimeType),
      CHAT_MS_IA_TRANSCRIPCION,
      'La IA no respondió a tiempo.'
    )) || '';
    const input = document.getElementById('chatInput');
    if (input && texto.trim()) {
      const valorActual = input.value;
      if (chatInputVacioAlIniciar) {
        // Si el usuario escribió mientras transcribía, concatena en vez de pisar
        if (valorActual.trim() !== '' && valorActual !== chatInputValorAlIniciar) {
          input.value = (valorActual.trim() + ' ' + texto.trim()).trim();
        } else {
          input.value = texto.trim();
        }
      } else {
        input.value = (valorActual.trim() + ' ' + texto.trim()).trim();
      }
    }
    if (aviso) aviso.textContent = 'Texto transcrito con IA. Puedes corregirlo y enviar.';
  } catch (err) {
    console.warn('Error transcribiendo audio con Gemini:', err);
    const msg = String((err && err.message) || err || '');
    if (err && err.chatSinRespuesta) {
      // No hace falta llamar a liberarMicrofonoTrasFalloTranscripcion() aquí: el `finally` de
      // abajo hace exactamente eso (chatTranscribiendo=false y mic.disabled=chatEsperando). El
      // corte solo necesita su propio mensaje.
      if (aviso) aviso.textContent = 'La IA no respondió. Escribe a mano o intenta de nuevo.';
    } else if (/mime|unsupported|invalid/i.test(msg)) {
      if (aviso) aviso.textContent = 'El formato de audio no fue aceptado. Escribe a mano.';
    } else {
      if (aviso) aviso.textContent = 'La IA no pudo transcribir el audio. Verifica tu conexión e intenta de nuevo, o escribe a mano.';
    }
  } finally {
    chatTranscribiendo = false;
    const mic = document.getElementById('chatMic');
    if (mic) mic.disabled = chatEsperando; // restaura (setChatOcupado pudo deshabilitarlo)
  }
}

// ─── ARRANQUE ─────────────────────────────────────────
iniciarChat();
