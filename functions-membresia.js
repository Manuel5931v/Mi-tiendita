/* =========================================================
   EJEMPLO — Cloud Function: activar/desactivar membresía
   tras un pago confirmado con Stripe.
   =========================================================
   Esto NO va en tu app web (index.html / js/*.js). Va en un
   proyecto separado de Firebase Cloud Functions (Node.js).
   Requiere el plan "Blaze" (pago por uso) de Firebase, ya
   que las Functions necesitan salir a internet a hablar con
   Stripe. El plan gratuito "Spark" no permite esto.

   Instalación (una sola vez):
     npm install -g firebase-tools
     firebase login
     firebase init functions
     cd functions
     npm install stripe firebase-admin firebase-functions

   Variables de entorno necesarias (ejemplo con functions v2):
     firebase functions:secrets:set STRIPE_SECRET_KEY
     firebase functions:secrets:set STRIPE_WEBHOOK_SECRET
   ========================================================= */

const { onRequest } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
const Stripe = require("stripe");

admin.initializeApp();
const db = admin.database();

const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

/**
 * Endpoint que Stripe llama automáticamente cuando pasa algo
 * relevante con un pago o suscripción (configúralo en Stripe
 * Dashboard > Developers > Webhooks, apuntando a la URL que
 * te da esta función al desplegarla).
 */
exports.webhookStripe = onRequest(
  { secrets: ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET"] },
  async (req, res) => {
    let evento;

    try {
      // Verifica que la petición realmente venga de Stripe
      // (evita que alguien falsifique un "pago exitoso").
      evento = stripe.webhooks.constructEvent(
        req.rawBody,
        req.headers["stripe-signature"],
        process.env.STRIPE_WEBHOOK_SECRET
      );
    } catch (err) {
      console.error("Firma de webhook inválida:", err.message);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    try {
      switch (evento.type) {
        case "checkout.session.completed":
        case "invoice.payment_succeeded": {
          // Pago exitoso → activar membresía por 30 días
          const uid = await obtenerUidDesdeEvento(evento);
          if (uid) {
            const vence = Date.now() + 30 * 24 * 60 * 60 * 1000; // 30 días
            await db.ref(`usuarios/${uid}/membresia`).set({
              activa: true,
              vence,
              actualizado: Date.now()
            });
            console.log(`Membresía activada para ${uid} hasta ${new Date(vence)}`);
          }
          break;
        }

        case "invoice.payment_failed":
        case "customer.subscription.deleted": {
          // Pago falló o canceló la suscripción → desactivar
          const uid = await obtenerUidDesdeEvento(evento);
          if (uid) {
            await db.ref(`usuarios/${uid}/membresia`).update({
              activa: false,
              actualizado: Date.now()
            });
            console.log(`Membresía desactivada para ${uid}`);
          }
          break;
        }

        default:
          // Otros eventos de Stripe que no nos interesan, se ignoran.
          break;
      }

      res.status(200).send("ok");
    } catch (err) {
      console.error("Error procesando webhook:", err);
      res.status(500).send("Error interno");
    }
  }
);

/**
 * Aquí decides CÓMO relacionar el evento de Stripe con el uid
 * de Firebase del usuario. La forma más simple: al crear la
 * sesión de Checkout desde tu app (cuando el usuario da clic
 * en "Suscribirme"), le pasas metadata: { uid: uidActual }.
 * Luego aquí la recuperas.
 */
async function obtenerUidDesdeEvento(evento) {
  const objeto = evento.data.object;

  // Caso 1: viene directo en metadata (recomendado)
  if (objeto.metadata && objeto.metadata.uid) {
    return objeto.metadata.uid;
  }

  // Caso 2: si no hay metadata directa, buscar por customer id
  // guardado previamente en /stripe_customers/{stripeCustomerId} -> uid
  if (objeto.customer) {
    const snap = await db.ref(`stripe_customers/${objeto.customer}`).once("value");
    return snap.val();
  }

  return null;
}

/* =========================================================
   Lado del cliente (dentro de tu app, ej. en config.js):
   cuando el usuario da clic en "Suscribirme", normalmente
   llamas a OTRA función (callable) que crea la sesión de
   Stripe Checkout con metadata.uid = uidActual, y rediriges
   al usuario a esa URL de pago. Ejemplo simplificado:

   const crearSesionPago = firebase.functions().httpsCallable("crearSesionCheckout");
   crearSesionPago({ uid: uidActual }).then((resultado) => {
     window.location.href = resultado.data.url; // URL de Stripe Checkout
   });

   (Esa función "crearSesionCheckout" también va en tu backend
   de Cloud Functions, usando stripe.checkout.sessions.create()
   con metadata: { uid } y success_url/cancel_url de tu app.)
   ========================================================= */
