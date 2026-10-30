// Arranque del servidor. La lógica está en app.js y services/

// Validar REVEAL_SECRET ANTES de cargar nada más. Din él no se puede firmar el estado de partida ni elegir el personaje diario
const secret = process.env.REVEAL_SECRET;
if (!secret || secret.length < 16) {
  console.error(
    "[FATAL] REVEAL_SECRET is missing or too short (min 16 chars, 32+ recommended).\n" +
    "        Generate one with: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\"\n" +
    "        and set it as an environment variable (see README)."
  );
  process.exit(1);
}

const legacyDate = process.env.LEGACY_FIRST_DAY || null;
if (legacyDate && !/^\d{4}-\d{2}-\d{2}$/.test(legacyDate)) {
  console.error("[FATAL] LEGACY_FIRST_DAY must have the format YYYY-MM-DD (UTC date).");
  process.exit(1);
}

const { db } = require("./firestore.js"); // Valida las variables FIREBASE_* y sale si falta alguna
const { createApp } = require("./app.js");
const { createCharacterStore } = require("./services/characterStore.js");
const { createDailyTargetService } = require("./services/dailyTarget.js");
const { createImageProxy } = require("./services/imageProxy.js");
const { createStateCodec } = require("./services/gameState.js");

const store = createCharacterStore({ db });
const codec = createStateCodec(secret);
const daily = createDailyTargetService({ db, store, secret, legacyDate });
const imageProxy = createImageProxy({
  baseUrl: "https://raw.githubusercontent.com/NievesDominguez/Yakuzadle/main/img_yakuzadle/",
});

const hops = Number.parseInt(process.env.TRUST_PROXY_HOPS ?? "1", 10);
const app = createApp({
  store,
  daily,
  codec,
  imageProxy,
  trustProxyHops: Number.isNaN(hops) ? 1 : hops,
  rateLimits: {
    api: Number(process.env.API_RATE_LIMIT_PER_MIN) || 60,
    images: Number(process.env.IMAGE_RATE_LIMIT_PER_MIN) || 600,
  },
});

// Hasta que lleguen los personajes, /health responde y el resto de endpoints esperan
const PORT = process.env.PORT || 3001;
const server = app.listen(PORT, () => console.log(`Yakuzadle backend listening on port ${PORT}`));

// Cargar personajes en segundo plano (y mantenerlos al día con onSnapshot)
store
  .start()
  .then(() => Promise.allSettled([daily.getDailyTarget("normal"), daily.getDailyTarget("kiwami")])) // Precalentar el objetivo del día
  .catch((err) => console.error("[FATAL] Could not start character store:", err));

process.on("unhandledRejection", (reason) => console.error("Unhandled rejection:", reason));

// Render envía SIGTERM al desplegar: cerrar limpiamente
process.on("SIGTERM", () => {
  console.log("SIGTERM received, shutting down");
  store.stop();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 5000).unref();
});