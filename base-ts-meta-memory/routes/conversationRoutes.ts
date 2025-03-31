import express from "express";
import { db } from "../src/firebaseConfig";

const router = express.Router();

// Obtener todas las conversaciones ordenadas por fecha
router.get("/", async (req, res) => {
    const snapshot = await db.collection("conversations").orderBy("timestamp", "desc").get();
    const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    res.json(data);
});

// Guardar conversación en Firestore
router.post("/", async (req, res) => {
    const { userMessage, botResponse } = req.body;
    
    if (!userMessage || !botResponse) {
        return res.status(400).json({ error: "Se requieren 'userMessage' y 'botResponse'" });
    }

    await db.collection("conversations").add({
        userMessage,
        botResponse,
        timestamp: new Date()
    });

    res.json({ success: true });
});

export default router;
