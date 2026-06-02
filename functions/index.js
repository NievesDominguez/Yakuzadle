const functions = require("firebase-functions");  
const { db } = require("./firestore.js");  
const { compareCharacters } = require("./compare.js");  
  
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
  
async function getCharacter(name) {  
  const doc = await db.collection("personajes").doc(name).get();  
  return doc.exists ? doc.data() : null;  
}  
  
// Endpoint para adivinar un personaje  
exports.guess = functions.https.onRequest(async (req, res) => {  
  // CORS  
  res.set("Access-Control-Allow-Origin", "*");  
  if (req.method === "OPTIONS") {  
    res.set("Access-Control-Allow-Methods", "GET");  
    res.set("Access-Control-Allow-Headers", "Content-Type");  
    res.status(204).send("");  
    return;  
  }  
  
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
      target: targetChar  
    });  
  } catch (error) {  
    console.error("Error getting daily target:", error);  
    res.status(500).json({ error: "Internal server error" });  
  }  
});  
  
// Endpoint para listar todos los personajes  
exports.list = functions.https.onRequest(async (req, res) => {  
  // CORS  
  res.set("Access-Control-Allow-Origin", "*");  
  if (req.method === "OPTIONS") {  
    res.set("Access-Control-Allow-Methods", "GET");  
    res.set("Access-Control-Allow-Headers", "Content-Type");  
    res.status(204).send("");  
    return;  
  }  
  
  const snapshot = await db.collection("personajes").get();  
  const items = snapshot.docs.map(doc => {  
    const data = doc.data();  
    const image = data.images && data.images.length > 0 ? data.images[0] : null;  
    return {  
      name: doc.id,  
      image: image ? `https://raw.githubusercontent.com/nievesdom/DiscordBot/main/yakuzadle/img_yakuzadle/${image}` : null  
    };  
  });  
  res.json(items);  
});  
  
// Endpoint para obtener el personaje objetivo del día  
exports.dailyTarget = functions.https.onRequest(async (req, res) => {  
  // CORS  
  res.set("Access-Control-Allow-Origin", "*");  
  if (req.method === "OPTIONS") {  
    res.set("Access-Control-Allow-Methods", "GET");  
    res.set("Access-Control-Allow-Headers", "Content-Type");  
    res.status(204).send("");  
    return;  
  }  
  
  try {  
    const target = await getDailyTarget();  
    res.json({ name: target.name });  
  } catch (error) {  
    console.error("Error fetching daily target:", error);  
    res.status(500).json({ error: "Could not fetch daily target" });  
  }  
});  
  
// Cargar nombres al inicio (warm-up)  
loadCharacterNames().catch(err => {  
  console.error("Failed to load character names:", err);  
});