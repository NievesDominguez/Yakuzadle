const API_BASE = import.meta.env.VITE_API_BASE_URL || "/api";  
  
export const IMAGE_BASE_URL =  
  "https://raw.githubusercontent.com/NievesDominguez/Yakuzadle/main/img_yakuzadle/";  
  
export async function guessCharacter(name, difficulty) {  
  const res = await fetch(  
    `${API_BASE}/guess?name=${encodeURIComponent(name)}&difficulty=${difficulty}`  
  );  
  return res.json();  
}  
  
export async function getCharacterList() {  
  const res = await fetch(`${API_BASE}/list`);  
  return res.json();  
}  
  
export async function getDailyTarget(difficulty) {  
  const res = await fetch(`${API_BASE}/daily-target?difficulty=${difficulty}`);  
  return res.json();  
}  
  
export async function getHint(difficulty, usedFields) {  
  const res = await fetch(  
    `${API_BASE}/hint?difficulty=${difficulty}&usedFields=${usedFields.join(",")}`  
  );  
  return res.json();  
}  
  
export async function setDebugTarget(name, difficulty) {  
  if (import.meta.env.PROD) {  
    throw new Error("Debug endpoint not available in production");  
  }  
  const res = await fetch(  
    `http://localhost:3001/debug-set-target?name=${encodeURIComponent(name)}&difficulty=${difficulty}`  
  );  
  return res.json();  
}