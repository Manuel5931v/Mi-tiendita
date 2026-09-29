// ═══════════════════════════════════════
//  PUENTE — Firebase AI Logic (Gemini)
//  ═══════════════════════════════════════
//  Este archivo se carga como <script type="module"> porque
//  Firebase AI Logic solo existe en el SDK modular v9+, mientras
//  que el resto de la app (firebase.js) usa el SDK clásico v8.
//  Para no migrar todo el proyecto, aquí se inicializa una
//  SEGUNDA app de Firebase (misma configuración/proyecto) solo
//  para hablar con Gemini. No interfiere con Auth ni Database.
//
//  Con esto, NINGÚN usuario configura una API Key: Firebase AI
//  Logic hace de intermediario y protege el acceso con App Check,
//  usando el tier gratuito de la "Gemini Developer API" (sin
//  tarjeta de crédito).
//
//  ─────────────────────────────────────────────────────────
//  PASOS QUE DEBES HACER TÚ EN LA CONSOLA (una sola vez):
//  1. Firebase console → tu proyecto → "AI Services" → "AI Logic"
//     → "Get started" → elige proveedor "Gemini Developer API"
//     (gratis, sin tarjeta). Esto activa la API automáticamente.
//  2. Firebase console → "App Check" → registra tu app Web con
//     el proveedor "reCAPTCHA v3" → copia el "Site key" que te
//     entrega Google y pégalo abajo en RECAPTCHA_SITE_KEY.
//  3. Mientras pruebas en localhost, App Check no reconocerá tu
//     dominio todavía. Firebase te deja usar un "debug token":
//     al abrir la consola del navegador verás un mensaje con un
//     token; regístralo en Firebase console → App Check → tu app
//     → "Manage debug tokens". (Solo para desarrollo, no producción.)
//  ─────────────────────────────────────────────────────────

import { initializeApp } from "https://www.gstatic.com/firebasejs/12.5.0/firebase-app.js";
import { initializeAppCheck, ReCaptchaV3Provider } from "https://www.gstatic.com/firebasejs/12.5.0/firebase-app-check.js";
import { getAI, getGenerativeModel, GoogleAIBackend } from "https://www.gstatic.com/firebasejs/12.5.0/firebase-ai.js";

// Mismo proyecto de Firebase que ya usas en firebase.js
const firebaseConfig = {
  apiKey: "AIzaSyBqAweNkjRVO37yGwNhEPGsnZZKl4NrHdQ",
  authDomain: "login-user-data-dfefd.firebaseapp.com",
  databaseURL: "https://login-user-data-dfefd-default-rtdb.firebaseio.com",
  projectId: "login-user-data-dfefd",
  storageBucket: "login-user-data-dfefd.firebasestorage.app",
  messagingSenderId: "27466066663",
  appId: "1:27466066663:web:cb13c09560ca6393bad042"
};

// Site Key de reCAPTCHA v3 registrada para "Mi tiendita.com"
const RECAPTCHA_SITE_KEY = "6LcdQ4MtAAAAAGWf0y4CuIOorei6_5Ay2bwFLIKE";

// Para desarrollo local, descomenta la siguiente línea:
// self.FIREBASE_APPCHECK_DEBUG_TOKEN = true;

const appIA = initializeApp(firebaseConfig, "appIA"); // app secundaria, coexiste con la de firebase.js

let modelo = null;
let appCheckListo = false;

try {
  initializeAppCheck(appIA, {
    provider: new ReCaptchaV3Provider(RECAPTCHA_SITE_KEY),
    isTokenAutoRefreshEnabled: true
  });
  appCheckListo = true;
} catch (err) {
  console.warn('App Check no se pudo inicializar (¿falta configurar RECAPTCHA_SITE_KEY?):', err);
}

const ai = getAI(appIA, { backend: new GoogleAIBackend() }); // "Gemini Developer API" (gratis)

/**
 * Genera texto con Gemini a través de Firebase AI Logic.
 * @param {string} systemPrompt - instrucción de sistema (rol del asistente)
 * @param {string} userPrompt - el prompt/contexto del usuario
 * @returns {Promise<string>} texto generado
 */
window.generarConGeminiFirebase = async function (systemPrompt, userPrompt) {
  if (!modelo) {
    modelo = getGenerativeModel(ai, {
      model: 'gemini-3.6-flash',
      systemInstruction: systemPrompt
    });
  }
  const resultado = await modelo.generateContent(userPrompt);
  return resultado.response.text();
};

// Bandera para que ai.js sepa que el puente terminó de cargar
window.geminiFirebaseListo = true;
if (!appCheckListo) {
  console.warn('⚠️ Firebase AI Logic está activo pero SIN App Check configurado. Configura RECAPTCHA_SITE_KEY antes de publicar la app.');
}
