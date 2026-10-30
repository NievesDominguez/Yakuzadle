// Caché en memoria de los personajes, sincronizada con Firestore mediante onSnapshot
//
// - El servidor puede arrancar (y responder /health) antes de que lleguen los datos
// - Tras la carga inicial solo se leen los documentos que cambian, así que añadir o editar un personaje en Firestore se refleja solo, sin reiniciar ni recargar todo
// - Si el listener se cae, se vuelve a suscribir con espera exponencial
function createCharacterStore({
  db,
  collection = "personajes",
  log = console,
  retryBaseMs = 1000,
  retryMaxMs = 30000,
}) {
  const data = new Map(); // id -> datos del documento
  let kiwamiNames = []; // todos los personajes, ordenados
  let normalNames = []; // sin campo difficulty, ordenados
  let listPayload = []; // respuesta de /list ya construida

  let ready = false;
  let resolveReady;
  const readyPromise = new Promise((resolve) => (resolveReady = resolve));

  let unsubscribe = null;
  let retryTimer = null;
  let retries = 0;
  let stopped = false;
  let firstSnapshotOfSubscription = true;

  function rebuild() {
    kiwamiNames = [...data.keys()].sort();
    normalNames = kiwamiNames.filter((n) => !data.get(n).difficulty);
    listPayload = kiwamiNames.map((name) => {
      const d = data.get(name);
      return {
        name,
        image: d.images && d.images.length > 0 ? d.images[0] : null,
        aliases: d.aliases || [],
        nicknames: d.nicknames || [],
        kiwamiOnly: !!d.difficulty,
      };
    });
  }

  function onSnapshot(snapshot) {
    retries = 0;
    // Tras una reconexión, el primer snapshot trae todos los documentos como added para no conservar personajes borrados durante la caída
    if (firstSnapshotOfSubscription) {
      data.clear();
      firstSnapshotOfSubscription = false;
    }
    for (const change of snapshot.docChanges()) {
      if (change.type === "removed") data.delete(change.doc.id);
      else data.set(change.doc.id, change.doc.data());
    }
    rebuild();
    if (!ready) {
      ready = true;
      resolveReady();
      log.log(`[characters] Loaded ${kiwamiNames.length} characters (${normalNames.length} normal)`);
    }
  }

  function onError(err) {
    log.error("[characters] Firestore listener error:", err && err.message ? err.message : err);
    scheduleRetry();
  }

  function subscribe() {
    if (stopped) return;
    firstSnapshotOfSubscription = true;
    try {
      unsubscribe = db.collection(collection).onSnapshot(onSnapshot, onError);
    } catch (err) {
      onError(err);
    }
  }

  function scheduleRetry() {
    if (stopped || retryTimer) return;
    try { if (unsubscribe) unsubscribe(); } catch { /* ya cerrado */ }
    unsubscribe = null;
    const delay = Math.min(retryMaxMs, retryBaseMs * 2 ** retries);
    retries += 1;
    log.warn(`[characters] Re-subscribing in ${delay} ms`);
    retryTimer = setTimeout(() => {
      retryTimer = null;
      subscribe();
    }, delay);
    if (retryTimer.unref) retryTimer.unref();
  }

  return {
    start() {
      subscribe();
      return readyPromise;
    },
    stop() {
      stopped = true;
      clearTimeout(retryTimer);
      try { if (unsubscribe) unsubscribe(); } catch { /* ya cerrado */ }
    },
    isReady: () => ready,
    // True si la caché está lista o lo estará antes de los milisegundos (ms)
    async whenReady(ms) {
      if (ready) return true;
      let timer;
      const timeout = new Promise((resolve) => { timer = setTimeout(() => resolve(false), ms); });
      const result = await Promise.race([readyPromise.then(() => true), timeout]);
      clearTimeout(timer);
      return result;
    },
    get: (name) => data.get(name) || null,
    names: (difficulty) => (difficulty === "kiwami" ? kiwamiNames : normalNames),
    list: () => listPayload,
    size: () => data.size,
  };
}

module.exports = { createCharacterStore };
