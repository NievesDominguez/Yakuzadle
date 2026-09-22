// Orden de columnas
const FIELDS = [  
  "gender",  
  "affiliation",  
  "nationality",  
  "games",  
  "blood_type",  
  "fighting_style",  
  "height",  
  "date_of_birth",  
];  
  
// Emojis de cabecera
const HEADER_EMOJIS = ["👤", "⚧", "👥", "🇺🇳", "🎮", "🩸", "👊", "📏", "🎂"];  
  
// Normaliza cualquier valor de comparación a color base: green / yellow / red
function colorToBase(rawColor) {  
  if (!rawColor) return "red";  
  if (rawColor === "green") return "green";  
  if (rawColor === "yellow") return "yellow";  
  // Casos direccionales de height (higher/lower) y date_of_birth (older/younger)
  if (  
    rawColor.includes("higher") ||  
    rawColor.includes("lower") ||  
    rawColor.includes("older") ||  
    rawColor.includes("younger")  
  ) {  
    return rawColor.includes("red") ? "red" : "yellow";  
  }  
  return "red";  
}  
  
const EMOJI = { green: "🟩", yellow: "🟨", red: "🟥" };  
  
const DIFFICULTY_LABEL = {  
  normal: "Normal",  
  kiwami: "Kiwami",  
  infinite: "Infinite",  
};  
  
/**  
 * Construye el texto a compartir tipo Wordle.  
 * @param {Array} guesses - Lista de intentos { name, character, comparison }  
 * @param {string} difficulty - "normal" | "kiwami" | "infinite"  
 * @param {number} attempts - Número de intentos realizados  
 * @param {boolean} gameWon - Si la partida se ganó  
 * @param {number} maxAttempts - Límite de intentos
 * @returns {string}  
 */  
export function buildShareText(guesses, difficulty, attempts, gameWon, maxAttempts) {  
  const label = DIFFICULTY_LABEL[difficulty] || "Normal";  
  const score = gameWon ? `${attempts}/${maxAttempts}` : `X/${maxAttempts}`;  
  
  // Fila de cabecera con un emoji por columna, separados por espacio  
  const header = HEADER_EMOJIS.join(" ");  
  
  const grid = guesses  
    .map((g, idx) => {  
      // La columna del personaje: verde solo en la fila ganadora (la última si se ganó)  
      const isCorrectGuess = gameWon && idx === guesses.length - 1;  
      const charCell = isCorrectGuess ? EMOJI.green : EMOJI.red;  
      const fieldCells = FIELDS.map((key) => EMOJI[colorToBase(g.comparison?.[key])]);  
      // Todas las celdas de la fila separadas por espacio  
      return [charCell, ...fieldCells].join(" ");  
    })  
    .join("\n");  
  
  return `LADdle (${label}) ${score}\n\n${header}\n${grid}\n\nhttps://laddle.web.app/`;  
}