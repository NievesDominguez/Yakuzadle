const crypto = require("crypto");

// Reglas de la partida
const MAX_ATTEMPTS = 15;
const HINT_THRESHOLDS = [3, 6, 9, 12]; // Intentos tras los cuales se gana una carga de pista
const MAX_HINTS = 4;

// Cargas de pista ganadas con N intentos
function earnedHintCharges(attempts) {
  return Math.min(MAX_HINTS, HINT_THRESHOLDS.filter((t) => attempts >= t).length);
}

function emptyState(date, difficulty) {
  return { v: 1, date, difficulty, guesses: [], hints: [] };
}

function isValidState(s) {
  return (
    s && s.v === 1 &&
    typeof s.date === "string" &&
    (s.difficulty === "normal" || s.difficulty === "kiwami") &&
    Array.isArray(s.guesses) && s.guesses.every((g) => typeof g === "string") &&
    Array.isArray(s.hints) && s.hints.every((h) => typeof h === "string")
  );
}

// Codifica/decodifica el estado de partida firmado con HMAC
// El servidor no guarda sesiones. Cada respuesta de /guess devuelve un estado firmado (qué intentos y pistas lleva la partida) que el cliente reenvía en la siguiente petición
// Como está firmado, el cliente no puede inventarse un estado con 15 intentos para que el servidor le revele el objetivo, ni reutilizar un estado de otro día o de otra dificultad
function createStateCodec(secret) {
  if (!secret) throw new Error("createStateCodec: missing secret");

  const sign = (payload) =>
    crypto.createHmac("sha256", secret).update(`state:${payload}`).digest("base64url");

  return {
    encode(state) {
      const payload = Buffer.from(JSON.stringify(state)).toString("base64url");
      return `${payload}.${sign(payload)}`;
    },

    // Devuelve { state, payload } o null si el token es inválido o está manipulado
    decode(token) {
      if (typeof token !== "string" || token.length > 4096) return null;
      const parts = token.split(".");
      if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
      const [payload, signature] = parts;

      const expected = Buffer.from(sign(payload));
      const received = Buffer.from(signature);
      if (expected.length !== received.length || !crypto.timingSafeEqual(expected, received)) return null;

      try {
        const state = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
        return isValidState(state) ? { state, payload } : null;
      } catch {
        return null;
      }
    },

    // Entero determinista derivado del estado
    // Reenviar el mismo estado da siempre la misma pista, así que repetir la petición no sirve para sacar más información
    pick(payload, label, n) {
      const h = crypto.createHmac("sha256", secret).update(`${label}:${payload}`).digest();
      return Number(h.readBigUInt64BE(0) % BigInt(n));
    },
  };
}

module.exports = { MAX_ATTEMPTS, HINT_THRESHOLDS, MAX_HINTS, earnedHintCharges, emptyState, createStateCodec };
