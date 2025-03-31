import admin from "firebase-admin";
import dotenv from "dotenv";
import fs from "fs";

dotenv.config();

const serviceAccountPath = process.env.FIREBASE_CREDENTIALS_PATH || "firebase-credentials.json";

if (!fs.existsSync(serviceAccountPath)) {
    console.error("Error: No se encuentra el archivo de credenciales de Firebase.");
    process.exit(1);
}

const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, "utf8"));

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();
export { db };
