// Variable de entorno para la URL base de la API, con fallback a /api para desarrollo local
const API_BASE = import.meta.env.VITE_API_BASE_URL || "/api";

// Exportar URL base para imágenes, apuntando al endpoint de imágenes del backend
export const IMAGE_BASE_URL = `${import.meta.env.VITE_API_BASE_URL || "/api"}/images/`;

// Función auxiliar para hacer fetch
// Si el servidor responde con error, la excepción muestra el mensaje adecuado
async function safeFetch(url) {
  const res = await fetch(url);
  if (!res.ok) {
    const err = new Error(`Server error: ${res.status} ${res.statusText}`);
    err.status = res.status;
    try {
      err.code = (await res.json()).error;
    } catch {
      /* Respuesta sin cuerpo JSON */
    }
    throw err;
  }
  return res.json();
}

// Funciones para interactuar con la API del backend

// Modo diario: state es el estado de partida firmado que devolvió el intento anterior. El servidor solo revela el objetivo al acertar o al agotar los intentos
// Modo infinito: targetName es el objetivo elegido por el cliente y no se usa state
export async function guessCharacter(name, difficulty, { targetName = null, state = null } = {}) {
  const targetParam = targetName ? `&targetName=${encodeURIComponent(targetName)}` : "";
  const stateParam = state ? `&state=${encodeURIComponent(state)}` : "";
  return safeFetch(
    `${API_BASE}/guess?name=${encodeURIComponent(name)}&difficulty=${difficulty}${targetParam}${stateParam}`
  );
}

export async function getCharacterList() {
  return safeFetch(`${API_BASE}/list`);
}

// Modo diario: el servidor decide qué campo sale a partir de state
// Modo infinito: se pasan targetName y usedFields
export async function getHint(difficulty, { usedFields = [], targetName = null, state = null } = {}) {
  const targetParam = targetName ? `&targetName=${encodeURIComponent(targetName)}` : "";
  const stateParam = state ? `&state=${encodeURIComponent(state)}` : "";
  return safeFetch(
    `${API_BASE}/hint?difficulty=${difficulty}&usedFields=${usedFields.join(",")}${targetParam}${stateParam}`
  );
}