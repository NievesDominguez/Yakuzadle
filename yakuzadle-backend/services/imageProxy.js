// Proxy de imágenes (GitHub raw) con caché

// Cada imagen se descarga de GitHub una vez, no en cada petición
// Peticiones simultáneas a la misma imagen comparten una sola descarga
// El navegador la guarda 1 día (y la sirve caducada hasta 7 más mientras revalida)
// Nunca se envían cabeceras a medias, así que un corte con GitHub no puede dejar una respuesta rota ni lanzar excepciones tras res.send()
// Los 404 se recuerdan unos minutos para que nombres inexistentes no martilleen a GitHub.

const NAME_RE = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,200}\.(png|webp|jpe?g|gif)$/i;
const TYPES = { png: "image/png", webp: "image/webp", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif" };

const OK_CACHE_CONTROL = "public, max-age=86400, stale-while-revalidate=604800";

function createImageProxy({
  baseUrl,
  fetchImpl = globalThis.fetch,
  maxCacheBytes = 64 * 1024 * 1024,
  maxFileBytes = 5 * 1024 * 1024,
  negativeTtlMs = 5 * 60 * 1000,
  maxNegativeEntries = 1000,
  timeoutMs = 8000,
  log = console,
}) {
  const cache = new Map(); // nombre -> { buf, type }, en orden de uso (LRU)
  let cachedBytes = 0;
  const inflight = new Map(); // nombre -> Promise
  const missing = new Map(); // nombre -> instante de caducidad del 404 recordado

  function remember(name, entry) {
    if (entry.buf.length > maxCacheBytes) return;
    const previous = cache.get(name);
    if (previous) cachedBytes -= previous.buf.length;
    cache.delete(name);
    cache.set(name, entry);
    cachedBytes += entry.buf.length;
    while (cachedBytes > maxCacheBytes) {
      const [oldestName, oldest] = cache.entries().next().value;
      cache.delete(oldestName);
      cachedBytes -= oldest.buf.length;
    }
  }

  function rememberMissing(name) {
    missing.delete(name);
    missing.set(name, Date.now() + negativeTtlMs);
    while (missing.size > maxNegativeEntries) missing.delete(missing.keys().next().value);
  }

  async function download(name) {
    const res = await fetchImpl(`${baseUrl}${encodeURIComponent(name)}`, {
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`upstream responded ${res.status}`);
    const declared = Number(res.headers.get("content-length"));
    if (declared > maxFileBytes) throw new Error("image too large");
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > maxFileBytes) throw new Error("image too large");
    const ext = name.split(".").pop().toLowerCase();
    return { buf, type: TYPES[ext] };
  }

  // Devuelve la entrada de caché, null si no existe (404) o lanza si GitHub falla
  async function load(name) {
    const hit = cache.get(name);
    if (hit) {
      cache.delete(name); // Marcar como usada recientemente
      cache.set(name, hit);
      return hit;
    }
    const expires = missing.get(name);
    if (expires && expires > Date.now()) return null;

    if (!inflight.has(name)) {
      const job = download(name)
        .then((entry) => {
          if (entry) remember(name, entry);
          else rememberMissing(name);
          return entry;
        })
        .finally(() => inflight.delete(name));
      inflight.set(name, job);
    }
    return inflight.get(name);
  }

  async function handler(req, res) {
    const name = req.params.filename;
    if (!NAME_RE.test(name)) return res.status(400).send("Invalid filename");

    // Permitir que el frontend use las imágenes
    res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");

    let entry;
    try {
      entry = await load(name);
    } catch (err) {
      log.error(`[images] ${name}: ${err.message}`);
      res.setHeader("Cache-Control", "no-store");
      return res.status(502).send("Image temporarily unavailable");
    }

    if (!entry) {
      res.setHeader("Cache-Control", "public, max-age=60");
      return res.status(404).send("Image not found");
    }

    res.setHeader("Content-Type", entry.type);
    res.setHeader("Cache-Control", OK_CACHE_CONTROL);
    return res.send(entry.buf); // Express añade ETag y responde 304 si el cliente ya la tiene
  }

  handler.stats = () => ({ entries: cache.size, bytes: cachedBytes, missing: missing.size });
  return handler;
}

module.exports = { createImageProxy, NAME_RE };
