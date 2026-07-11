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
// 3. LOGIN / REGISTRO / LOGOUT (se llaman desde Configuración)
// -----------------------------------------------------------
function registrarConCorreo(email, password) {
  return auth.createUserWithEmailAndPassword(email, password)
    .then((cred) => {
      toast("Cuenta creada. Verificando membresía...", "exito");
      return cred.user;
    })
    .catch((err) => {
      toast(traducirErrorFirebase(err), "error");
      throw err;
    });
}

function iniciarSesionConCorreo(email, password) {
  return auth.signInWithEmailAndPassword(email, password)
    .then((cred) => cred.user)
    .catch((err) => {
      toast(traducirErrorFirebase(err), "error");
      throw err;
    });
}

function iniciarSesionConGoogle() {
  const provider = new firebase.auth.GoogleAuthProvider();
  return auth.signInWithPopup(provider)
    .then((cred) => cred.user)
    .catch((err) => {
      toast(traducirErrorFirebase(err), "error");
      throw err;
    });
}

function recuperarContrasena(email) {
  return auth.sendPasswordResetEmail(email)
    .then(() => toast("Te enviamos un correo para restablecer tu contraseña", "exito"))
    .catch((err) => toast(traducirErrorFirebase(err), "error"));
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
      toast("Tu membresía no está activa. Sigues trabajando en modo local (sin sincronizar).", "error");
    } else if (!activa) {
      toast("Iniciaste sesión, pero no tienes una membresía activa. Trabajando en modo local.", "info");
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

      if (datos && (datos.productos || datos.config)) {
        // Hay datos en la nube → la nube manda
        productos = datos.productos ? Object.values(datos.productos) : [];
        config = (datos.config && datos.config.settings) ? datos.config.settings : config;
        modoApp = (datos.config && datos.config.settings && datos.config.settings.modo)
          ? datos.config.settings.modo
          : modoApp;

        window.historialCompleto = datos.historial || {};
        const hoy = new Date().toISOString().split("T")[0];
        historialDia = (datos.historial && datos.historial[hoy]) ? datos.historial[hoy] : historialDia;

        guardarEnStorage(true);   // refleja en localStorage como caché
        guardarHistorial(true);

        if (modoApp) { aplicarModo(); renderDashboard(); }
      } else {
        // Usuario paga por primera vez / sin datos en la nube aún:
        // subimos lo que ya tenía en local como primera copia.
        guardarEnFirebase();
        guardarHistorialEnFirebase();
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
    actualizaciones[`usuarios/${uidActual}/productos`] = productosObj;
    actualizaciones[`usuarios/${uidActual}/config/settings`] = {
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
  db.ref(`usuarios/${uidActual}/historial/${hoy}`)
    .set(historialDia || [])
    .catch((err) => {
      console.error("Error guardando historial en Firebase:", err);
      toast("No se pudo sincronizar el historial (tu copia local está bien).", "error");
    });
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
    el.textContent = "Sesión iniciada, sin membresía activa (modo local)";
  } else {
    el.textContent = "Sincronizando con la nube ✅";
  }
  
  // También actualizar los botones de login/logout si la función existe
  if (typeof actualizarUIAuth === 'function') {
    actualizarUIAuth();
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
