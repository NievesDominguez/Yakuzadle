// Variable de entorno para la URL base de la API, con fallback a /api para desarrollo local
const API_BASE = import.meta.env.VITE_API_BASE_URL || "/api";

// Exportar URL base para imágenes, apuntando al endpoint de imágenes del backend
export const IMAGE_BASE_URL = `${import.meta.env.VITE_API_BASE_URL || "/api"}/images/`;

// Función auxiliar para hacer fetch
async function safeFetch(url) {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Error del servidor: ${res.status} ${res.statusText}`);
  }
  return res.json();
}

// Funciones para interactuar con la API del backend
export async function guessCharacter(name, difficulty) {
  return safeFetch(`${API_BASE}/guess?name=${encodeURIComponent(name)}&difficulty=${difficulty}`);
}

export async function getCharacterList() {
  return safeFetch(`${API_BASE}/list`);
}

export async function getDailyTarget(difficulty) {
  return safeFetch(`${API_BASE}/daily-target?difficulty=${difficulty}`);
}

export async function getHint(difficulty, usedFields) {
  return safeFetch(`${API_BASE}/hint?difficulty=${difficulty}&usedFields=${usedFields.join(",")}`);
}

export async function setDebugTarget(name, difficulty) {
  if (import.meta.env.PROD) {
    throw new Error("Debug endpoint not available in production");
  }
  return safeFetch(`http://localhost:3001/debug-set-target?name=${encodeURIComponent(name)}&difficulty=${difficulty}`);
}