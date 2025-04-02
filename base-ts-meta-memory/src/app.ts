import * as dotenv from 'dotenv';
import { join } from 'path';
import { createBot, createProvider, createFlow, addKeyword, utils} from '@builderbot/bot';
import { MemoryDB as Database } from '@builderbot/bot';
import { MetaProvider as Provider } from '@builderbot/provider-meta';
import OpenAI from "openai";
import { getChatGPTResponse } from "./aiService";
import { db } from "./firebaseConfig";
import express from "express";
import cors from "cors";
import trainingRoutes from "../routes/trainingRoutes";
import conversationRoutes from "../routes/conversationRoutes";
import { obtenerCliente, guardarCliente } from "./clienteService";


dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());
app.use("/api/conversations", conversationRoutes);
app.use("/api/training", trainingRoutes);

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY 
});

let knowledgeBase: Record<string, string> = {};

// Cargar datos desde Firestore
async function loadKnowledgeBase() {
    const snapshot = await db.collection("training").get();
    knowledgeBase = snapshot.docs.reduce((acc, doc) => {
        acc[doc.data().question.toLowerCase()] = doc.data().answer;
        return acc;
    }, {} as Record<string, string>);
}

// Función para guardar conversaciones en Firestore
async function saveConversation(user: string, message: string, response: string) {
    try {
        console.log(` Intentando guardar en Firestore...`);
        console.log(` Usuario: ${user}`);
        console.log(` Mensaje: ${message}`);
        console.log(` Respuesta: ${response}`);

        await db.collection("conversations").add({
            user,
            message,
            response,
            timestamp: new Date()
        });

        console.log(` Conversación guardada en Firestore.`);
    } catch (error) {
        console.error("Error al guardar la conversación en Firestore:", error);
    }
}

// Cargar base de conocimiento al inicio
loadKnowledgeBase();

const PORT = process.env.PORT ?? 3008;


const welcomeFlow = addKeyword(['hi', 'hello', 'hola'])
    .addAnswer(
        '¿En qué te puedo ayudar hoy?',
        { capture: true },
        async (ctx, { flowDynamic }) => {
            const userMessage = ctx.body;
            const aiResponse = await getChatGPTResponse(userMessage);

            // Guardar en Firestore
            await db.collection("conversations").add({
                userMessage,
                botResponse: aiResponse,
                timestamp: new Date()
            });

            await flowDynamic(aiResponse);
        }
    );

const main = async () => {
    const adapterFlow = createFlow([welcomeFlow]);
    const adapterProvider = createProvider(Provider, {
        jwtToken: process.env.jwtToken,
        numberId: process.env.numberId,
        verifyToken: process.env.verifyToken,
        version: 'v22.0'
    });
    const adapterDB = new Database();

    const { handleCtx, httpServer } = await createBot({
        flow: adapterFlow,
        provider: adapterProvider,
        database: adapterDB,
    });

    adapterProvider.server.post('/v1/messages', handleCtx(async (bot, req, res) => {
        const { number, message, urlMedia } = req.body;
        await bot.sendMessage(number, message, { media: urlMedia ?? null });
        res.end('sent');
    }));

    adapterProvider.server.post('/v1/register', handleCtx(async (bot, req, res) => {
        const { number, name } = req.body;
        await bot.dispatch('REGISTER_FLOW', { from: number, name });
        res.end('triggered');
    }));

    adapterProvider.server.post('/v1/blacklist', handleCtx(async (bot, req, res) => {
        const { number, intent } = req.body;
        if (intent === 'remove') bot.blacklist.remove(number);
        if (intent === 'add') bot.blacklist.add(number);
        res.json({ status: 'ok', number, intent });
    }));

    httpServer(+PORT);
};

main();