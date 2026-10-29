// Búsqueda y resolución de nombres para el input de intentos.
// Son funciones puras para poder probarlas sin React.

// Minúsculas, sin tildes ni macrones ("Kiryū" == "kiryu") y sin espacios sobrantes
export const normalize = (s) =>
  String(s ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

// Sugerencias para el autocompletado: ignora ya adivinados y, en Normal, los exclusivos de Kiwami
export function searchCharacters(items, query, { difficulty, guessedNames = [], limit = 8 } = {}) {
  const q = normalize(query);
  if (!q) return [];
  const guessed = new Set(guessedNames);
  const results = [];

  for (const item of items) {
    if (guessed.has(item.name)) continue;
    if (difficulty === "normal" && item.kiwamiOnly) continue;

    const name = normalize(item.name);
    if (name.includes(q)) {
      // 0: nombre exacto, 1: empieza por, 2: contiene
      results.push({ ...item, matchedAlias: null, rank: name === q ? 0 : name.startsWith(q) ? 1 : 2 });
      continue;
    }
    const alias = [...(item.aliases || []), ...(item.nicknames || [])].find((a) =>
      normalize(a).includes(q)
    );
    if (alias) results.push({ ...item, matchedAlias: alias, rank: 3 });
  }

  results.sort((a, b) => a.rank - b.rank);
  return results.slice(0, limit);
}

// Convierte el texto escrito (al pulsar Enter / "Guess") en un nombre válido del backend.
// status: "ok" | "empty" | "duplicate" | "kiwami-only" | "not-found"
export function resolveGuess(items, text, { difficulty, guessedNames = [] } = {}) {
  if (!normalize(text)) return { status: "empty" };
  const guessed = new Set(guessedNames);

  // 1. Nombre exacto (sin distinguir mayúsculas/tildes)
  const exact = items.find((i) => normalize(i.name) === normalize(text));
  if (exact) {
    if (guessed.has(exact.name)) return { status: "duplicate", name: exact.name };
    if (difficulty === "normal" && exact.kiwamiOnly) return { status: "kiwami-only", name: exact.name };
    return { status: "ok", name: exact.name };
  }

  // 2. Si no, la primera sugerencia (lo mismo que verías en el desplegable)
  const [first] = searchCharacters(items, text, { difficulty, guessedNames, limit: 1 });
  if (first) return { status: "ok", name: first.name };

  return { status: "not-found" };
}
