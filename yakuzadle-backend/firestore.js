const admin = require("firebase-admin");  
  
let serviceAccount;  
  
if (process.env.FIREBASE_CREDENTIALS) {  
  // En producción: usar variable de entorno  
  serviceAccount = JSON.parse(process.env.FIREBASE_CREDENTIALS);  
} else {  
  // En desarrollo local: usar archivo  
  const fs = require("fs");  
  serviceAccount = JSON.parse(  
    fs.readFileSync("./serviceAccountKey.json", "utf8")  
  );  
}  
  
admin.initializeApp({  
  credential: admin.credential.cert(serviceAccount)  
});  
  
module.exports = { db: admin.firestore() };
