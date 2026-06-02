const admin = require("firebase-admin");  
const fs = require("fs");  
  
const serviceAccount = JSON.parse(  
  fs.readFileSync("./serviceAccountKey.json", "utf8")  
);  
  
admin.initializeApp({  
  credential: admin.credential.cert(serviceAccount)  
});  
  
module.exports = { db: admin.firestore() };