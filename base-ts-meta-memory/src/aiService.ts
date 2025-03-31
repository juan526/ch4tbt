import dotenv from "dotenv";
dotenv.config();

import { db } from "./firebaseConfig";
import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export const getChatGPTResponse = async (userMessage: string): Promise<string> => {
  try {
    // ✅ Versión firebase-admin para obtener el entrenamiento
    const configSnap = await db.collection("settings").doc("prompts").get();
    const config = configSnap.exists ? configSnap.data() : {};

    const basePrompt = config?.entrenamiento_base || "Actúa como un asistente de ventas.";
    const palabraCierre = config?.palabra_cierre || "Lead en Proceso";

    const chatCompletion = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        { role: "system", content: basePrompt },
        { role: "user", content: userMessage }
      ]
    });

    const response = chatCompletion.choices[0].message.content;

    if (response.toLowerCase().includes(palabraCierre.toLowerCase())) {
      console.log("✅ Lead en Proceso detectado");
      // Puedes guardar el lead, enviar alerta, etc.
    }

    return response;
  } catch (error) {
    console.error("❌ Error generando respuesta:", error);
    return "Hubo un problema generando la respuesta.";
  }
};
