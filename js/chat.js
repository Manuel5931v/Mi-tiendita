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

// ─── FLUJO DE TEXTO ───────────────────────────────────

function enviarMensajeChat() {
  const input = document.getElementById('chatInput');
  if (!input || chatEsperando) return;
  const texto = input.value.trim();
  if (!texto) return;
  input.value = '';
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
    const textoIA = (await generar(construirSystemPromptChat(), texto)) || '';
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
    agregarMensajeChat('Ocurrió un error al consultar la IA. Revisa tu conexión e intenta de nuevo.', 'error');
  } finally {
    setChatOcupado(false);
  }
}

function construirSystemPromptChat() {
  const modo = esModoNegocio() ? 'negocio (tienda)' : 'bodega';
  const lineas = productos.map(p =>
    `- id:${p.id} | nombre:${p.nombre} | marca:${p.marca || 'sin marca'} | unidad:${p.unidad || 'unidad'} | precioVenta:${p.precioVenta ?? 0} | stock:${p.stock}`
  );
  return 'Eres "Asistente", el asistente conversacional en español de una app de control de inventario llamada "Mi Tiendita". ' +
    'Debes interpretar la frase del usuario pensando en el INVENTARIO REAL del modo ' + modo + ' que se lista abajo, ' +
    'y responder ÚNICAMENTE con un objeto JSON válido: sin texto adicional, sin markdown, sin comentarios.\n' +
    'INVENTARIO REAL (usa SIEMPRE el campo "id" exacto tal como aparece):\n' + lineas.join('\n') + '\n\n' +
    'FORMATO DE RESPUESTA (elige EXACTAMENTE una de estas opciones):\n' +
    '1) Venta identificable sin duda: {"accion":"venta","productoId":"<id exacto>","cantidad":<entero 1-9999>}\n' +
    '2) Abastecimiento identificable sin duda: {"accion":"abastecer","productoId":"<id exacto>","cantidad":<entero 1-9999>}\n' +
    '3) Pregunta o consulta (cuánto hay, precio, información): {"accion":"consulta","respuesta":"<texto corto en español>"}\n' +
    '4) La frase pide una acción pero NO puedes identificar SIN DUDA el producto (varios similares o nombre distinto al de la lista): ' +
    '{"accion":"ambiguo","candidatos":[{"productoId":"<id exacto>","nombre":"<nombre exacto>","marca":"...","unidad":"...","precioVenta":<número>,"cantidad":<cantidad inferida o 1>,"accion":"venta o abastecer"}]}\n\n' +
    'Reglas: nunca inventes productos ni ids que no estén en la lista; la cantidad siempre entre 1 y 9999; ' +
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

// ─── VOZ ─────────────────────────────────────────

let chatReintentosVoz = 0;          // reintentos automáticos tras un final sin audio
let chatDetenidoPorUsuario = false; // true si el usuario detuvo (o hubo error fatal): no reintentar
let chatHuboResultadoFinal = false; // se transcribió al menos un resultado final
let chatErrorVoz = false;           // true si se mostró un error fatal (no sobrescribir el aviso)
let chatIniciandoVoz = false;       // true mientras se verifica el permiso del micrófono
let chatIdiomaVoz = 'es-419';       // idioma activo; cae a es-ES/es-MX si no se soporta
let chatUltimoErrorVoz = null;      // último error recuperable ('no-speech'/'aborted'/'network') o null
let chatStreamMic = null;           // stream del pre-check de permiso; se libera al terminar
let chatGrabadora = null;           // MediaRecorder activo (modo grabación + IA)
let chatChunksAudio = [];           // chunks de audio acumulados durante la grabación
let chatGrabando = false;           // true mientras se graba (fallback IA)
let chatStreamGrabacion = null;     // stream del micrófono en modo grabación
let chatTranscribiendo = false;     // true mientras Gemini transcribe el audio grabado
let chatTimeoutGrabacion = null;    // timeout del tope de 60s de grabación
let chatInputValorAlIniciar = '';   // valor del input al iniciar la grabación
let chatErrorGrabacion = false;     // true si el MediaRecorder falló (onerror)

// Flag adaptativo: si Web Speech falló con network, la próxima vez ir directo a grabación + IA
function usarGrabacionDirecta() {
  try {
    return localStorage.getItem('vozUsarGrabacion') === '1';
  } catch (e) { return false; }
}

function marcarUsarGrabacion() {
  try {
    localStorage.setItem('vozUsarGrabacion', '1');
  } catch (e) { /* almacenamiento no disponible */ }
}

function chatearPorVoz() {
  const Reconocedor = window.SpeechRecognition || window.webkitSpeechRecognition;
  const mic = document.getElementById('chatMic');
  const aviso = document.getElementById('chatAvisoVoz');

  // Segundo clic: detener lo que esté activo (reconocimiento o grabación)
  if (chatEscuchando) {
    chatDetenidoPorUsuario = true;
    if (chatGrabando) {
      detenerGrabacion();
    } else if (chatReconocedor) {
      chatReconocedor.stop();
    }
    return;
  }
  if (chatIniciandoVoz) return; // ya se está pidiendo el permiso
  if (chatTranscribiendo) return; // la transcripción IA está en curso: ignora clics

  // Flag adaptativo: Web Speech falló antes con network → ir directo a grabación + IA
  if (usarGrabacionDirecta()) {
    grabarConMicrofono();
    return;
  }

  // Sin Web Speech API → modo grabación + IA directo
  if (!Reconocedor) {
    grabarConMicrofono();
    return;
  }

  chatIniciandoVoz = true;
  chatReintentosVoz = 0;
  if (aviso) aviso.textContent = 'Solicitando permiso del micrófono...';

  // Pre-check de permiso: diagnóstico claro si el navegador bloqueó el micrófono
  if (navigator.mediaDevices && typeof navigator.mediaDevices.getUserMedia === 'function') {
    navigator.mediaDevices.getUserMedia({ audio: true })
      .then(function (stream) {
        // Mantén el stream vivo: liberarlo justo antes de r.start() causa una
        // carrera en Chrome y el reconocimiento no recibe audio (error network).
        chatStreamMic = stream;
        chatIniciandoVoz = false;
        iniciarReconocedorVoz();
      })
      .catch(function () {
        chatIniciandoVoz = false;
        chatStreamMic = null;
        if (mic) mic.classList.remove('chat-mic-activo');
        if (aviso) aviso.textContent = 'El navegador bloqueó el micrófono. Verifica el permiso y vuelve a intentar.';
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
  if (!Reconocedor || chatEscuchando) {
    liberarStreamMic();
    return;
  }

  const r = new Reconocedor();
  chatReconocedor = r;
  r.lang = chatIdiomaVoz;
  r.continuous = true;   // la sesión queda abierta hasta que el usuario la detenga
  r.interimResults = true;

  const mic = document.getElementById('chatMic');
  const aviso = document.getElementById('chatAvisoVoz');

  r.onstart = function () {
    chatEscuchando = true;
    chatDetenidoPorUsuario = false;
    chatHuboResultadoFinal = false;
    chatErrorVoz = false;
    chatUltimoErrorVoz = null;
    const input = document.getElementById('chatInput');
    chatInputVacioAlIniciar = !input || input.value.trim() === '';
    if (mic) mic.classList.add('chat-mic-activo');
    if (aviso) aviso.textContent = 'Escuchando... habla ahora (' + chatIdiomaVoz + '). Clic en el micrófono para detener.';
  };

  r.onresult = function (event) {
    let final = '';
    let interim = '';
    for (let i = 0; i < event.results.length; i++) {
      const t = event.results[i][0].transcript;
      if (event.results[i].isFinal) final += t;
      else interim += t;
    }
    if (final) chatHuboResultadoFinal = true;
    const input = document.getElementById('chatInput');
    if (input) {
      const textoVoz = (final + ' ' + interim).replace(/\s+/g, ' ').trim();
      if (textoVoz) {
        if (chatInputVacioAlIniciar) {
          input.value = textoVoz;
        } else if (final) {
          // Con continuous:true, `final` acumula todos los segmentos;
          // agrega solo el último (nuevo) para no duplicar.
          const ultimo = event.results[event.results.length - 1];
          const nuevo = ultimo && ultimo.isFinal ? ultimo[0].transcript.trim() : '';
          if (nuevo) input.value = (input.value.trim() + ' ' + nuevo).trim();
        }
      }
    }
    if (final && aviso) {
      aviso.textContent = 'Texto transcrito. Puedes corregirlo y luego enviar.';
    }
  };

  r.onerror = function (event) {
    console.warn('Error de reconocimiento de voz:', event.error);
    const err = event.error || 'desconocido';

    // Fallback de idioma: algunos Chrome no soportan el locale regional
    if (err === 'language-not-supported' && chatIdiomaVoz !== 'es-MX') {
      chatIdiomaVoz = chatIdiomaVoz === 'es-419' ? 'es-ES' : 'es-MX';
      if (aviso) aviso.textContent = 'Reintentando con idioma ' + chatIdiomaVoz + '...';
      return; // onend reintentará automáticamente con el nuevo idioma
    }

    // Errores recuperables: no mostrar mensaje, onend reintentará
    if (err === 'no-speech' || err === 'aborted' || err === 'network') {
      // Sin conexión: no tiene sentido reintentar, mensaje claro
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
      return; // onend reintentará
    }

    chatEscuchando = false;
    chatDetenidoPorUsuario = true; // error real: no reintentar
    chatErrorVoz = true;
    liberarStreamMic();
    if (mic) mic.classList.remove('chat-mic-activo');
    if (aviso) aviso.textContent = 'No se pudo escuchar (error: ' + err + '). Escribe a mano.';
  };

  r.onend = function () {
    chatEscuchando = false;
    liberarStreamMic();
    if (mic) mic.classList.remove('chat-mic-activo');

    // Si terminó sin que el usuario lo detuviera y sin transcribir nada,
    // reintenta automáticamente (máx. 3) para no morir al primer silencio.
    if (!chatDetenidoPorUsuario && !chatHuboResultadoFinal && chatReintentosVoz < 3) {
      chatReintentosVoz++;
      // Si el primer intento con es-419 murió sin audio, cambia de idioma
      if (chatReintentosVoz === 1 && chatIdiomaVoz === 'es-419' && chatUltimoErrorVoz !== 'network') {
        chatIdiomaVoz = 'es-ES';
      }
      if (aviso && aviso.textContent.indexOf('Reintentando con idioma') === -1) {
        if (chatUltimoErrorVoz === 'network') {
          aviso.textContent = 'El servicio de voz no respondió, reintentando (' + chatReintentosVoz + '/3)...';
        } else {
          aviso.textContent = 'No te escuché, reintentando (' + chatReintentosVoz + '/3)...';
        }
      }
      const recon = r;
      const delay = chatUltimoErrorVoz === 'network' ? 900 : 300;
      setTimeout(function () {
        if (chatReconocedor === recon && !chatEscuchando && !chatDetenidoPorUsuario) {
          iniciarReconocedorVoz();
        }
      }, delay);
      return;
    }

    chatReintentosVoz = 0;
    if (aviso && !chatErrorVoz && !chatHuboResultadoFinal) {
      if (chatUltimoErrorVoz === 'network') {
        // El servicio de voz de Chrome no responde: cambia a grabación + IA
        // y recuerda la preferencia para ir directo la próxima vez
        marcarUsarGrabacion();
        aviso.textContent = 'El servicio de voz no respondió. Cambiando a modo grabación + IA...';
        grabarConMicrofono(true);
      } else {
        aviso.textContent = 'Dictado finalizado.';
      }
    }
    chatErrorVoz = false;
    chatUltimoErrorVoz = null;
  };

  try {
    r.start();
  } catch (err) {
    console.warn('No se pudo iniciar el reconocimiento de voz:', err);
    chatEscuchando = false;
    liberarStreamMic();
    if (mic) mic.classList.remove('chat-mic-activo');
    if (aviso) aviso.textContent = 'El navegador bloqueó el micrófono. Verifica el permiso y vuelve a intentar.';
  }
}

// ─── GRABACIÓN + IA (fallback cuando Web Speech falla o no existe) ──

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
  const input = document.getElementById('chatInput');
  chatInputVacioAlIniciar = !input || input.value.trim() === '';
  chatInputValorAlIniciar = input ? input.value : '';
  if (aviso && !desdeFallback) aviso.textContent = 'Solicitando permiso del micrófono...';

  navigator.mediaDevices.getUserMedia({ audio: true })
    .then(function (stream) {
      chatIniciandoVoz = false;
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
      chatIniciandoVoz = false;
      chatStreamGrabacion = null;
      if (mic) mic.classList.remove('chat-mic-activo');
      if (aviso) aviso.textContent = 'El navegador bloqueó el micrófono. Verifica el permiso y vuelve a intentar.';
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
  if (!chatGrabadora) return; // ya se limpió (error o stop previo)
  if (chatGrabadora.state !== 'inactive') {
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

function procesarAudioGrabado(grabadora) {
  const mic = document.getElementById('chatMic');
  const aviso = document.getElementById('chatAvisoVoz');

  limpiarTimeoutGrabacion();
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
  lector.onload = function () {
    const dataUrl = String(lector.result || '');
    const base64 = dataUrl.split(',')[1] || '';
    if (!base64) {
      if (aviso) aviso.textContent = 'No se pudo leer el audio grabado. Escribe a mano.';
      return;
    }
    transcribirConGemini(base64, mimeType);
  };
  lector.onerror = function () {
    if (aviso) aviso.textContent = 'No se pudo leer el audio grabado. Escribe a mano.';
  };
  lector.readAsDataURL(blob);
}

async function transcribirConGemini(base64, mimeType) {
  const aviso = document.getElementById('chatAvisoVoz');
  try {
    const texto = (await window.transcribirAudioConGemini(base64, mimeType)) || '';
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
    if (/mime|unsupported|invalid/i.test(msg)) {
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