import express from "express";
import { db } from "../src/firebaseConfig";

const router = express.Router();
const collectionName = "training";

// ✅ Obtener todas las respuestas del entrenamiento
router.get("/", async (req, res) => {
    try {
        const snapshot = await db.collection(collectionName).get();
        const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: "Error al obtener el entrenamiento", details: error });
    }
});

// ✅ Agregar una nueva pregunta-respuesta al entrenamiento
router.post("/", async (req, res) => {
    try {
        const { question, answer } = req.body;
        if (!question || !answer) {
            return res.status(400).json({ error: "Se requieren 'question' y 'answer'" });
        }

        const newEntry = await db.collection(collectionName).add({ question, answer });
        res.json({ success: true, id: newEntry.id });
    } catch (error) {
        res.status(500).json({ error: "Error al agregar la respuesta", details: error });
    }
});

// ✅ Editar una respuesta existente
router.put("/:id", async (req, res) => {
    try {
        const { id } = req.params;
        const { question, answer } = req.body;

        if (!question || !answer) {
            return res.status(400).json({ error: "Se requieren 'question' y 'answer'" });
        }

        await db.collection(collectionName).doc(id).update({ question, answer });
        res.json({ success: true, message: "Respuesta actualizada" });
    } catch (error) {
        res.status(500).json({ error: "Error al actualizar la respuesta", details: error });
    }
});

// ✅ Eliminar una respuesta
router.delete("/:id", async (req, res) => {
    try {
        const { id } = req.params;
        await db.collection(collectionName).doc(id).delete();
        res.json({ success: true, message: "Respuesta eliminada" });
    } catch (error) {
        res.status(500).json({ error: "Error al eliminar la respuesta", details: error });
    }
});

export default router;

