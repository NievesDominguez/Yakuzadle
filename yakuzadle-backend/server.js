const express = require("express");
const cors = require("cors");
const { db } = require("./firestore.js");
const { compareCharacters } = require("./compare.js");

const app = express();
app.use(cors());
app.use(express.json());

let normalCharacterNames = []; // Personajes sin campo difficulty  
let kiwamiCharacterNames = []; // Todos los personajes  
let characterDataCache = {};   // Datos completos cacheados para /list  

// Dos cachés independientes, una por dificultad  
let dailyTargets = {
  normal: { date: null, character: null },
  kiwami: { date: null, character: null },
};


// Algoritmo de selección diaria

// Hash numérico simple de un string  
function hashCode(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (Math.imul(31, hash) + str.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

// Generador pseudoaleatorio con semilla (LCG)  
function seededRandom(seed) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(1664525, s) + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

// Devuelve el índice del personaje del día usando un shuffle determinista basado en la fecha y la dificultad como semilla  
function getDailyIndex(names, dateStr, difficulty) {
  const seed = hashCode(dateStr + ":" + difficulty);
  const rand = seededRandom(seed);
  const indices = names.map((_, i) => i);
  for (let i = indices.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [indices[i], indices[j]] = [indices[j], indices[i]];
  }
  return indices[0];
}



async function loadCharacterNames() {
  const snapshot = await db.collection("personajes").get();
  kiwamiCharacterNames = snapshot.docs.map(doc => doc.id);
  normalCharacterNames = snapshot.docs
    .filter(doc => !doc.data().difficulty)
    .map(doc => doc.id);
  // Cachear datos completos para que /list no consulte Firestore en cada petición  
  characterDataCache = {};
  snapshot.docs.forEach(doc => {
    characterDataCache[doc.id] = doc.data();
  });
  console.log(`Loaded ${kiwamiCharacterNames.length} total characters, ${normalCharacterNames.length} normal`);
}


// Función para obtener el personaje del día, con caché diario por dificultad  
async function getDailyTarget(difficulty = "normal", date = new Date()) {
  const utcDate = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dateStr = utcDate.toISOString().split('T')[0];

  const cache = dailyTargets[difficulty] || dailyTargets.normal;
  if (cache.date === dateStr && cache.character) {
    return cache.character;
  }

  const names = difficulty === "kiwami" ? kiwamiCharacterNames : normalCharacterNames;
  if (names.length === 0) throw new Error("No characters available for difficulty: " + difficulty);

  const index = getDailyIndex(names, dateStr, difficulty);
  const targetName = names[index];

  const doc = await db.collection("personajes").doc(targetName).get();
  if (!doc.exists) throw new Error(`Target character ${targetName} not found`);

  dailyTargets[difficulty] = { date: dateStr, character: doc.data() };
  return doc.data();
}


// Endpoint de depuración: permite cambiar el personaje del día  
app.get("/debug-set-target", async (req, res) => {
  if (process.env.NODE_ENV === "production") {
    return res.status(403).json({ error: "Debug endpoint not available in production" });
  }
  const name = req.query.name;
  const difficulty = req.query.difficulty === "kiwami" ? "kiwami" : "normal";
  if (!name) return res.status(400).json({ error: "Missing name" });

  try {
    const doc = await db.collection("personajes").doc(name).get();
    if (!doc.exists) return res.status(404).json({ error: "Character not found" });

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
  const name = req.query.name;
  const difficulty = req.query.difficulty === "kiwami" ? "kiwami" : "normal";
  if (!name) return res.status(400).json({ error: "Missing name" });

  const userChar = getCharacter(name);
  if (!userChar) return res.status(404).json({ error: "Character not found" });

  try {
    const targetChar = await getDailyTarget(difficulty);
    const result = compareCharacters(userChar, targetChar);
    res.json({
      character: { ...userChar, games: userChar.appears_in, gender: userChar.gender || "M" },
      result,
      target: { name: targetChar.name, images: targetChar.images || [] },
    });
  } catch (error) {
    console.error("Error getting daily target:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});


// Endpoint para listar todos los personajes — usa caché en memoria, sin consultar Firestore  
app.get("/list", (req, res) => {
  const items = kiwamiCharacterNames.map(name => {
    const data = characterDataCache[name] || {};
    const image = data.images && data.images.length > 0 ? data.images[0] : null;
    return {
      name,
      image: image
        ? `https://raw.githubusercontent.com/NievesDominguez/Yakuzadle/main/img_yakuzadle/${image}`
        : null,
      aliases: data.aliases || [],
      nicknames: data.nicknames || [],
      kiwamiOnly: !!data.difficulty,
    };
  });
  res.json(items);
});


// Devuelve el personaje objetivo del día  
app.get("/daily-target", async (req, res) => {
  const difficulty = req.query.difficulty === "kiwami" ? "kiwami" : "normal";
  try {
    const target = await getDailyTarget(difficulty);
    res.json({ name: target.name, images: target.images || [] });
  } catch (error) {
    console.error("Error fetching daily target:", error);
    res.status(500).json({ error: "Could not fetch daily target" });
  }
});


// Función auxiliar para obtener un personaje por nombre desde la caché
function getCharacter(name) {
  return characterDataCache[name] || null;
}


// Muestra una pista aleatoria del personaje objetivo  
app.get("/hint", async (req, res) => {
  const difficulty = req.query.difficulty === "kiwami" ? "kiwami" : "normal";
  const usedFields = req.query.usedFields
    ? req.query.usedFields.split(",").filter(Boolean)
    : [];

  const HINT_FIELDS = ["affiliation", "nationality", "games", "fighting_style", "height", "date_of_birth"];

  try {
    const target = await getDailyTarget(difficulty);

    const available = HINT_FIELDS.filter((field) => {
      if (usedFields.includes(field)) return false;
      const value = field === "games" ? target.appears_in : target[field];
      if (!value) return false;
      if (Array.isArray(value)) return value.length > 0 && !value.every(v => v === "unknown");
      if (typeof value === "string") return value.trim() !== "" && value.toLowerCase() !== "unknown";
      return true;
    });

    if (available.length === 0) {
      return res.json({ noHints: true });
    }

    const field = available[Math.floor(Math.random() * available.length)];
    const value = field === "games" ? target.appears_in : target[field];

    res.json({ field, value });
  } catch (error) {
    console.error("Error getting hint:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});


// Endpoint de salud para monitoreo
app.get("/health", (req, res) => {  
  res.json({ status: "ok" });  
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