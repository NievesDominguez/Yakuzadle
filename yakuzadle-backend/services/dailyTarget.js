const crypto = require("crypto");
const { legacyPick } = require("./legacyPick");

const DAILY_COLLECTION = "daily_targets";
const MAX_LOOKBACK_DAYS = 365; // No se repite un personaje en, como máximo, este número de días
const LOOKBACK_FRACTION = 0.8; // Ni en más del 80 % del tamaño de la plantilla (si hay pocos personajes)
const FALLBACK_TTL_MS = 30 * 1000;

const utcDateStr = (d) =>
  new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())).toISOString().split("T")[0];

function addDays(dateStr, days) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().split("T")[0];
}

const isAlreadyExists = (err) => err && (err.code === 6 || /ALREADY_EXISTS/.test(String(err.message)));

// Selección del personaje diario.
//
// La primera vez que se pide el personaje de un día se guarda en Firestore (colección daily_targets, un documento por dificultad y día)
// Es inmutable. Al reiniciar el servidor, añadir/quitar personajes o tener varias instancias no lo cambia
// Se excluyen los personajes que salieron en los últimos N días
// El azar sale de un HMAC con el secreto del servidor. El código del repo es público, así que con un algoritmo solo basado en la fecha cualquiera podría calcular el personaje de mañana
function createDailyTargetService({
  db,
  store,
  secret,
  collection = DAILY_COLLECTION,
  legacyDate = null,
  log = console,
  now = () => new Date(),
}) {
  if (!secret) throw new Error("createDailyTargetService: missing secret");

  const memo = new Map(); // "normal_2026-10-29" -> { promise, expires }

  // Índice determinista (según el secreto) en [0, n)
  function seededIndex(dateStr, difficulty, n) {
    const h = crypto.createHmac("sha256", secret).update(`daily:${difficulty}:${dateStr}`).digest();
    return Number(h.readBigUInt64BE(0) % BigInt(n));
  }

  async function choose(difficulty, dateStr) {
    const pool = store.names(difficulty);
    if (pool.length === 0) throw new Error(`No characters available for difficulty: ${difficulty}`);

    // El día del despliegue se conserva el personaje que ya estaba en juego
    if (legacyDate && dateStr === legacyDate) return legacyPick(pool, dateStr, difficulty);

    const lookback = Math.min(MAX_LOOKBACK_DAYS, Math.floor(pool.length * LOOKBACK_FRACTION));
    const cutoff = addDays(dateStr, -lookback);
    // Consulta por un único campo (sin índice compuesto), la dificultad se filtra en memoria
    const snapshot = await db.collection(collection).where("date", ">=", cutoff).get();

    const recent = new Set();
    snapshot.forEach((doc) => {
      const d = doc.data();
      if (d.difficulty === difficulty && d.date !== dateStr) recent.add(d.name);
    });

    let candidates = pool.filter((n) => !recent.has(n));
    if (candidates.length === 0) candidates = pool;
    return candidates[seededIndex(dateStr, difficulty, candidates.length)];
  }

  async function resolveName(difficulty, dateStr) {
    const ref = db.collection(collection).doc(`${difficulty}_${dateStr}`);
    const existing = await ref.get();

    if (existing.exists) {
      const name = existing.data().name;
      if (store.get(name)) return name;
      log.warn(`[daily] Stored target "${name}" is no longer in the roster, picking another one`);
    }

    const name = await choose(difficulty, dateStr);
    const record = { name, difficulty, date: dateStr, createdAt: new Date().toISOString() };
    try {
      if (existing.exists) await ref.set(record); // Reemplaza un objetivo que ya no existe
      else await ref.create(record); // create() falla si otra instancia se adelantó
    } catch (err) {
      if (!isAlreadyExists(err)) throw err;
      const winner = await ref.get();
      if (winner.exists && store.get(winner.data().name)) return winner.data().name;
      throw err;
    }
    log.log(`[daily] ${dateStr} ${difficulty}: ${name}`);
    return name;
  }

  // Si Firestore falla, el juego sigue funcionando con un personaje determinista (según el secreto) que no se guarda
  // Se reintenta la versión persistente pasados unos segundos
  function fallbackName(difficulty, dateStr) {
    const pool = store.names(difficulty);
    if (pool.length === 0) throw new Error(`No characters available for difficulty: ${difficulty}`);
    return pool[seededIndex(dateStr, difficulty, pool.length)];
  }

  async function getTargetName(difficulty, date = now()) {
    const dateStr = utcDateStr(date);
    const key = `${difficulty}_${dateStr}`;

    const hit = memo.get(key);
    if (hit && hit.expires > Date.now()) return hit.promise;

    // Se descartan las entradas de días anteriores
    for (const k of memo.keys()) if (!k.endsWith(dateStr)) memo.delete(k);

    const promise = resolveName(difficulty, dateStr).then(
      (name) => {
        memo.set(key, { promise: Promise.resolve(name), expires: Infinity });
        return name;
      },
      (err) => {
        log.error(`[daily] Firestore failed for ${key}, using fallback:`, err && err.message);
        try {
          const name = fallbackName(difficulty, dateStr);
          memo.set(key, { promise: Promise.resolve(name), expires: Date.now() + FALLBACK_TTL_MS });
          return name;
        } catch (fallbackErr) {
          memo.delete(key); // No cachear el fallo, reintentar en la próxima petición
          throw fallbackErr;
        }
      }
    );
    // Mientras se resuelve, las peticiones concurrentes comparten la misma promesa
    memo.set(key, { promise, expires: Infinity });
    return promise;
  }

  return {
    getTargetName,
    // Datos completos del personaje del día
    async getDailyTarget(difficulty, date = now()) {
      const name = await getTargetName(difficulty, date);
      const character = store.get(name);
      if (!character) throw new Error(`Target character ${name} not found`);
      return character;
    },
  };
}

module.exports = { createDailyTargetService, DAILY_COLLECTION, utcDateStr };
