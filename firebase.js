/* =========================================================
   firebase.js — Autenticación opcional + Sincronización
   gateada por membresía paga (Realtime Database)
   Mi Tiendita 🛒
   =========================================================
   FLUJO (Opción B):
   1. La app SIEMPRE arranca en modo local (localStorage),
      igual que antes de tener Firebase. Nunca se bloquea
      por falta de sesión.
   2. El login/registro se ofrece como una opción dentro de
      Configuración ("Sincronizar con la nube"), no como
      pantalla obligatoria al inicio.
   3. Si el usuario inicia sesión pero NO tiene una membresía
      activa, la app le avisa y sigue funcionando 100% local
      (sin subir/bajar nada de Firebase).
   4. Si tiene membresía activa, se activa la sincronización
      real con Realtime Database.

   IMPORTANTE — SEGURIDAD:
   El estado de la membresía (activa/vencida) SOLO lo puede
   escribir tu backend (Cloud Function) cuando confirma un
   pago real con tu pasarela de pago (Stripe, etc.). El
   cliente (este archivo) únicamente LEE ese estado. Las
   reglas de Firebase deben impedir que el navegador escriba
   en /usuarios/{uid}/membresia. Ver INSTRUCCIONES.md.
   ========================================================= */

// -----------------------------------------------------------
// 1. CONFIGURACIÓN — reemplaza con los datos de TU proyecto
// -----------------------------------------------------------
const firebaseConfig = {
  apiKey: "AIzaSyBqAweNkjRVO37yGwNhEPGsnZZKl4NrHdQ",
  authDomain: "login-user-data-dfefd.firebaseapp.com",
  databaseURL: "https://login-user-data-dfefd-default-rtdb.firebaseio.com",
  projectId: "login-user-data-dfefd",
  storageBucket: "login-user-data-dfefd.firebasestorage.app",
  messagingSenderId: "27466066663",
  appId: "1:27466066663:web:cb13c09560ca6393bad042"
};

firebase.initializeApp(firebaseConfig);

const auth = firebase.auth();
const db = firebase.database();

let uidActual = null;        // uid del usuario logueado (o null)
let syncHabilitado = false;  // true solo si hay sesión + membresía activa
let _membresiaListenerRef = null;
let _guardarFirebaseTimeout = null;
let _guardarPedidosFirebaseTimeout = null;

// -----------------------------------------------------------
// 2. ARRANQUE — la app SIEMPRE carga local primero
//    Llama a esto tú mismo al final de tu index.html
//    (reemplaza tu antiguo window.onload / DOMContentLoaded).
// -----------------------------------------------------------
function iniciarApp() {
  cargarDeStorage();
  cargarHistorialDeStorage();
  cargarDemoSiVacio();

  if (modoApp) {
    aplicarModo();
    renderDashboard();
  } else {
    mostrarSelectorModo();
  }

  // Si el usuario ya tenía una sesión abierta (recordada por
  // el navegador), onAuthStateChanged se disparará solo y
  // decidirá si activa la sincronización.
}

// -----------------------------------------------------------
// 3. LOGIN / LOGOUT (se llaman desde Configuración)
//    Autenticación únicamente con Google.
// -----------------------------------------------------------
function iniciarSesionConGoogle() {
  const provider = new firebase.auth.GoogleAuthProvider();
  return auth.signInWithPopup(provider)
    .then((cred) => cred.user)
    .catch((err) => {
      toast(traducirErrorFirebase(err), "error");
      throw err;
    });
}

function cerrarSesion() {
  return auth.signOut().then(() => {
    _detenerListenerMembresia();
    uidActual = null;
    syncHabilitado = false;
    toast("Sesión cerrada. Sigues trabajando en modo local.", "info");
    actualizarUIEstadoCuenta();
  });
}

// -----------------------------------------------------------
// 4. LISTENER DE AUTENTICACIÓN
//    Ya NO bloquea pantallas. Solo decide si se activa sync.
// -----------------------------------------------------------
auth.onAuthStateChanged((user) => {
  if (user) {
    uidActual = user.uid;
    verificarYEscucharMembresia(uidActual);
  } else {
    uidActual = null;
    syncHabilitado = false;
    _detenerListenerMembresia();
    actualizarUIEstadoCuenta();
  }
});

// -----------------------------------------------------------
// 5. VERIFICACIÓN DE MEMBRESÍA
//    Lee /usuarios/{uid}/membresia = { activa: bool, vence: <timestamp ms> }
//    Este nodo lo escribe SOLO tu Cloud Function (nunca el cliente).
//    Además queda "escuchando" en tiempo real: si la membresía
//    se vence o se cancela, la app apaga la sincronización al
//    instante, sin que el usuario tenga que recargar la página.
// -----------------------------------------------------------
function verificarYEscucharMembresia(uid) {
  _detenerListenerMembresia();

  _membresiaListenerRef = db.ref(`usuarios/${uid}/membresia`);
  _membresiaListenerRef.on("value", (snapshot) => {
    const membresia = snapshot.val();
    const activa = !!(membresia && membresia.activa && (!membresia.vence || membresia.vence > Date.now()));

    if (activa && !syncHabilitado) {
      // Se activó (o se reactivó) la membresía → encender sync
      syncHabilitado = true;
      toast("Membresía activa. Sincronización con la nube activada.", "exito");
      cargarDatosUsuario(uid);
    } else if (!activa && syncHabilitado) {
      // Se venció/canceló → apagar sync, seguir en modo local
      syncHabilitado = false;
      toast("Tu membresía expiró. La sincronización en la nube es una función de pago; sigues trabajando en modo local (sin sincronizar).", "error");
    } else if (!activa) {
      toast("Iniciaste sesión, pero la sincronización en la nube es una función de pago. Trabajando en modo local.", "info");
    }

    actualizarUIEstadoCuenta();
  }, (err) => {
    console.error("Error verificando membresía:", err);
    toast("No se pudo verificar tu membresía. Trabajando en modo local.", "error");
  });
}

function _detenerListenerMembresia() {
  if (_membresiaListenerRef) {
    _membresiaListenerRef.off();
    _membresiaListenerRef = null;
  }
}

// -----------------------------------------------------------
// 6. CARGA DE DATOS DESDE FIREBASE (solo si syncHabilitado)
// -----------------------------------------------------------
function cargarDatosUsuario(uid) {
  if (!syncHabilitado) return;

  const refUsuario = db.ref("usuarios/" + uid);

  refUsuario.once("value")
    .then((snapshot) => {
      const datos = snapshot.val();

      if (datos) {
        const modo = claveModo();
        let datosProductos = datos.productos ? datos.productos[modo] : null;
        let datosConfig = datos.config ? datos.config[modo] : null;

        // Pedidos: son compartidos entre modos (tienda ↔ bodega)
        if (datos.pedidos) {
          pedidos = Object.values(datos.pedidos);
          if (typeof actualizarBadgePedidos === 'function') actualizarBadgePedidos();
        }

        // Migración: estructura anterior (productos directos, config/settings)
        if (!datosProductos && datos.productos && !datos.productos.tienda && !datos.productos.bodega) {
          datosProductos = datos.productos;
        }
        if (!datosConfig && datos.config && datos.config.settings) {
          datosConfig = datos.config.settings;
        }

        if (datosProductos || datosConfig) {
          // Hay datos en la nube → la nube manda
          productos = datosProductos ? Object.values(datosProductos) : [];
          config = datosConfig ? datosConfig : config;
          // Migración: 'hogar' pasó a llamarse 'bodega'
          if (datosConfig && datosConfig.modo) {
            modoApp = datosConfig.modo === 'hogar' ? 'bodega' : datosConfig.modo;
          }

          let histModo = datos.historial ? datos.historial[modo] : null;
          if (!histModo && datos.historial) {
            const primerValor = datos.historial[Object.keys(datos.historial)[0]];
            if (Array.isArray(primerValor)) histModo = datos.historial; // migración
          }
          window.historialCompleto = histModo || {};
          const hoy = new Date().toISOString().split("T")[0];
          historialDia = (window.historialCompleto[hoy]) ? window.historialCompleto[hoy] : historialDia;

          guardarEnStorage(true);   // refleja en localStorage como caché
          guardarHistorial(true);

          if (modoApp) { aplicarModo(); renderDashboard(); }
        } else {
          // Usuario paga por primera vez / sin datos en la nube aún:
          // subimos lo que ya tenía en local como primera copia.
          guardarEnFirebase();
          guardarHistorialEnFirebase();
          if (typeof guardarPedidosEnFirebase === 'function') guardarPedidosEnFirebase();
        }
      } else {
        // Sin datos en la nube: subimos la copia local
        guardarEnFirebase();
        guardarHistorialEnFirebase();
        if (typeof guardarPedidosEnFirebase === 'function') guardarPedidosEnFirebase();
      }
    })
    .catch((err) => {
      console.error("Error cargando datos de Firebase:", err);
      toast("No se pudieron traer tus datos de la nube. Sigues viendo tu copia local.", "error");
    });
}

// -----------------------------------------------------------
// 7. SUBIDA DE DATOS (solo si syncHabilitado)
//    Se llama desde storage.js dentro de guardarEnStorage()
//    y guardarHistorial(), igual que en la versión anterior.
// -----------------------------------------------------------
function guardarEnFirebase() {
  if (!uidActual || !syncHabilitado) return;

  clearTimeout(_guardarFirebaseTimeout);
  _guardarFirebaseTimeout = setTimeout(() => {
    const productosObj = {};
    (productos || []).forEach((p) => { productosObj[p.id] = p; });

    const actualizaciones = {};
    actualizaciones[`usuarios/${uidActual}/productos/${claveModo()}`] = productosObj;
    actualizaciones[`usuarios/${uidActual}/config/${claveModo()}`] = {
      ...config,
      modo: modoApp
    };

    db.ref().update(actualizaciones).catch((err) => {
      console.error("Error guardando en Firebase:", err);
      toast("No se pudo sincronizar con la nube (tu copia local está bien).", "error");
    });
  }, 800);
}

function guardarHistorialEnFirebase() {
  if (!uidActual || !syncHabilitado) return;

  const hoy = new Date().toISOString().split("T")[0];
  db.ref(`usuarios/${uidActual}/historial/${claveModo()}/${hoy}`)
    .set(historialDia || [])
    .catch((err) => {
      console.error("Error guardando historial en Firebase:", err);
      toast("No se pudo sincronizar el historial (tu copia local está bien).", "error");
    });
}

function guardarPedidosEnFirebase() {
  if (!uidActual || !syncHabilitado) return;

  clearTimeout(_guardarPedidosFirebaseTimeout);
  _guardarPedidosFirebaseTimeout = setTimeout(() => {
    const pedidosObj = {};
    (pedidos || []).forEach((p) => { pedidosObj[p.id] = p; });

    db.ref(`usuarios/${uidActual}/pedidos`)
      .set(pedidosObj)
      .catch((err) => {
        console.error("Error guardando pedidos en Firebase:", err);
        toast("No se pudieron sincronizar los pedidos (tu copia local está bien).", "error");
      });
  }, 800);
}

// -----------------------------------------------------------
// 8. UI — estado de cuenta en Configuración
//    Muestra si el usuario está: sin sesión / logueado sin
//    membresía / logueado con sync activo. Ajusta los IDs a
//    los que uses en tu página de Configuración.
// -----------------------------------------------------------
function actualizarUIEstadoCuenta() {
  const el = document.getElementById("estadoCuenta");
  if (!el) return;

  if (!uidActual) {
    el.textContent = "No has iniciado sesión (modo local)";
  } else if (!syncHabilitado) {
    el.textContent = "Sesión iniciada, sin membresía (función de pago inactiva)";
  } else {
    el.textContent = "Sincronizando con la nube ✅";
  }
  
  // También actualizar los botones de login/logout si la función existe
  if (typeof actualizarUIAuth === 'function') {
    actualizarUIAuth();
  }

  // Aviso de función de paga: visible solo con sesión sin membresía
  const avisoPago = document.getElementById("syncPagoAviso");
  if (avisoPago) {
    avisoPago.style.display = (uidActual && !syncHabilitado) ? "block" : "none";
  }
}

// -----------------------------------------------------------
// 9. TRADUCCIÓN DE ERRORES COMUNES DE FIREBASE AUTH
// -----------------------------------------------------------
function traducirErrorFirebase(err) {
  const codigo = err && err.code ? err.code : "";
  const mapa = {
    "auth/email-already-in-use": "Ese correo ya tiene una cuenta registrada.",
    "auth/invalid-email": "El correo no es válido.",
    "auth/user-not-found": "No existe una cuenta con ese correo.",
    "auth/wrong-password": "Contraseña incorrecta.",
    "auth/weak-password": "La contraseña debe tener al menos 6 caracteres.",
    "auth/popup-closed-by-user": "Cerraste la ventana de Google antes de terminar.",
    "auth/network-request-failed": "Problema de conexión. Revisa tu internet.",
    "auth/too-many-requests": "Demasiados intentos. Espera unos minutos e intenta de nuevo.",
    "auth/api-key-not-valid.-please-pass-a-valid-api-key.": "La API key de Firebase no es válida o no tiene habilitada la Identity Toolkit API."
  };
  return mapa[codigo] || (err && err.message) || "Ocurrió un error inesperado.";
}
