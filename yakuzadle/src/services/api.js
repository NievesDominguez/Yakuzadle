const API_BASE = import.meta.env.VITE_API_BASE_URL || "/api";  
  
export async function guessCharacter(name) {  
  const res = await fetch(`${API_BASE}/guess?name=${encodeURIComponent(name)}`);  
  return res.json();  
}  
  
export async function getCharacterList() {  
  const res = await fetch(`${API_BASE}/list`);  
  return res.json();  
}  
  
export async function getDailyTarget() {  
  const res = await fetch(`${API_BASE}/daily-target`);  
  return res.json();  
}  
  
export async function setDebugTarget(name) {  
  if (import.meta.env.PROD) {  
    throw new Error("Debug endpoint not available in production");  
  }  
  const res = await fetch(`http://localhost:3001/debug-set-target?name=${encodeURIComponent(name)}`);  
  return res.json();  
}