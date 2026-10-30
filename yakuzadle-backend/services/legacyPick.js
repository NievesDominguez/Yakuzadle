// Algoritmo antiguo de selección diaria
//
// Solo se usa el día del despliegue (variable LEGACY_FIRST_DAY) para que el personaje de ese día
// siga siendo el mismo que ya estaban viendo los jugadores. A partir del día siguiente se usa la
// selección nueva de dailyTarget.js. Se puede borrar este fichero cuando ya no haga falta.

function hashCode(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (Math.imul(31, hash) + str.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

function seededRandom(seed) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(1664525, s) + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

// names debe estar en el mismo orden que antes: ids de documento ordenados (orden por defecto de Firestore)
function legacyPick(names, dateStr, difficulty) {
  const rand = seededRandom(hashCode(dateStr + ":" + difficulty));
  const indices = names.map((_, i) => i);
  for (let i = indices.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [indices[i], indices[j]] = [indices[j], indices[i]];
  }
  return names[indices[0]];
}

module.exports = { legacyPick };
