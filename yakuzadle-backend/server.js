const express = require("express");  
const cors = require("cors");  
const { db } = require("./firestore.js");  
const { compareCharacters } = require("./compare.js");

const app = express();
app.use(cors());
app.use(express.json());

let characterNames = [];
let dailyTarget = {
  date: null,
  character: null
};

async function loadCharacterNames() {
  const snapshot = await db.collection("personajes").get();
  characterNames = snapshot.docs.map(doc => doc.id);
  console.log(`Loaded ${characterNames.length} character names`);
}

async function getDailyTarget(date = new Date()) {
  const utcDate = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dateStr = utcDate.toISOString().split('T')[0];

  if (dailyTarget.date === dateStr && dailyTarget.character) {
    return dailyTarget.character;
  }

  const startOfYear = new Date(Date.UTC(utcDate.getUTCFullYear(), 0, 1));
  const diff = utcDate - startOfYear;
  const dayOfYear = Math.floor(diff / 86400000) + 1;
  const index = (dayOfYear - 1) % characterNames.length;
  const targetName = characterNames[index];

  const doc = await db.collection("personajes").doc(targetName).get();
  if (!doc.exists) {
    throw new Error(`Target character ${targetName} not found`);
  }
  const targetChar = doc.data();

  dailyTarget = {
    date: dateStr,
    character: targetChar
  };

  return targetChar;
}

// Endpoint de depuración: permite cambiar el personaje del día
app.get("/debug-set-target", async (req, res) => {
  // Solo permitir en desarrollo
  if (process.env.NODE_ENV === "production") {
    return res.status(403).json({ error: "Debug endpoint not available in production" });
  }

  const name = req.query.name;
  if (!name) return res.status(400).json({ error: "Missing name" });

  try {
    const doc = await db.collection("personajes").doc(name).get();
    if (!doc.exists) {
      return res.status(404).json({ error: "Character not found" });
    }

    // Forzar la actualización del dailyTarget
    const todayStr = new Date().toISOString().split('T')[0];
    dailyTarget = {
      date: todayStr,
      character: doc.data()
    };

    res.json({ success: true, target: name });
  } catch (error) {
    console.error("Error setting debug target:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});




// Endpoint para adivinar un personaje
app.get("/guess", async (req, res) => {
  const name = req.query.name;
  if (!name) return res.status(400).json({ error: "Missing name" });

  const userChar = await getCharacter(name);
  if (!userChar) return res.status(404).json({ error: "Character not found" });

  try {
    const targetChar = await getDailyTarget();
    const result = compareCharacters(userChar, targetChar);

    res.json({
      character: {
        ...userChar,
        games: userChar.appears_in
      },
      result,
      target: targetChar  // Incluimos el objetivo para que el frontend pueda usarlo
    });
  } catch (error) {
    console.error("Error getting daily target:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Endpoint para listar todos los personajes (con imagen para autocompletado)
app.get("/list", async (req, res) => {
  const snapshot = await db.collection("personajes").get();
  const items = snapshot.docs.map(doc => {
    const data = doc.data();
    const image = data.images && data.images.length > 0 ? data.images[0] : null;
    return {
      name: doc.id,
      image: image ? `https://raw.githubusercontent.com/NievesDominguez/Yakuzadle/main/img_yakuzadle/${image}` : null
    };
  });
  res.json(items);
});

// Devuelve el personaje objetivo del día
app.get("/daily-target", async (req, res) => {  
  try {  
    const target = await getDailyTarget();  
    res.json({  
      name: target.name,  
      images: target.images || []  
    });  
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