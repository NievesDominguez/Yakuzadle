const express = require("express");
const cors = require("cors");
const { db } = require("./firestore.js");
const { compareCharacters } = require("./compare.js");

const app = express();
app.use(cors());
app.use(express.json());

let normalCharacterNames = []; // Personajes sin campo difficulty
let kiwamiCharacterNames = []; // Todos los personajes

// Dos cachés independientes, una por dificultad  
let dailyTargets = {
  normal: { date: null, character: null },
  kiwami: { date: null, character: null },
};


async function loadCharacterNames() {
  const snapshot = await db.collection("personajes").get();
  kiwamiCharacterNames = snapshot.docs.map(doc => doc.id);
  normalCharacterNames = snapshot.docs
    .filter(doc => !doc.data().difficulty)
    .map(doc => doc.id);
  console.log(`Loaded ${kiwamiCharacterNames.length} total characters, ${normalCharacterNames.length} normal`);
}


// Función para obtener el personaje del día, con caché diario por dificultad
async function getDailyTarget(difficulty = "normal", date = new Date()) {
  // Convertir la fecha a formato YYYY-MM-DD para comparar solo por día, sin importar la hora
  const utcDate = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dateStr = utcDate.toISOString().split('T')[0];

  // Comprobar caché para la dificultad solicitada
  const cache = dailyTargets[difficulty] || dailyTargets.normal;
  if (cache.date === dateStr && cache.character) {
    return cache.character;
  }

  const names = difficulty === "kiwami" ? kiwamiCharacterNames : normalCharacterNames;
  if (names.length === 0) throw new Error("No characters available for difficulty: " + difficulty);

  // Calcular el índice del personaje del día usando el día del año y un offset para kiwami
  const startOfYear = new Date(Date.UTC(utcDate.getUTCFullYear(), 0, 1));
  const dayOfYear = Math.floor((utcDate - startOfYear) / 86400000) + 1;
  // Usar un offset diferente para kiwami para que no coincida con normal
  const offset = difficulty === "kiwami" ? Math.floor(names.length / 2) : 0;
  const index = ((dayOfYear - 1) + offset) % names.length;
  const targetName = names[index];

  const doc = await db.collection("personajes").doc(targetName).get();
  if (!doc.exists) throw new Error(`Target character ${targetName} not found`);

  // Guardar en la caché correspondiente a la dificultad
  dailyTargets[difficulty] = { date: dateStr, character: doc.data() };
  return doc.data();
}


// Endpoint de depuración: permite cambiar el personaje del día
app.get("/debug-set-target", async (req, res) => {
  if (process.env.NODE_ENV === "production") {
    return res.status(403).json({ error: "Debug endpoint not available in production" });
  }
  const name = req.query.name;
  // Permitir seleccionar dificultad mediante query param, por ejemplo: /debug-set-target?name=Kiryu&difficulty=kiwami
  const difficulty = req.query.difficulty === "kiwami" ? "kiwami" : "normal";
  if (!name) return res.status(400).json({ error: "Missing name" });

  // Verificar que el personaje existe antes de establecerlo como objetivo del día
  try {
    const doc = await db.collection("personajes").doc(name).get();
    if (!doc.exists) return res.status(404).json({ error: "Character not found" });

    // Establecer el nuevo personaje del día en la caché correspondiente a la dificultad con la fecha actual
    const todayStr = new Date().toISOString().split('T')[0];
    dailyTargets[difficulty] = { date: todayStr, character: doc.data() };
    res.json({ success: true, target: name, difficulty });
  } catch (error) {
    console.error("Error setting debug target:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});


// Endpoint para adivinar un personaje
app.get("/guess", async (req, res) => {
  const name = req.query.name; // Nombre del personaje adivinado
  // Permitir seleccionar dificultad mediante query param, por ejemplo: /guess?name=Kiryu&difficulty=kiwami
  const difficulty = req.query.difficulty === "kiwami" ? "kiwami" : "normal";
  if (!name) return res.status(400).json({ error: "Missing name" });

  // Obtener datos del personaje adivinado
  const userChar = await getCharacter(name);
  if (!userChar) return res.status(404).json({ error: "Character not found" });

  try {
    // Obtener el personaje objetivo del día para la dificultad solicitada
    const targetChar = await getDailyTarget(difficulty);
    // Comparar ambos personajes y devolver resultado
    const result = compareCharacters(userChar, targetChar);
    // Devolver datos del personaje adivinado, resultado de la comparación y datos del objetivo
    const isCorrect = userChar.name === targetChar.name;
    res.json({
      character: { ...userChar, games: userChar.appears_in },
      result,
      isCorrect,
    });
  } catch (error) {
    console.error("Error getting daily target:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});


// Endpoint para listar todos los personajes
app.get("/list", async (req, res) => {
  const snapshot = await db.collection("personajes").get();
  const items = snapshot.docs.map(doc => {
    const data = doc.data();
    const image = data.images && data.images.length > 0 ? data.images[0] : null;
    return {
      name: doc.id,
      image: image ? `https://raw.githubusercontent.com/NievesDominguez/Yakuzadle/main/img_yakuzadle/${image}` : null,
      aliases: data.aliases || [],
      nicknames: data.nicknames || [],
    };
  });
  res.json(items);
});


// Devuelve el personaje objetivo del día
app.get("/daily-target", async (req, res) => {
  // Permitir seleccionar dificultad mediante query param, por ejemplo: /daily-target?difficulty=kiwami
  const difficulty = req.query.difficulty === "kiwami" ? "kiwami" : "normal";
  //Devuelve el nombre e imagen del personaje objetivo
  try {
    const target = await getDailyTarget(difficulty);
    res.json({ name: target.name, images: target.images || [] });
  } catch (error) {
    console.error("Error fetching daily target:", error);
    res.status(500).json({ error: "Could not fetch daily target" });
  }
});


// Función auxiliar para obtener un personaje por nombre desde Firestore
async function getCharacter(name) {
  const doc = await db.collection("personajes").doc(name).get();
  return doc.exists ? doc.data() : null;
}


// Muestra una pista aleatoria del personaje objetivo
app.get("/hint", async (req, res) => {
  const difficulty = req.query.difficulty === "kiwami" ? "kiwami" : "normal";
  // Campos ya mostrados como pista o ya adivinados correctamente, separados por coma  
  const usedFields = req.query.usedFields
    ? req.query.usedFields.split(",").filter(Boolean)
    : [];

  // Campos disponibles para pistas
  const HINT_FIELDS = ["affiliation", "nationality", "games", "fighting_style", "height", "date_of_birth"];

  try {
    const target = await getDailyTarget(difficulty); // Obtener el personaje objetivo para la dificultad solicitada

    const available = HINT_FIELDS.filter((field) => {
      // Excluir campos ya usados o sin valor útil
      if (usedFields.includes(field)) return false;
      // Para el campo games usar appears_in  
      const value = field === "games" ? target.appears_in : target[field];
      if (!value) return false;
      if (Array.isArray(value)) return value.length > 0 && !value.every(v => v === "unknown");
      if (typeof value === "string") return value.trim() !== "" && value.toLowerCase() !== "unknown";
      return true;
    });

    // Si no hay campos disponibles, devolver un mensaje indicando que no quedan pistas
    if (available.length === 0) {
      return res.json({ noHints: true });
    }

    // Elegir un campo aleatorio de los disponibles y devolver su valor
    const field = available[Math.floor(Math.random() * available.length)];
    const value = field === "games" ? target.appears_in : target[field];

    res.json({ field, value });
  } catch (error) {
    console.error("Error getting hint:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});


// Inicializar: cargar nombres y arrancar servidor
loadCharacterNames().then(() => {
  const PORT = process.env.PORT || 3001;
  app.listen(PORT, () => {
    console.log(`Yakuzadle backend running on port ${PORT}`);
  });
}).catch(err => {
  console.error("Failed to load character names:", err);
  process.exit(1);
});
