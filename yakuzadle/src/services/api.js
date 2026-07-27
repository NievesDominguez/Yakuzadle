// Variable de entorno para la URL base de la API, con fallback a /api para desarrollo local
const API_BASE = import.meta.env.VITE_API_BASE_URL || "/api";

// Exportar URL base para imágenes, apuntando al endpoint de imágenes del backend
export const IMAGE_BASE_URL = `${import.meta.env.VITE_API_BASE_URL || "/api"}/images/`;

// Función auxiliar para hacer fetch
// yakuzadle/src/services/api.js  
async function safeFetch(url) {
  const res = await fetch(url);
  if (!res.ok) {
    const err = new Error(`Server error: ${res.status} ${res.statusText}`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

// Funciones para interactuar con la API del backend
export async function guessCharacter(name, difficulty, targetName = null) {
  const targetParam = targetName ? `&targetName=${encodeURIComponent(targetName)}` : "";
  return safeFetch(`${API_BASE}/guess?name=${encodeURIComponent(name)}&difficulty=${difficulty}${targetParam}`);
}

export async function getCharacterList() {
  return safeFetch(`${API_BASE}/list`);
}

export async function getHint(difficulty, usedFields, targetName = null) {
  const targetParam = targetName ? `&targetName=${encodeURIComponent(targetName)}` : "";
  return safeFetch(`${API_BASE}/hint?difficulty=${difficulty}&usedFields=${usedFields.join(",")}${targetParam}`);
}

export async function setDebugTarget(name, difficulty) {
  if (import.meta.env.PROD) {
    throw new Error("Debug endpoint not available in production");
  }
  return safeFetch(`http://localhost:3001/debug-set-target?name=${encodeURIComponent(name)}&difficulty=${difficulty}`);
}

// Obtiene un token firmado de partida (necesario para revelar el objetivo)
export async function getStartToken(difficulty) {
  return safeFetch(`${API_BASE}/start?difficulty=${difficulty}`);
}

// Revela el personaje objetivo del día (requiere el token emitido por /start)
export async function getDailyTarget(difficulty, token) {
  return safeFetch(
    `${API_BASE}/daily-target?difficulty=${difficulty}&token=${encodeURIComponent(token)}`
  );
}