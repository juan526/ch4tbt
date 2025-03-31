import * as dotenv from 'dotenv';
import { join } from 'path';
import { createBot, createProvider, createFlow, addKeyword, utils } from '@builderbot/bot';
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
import { dtfFlow } from "./flows/dtfFlow";
import { enviosFlow } from "./flows/enviosFlow";
import { asesorHumanoFlow } from "./flows/asesorHumanoFlow";
import { clientesIndecisosFlow } from "./flows/clientesIndecisosFlow";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());
app.use("/routes/conversations", conversationRoutes);
app.use("/routes/training", trainingRoutes);

// Webhook GET - Validación con Meta
app.get('/webhook', (req, res) => {
    const verifyToken = process.env.verifyToken;
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (mode && token && mode === 'subscribe' && token === verifyToken) {
        console.log('✅ Webhook verificado correctamente con Meta.');
        res.status(200).send(challenge);
    } else {
        console.warn('❌ Falló la verificación del webhook.');
        res.sendStatus(403);
    }
});

// Webhook POST - Recepción de mensajes reales de usuarios
app.post('/webhook', async (req, res) => {
    const body = req.body;
    console.log("📥 Mensaje recibido:", JSON.stringify(body, null, 2));

    if (body.object === "whatsapp_business_account") {
        const entry = body.entry?.[0];
        const changes = entry?.changes?.[0];
        const value = changes?.value;
        const messages = value?.messages;

        if (messages && messages.length > 0) {
            const msg = messages[0];
            const number = msg.from;
            const text = msg.text?.body;

            console.log("📲 De:", number, "| 💬 Mensaje:", text);
            // Aquí podrías integrar el procesamiento del bot
        }
    }

    res.sendStatus(200);
});

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
        console.log(`📌 Intentando guardar en Firestore...`);
        console.log(`👤 Usuario: ${user}`);
        console.log(`📩 Mensaje: ${message}`);
        console.log(`🤖 Respuesta: ${response}`);

        await db.collection("conversations").add({
            user,
            message,
            response,
            timestamp: new Date()
        });

        console.log(`✅ Conversación guardada en Firestore.`);
    } catch (error) {
        console.error("❌ Error al guardar la conversación en Firestore:", error);
    }
}

loadKnowledgeBase();

const PORT = process.env.PORT ?? 3008;

const welcomeFlow = addKeyword(['hi', 'hello', 'hola', 'buenas', 'hey', 'buenos días', 'buenas tardes'])
    .addAnswer('', { capture: true }, async (ctx, { flowDynamic }) => {
        const numero = ctx.from;
        const mensaje = ctx.body.trim().toLowerCase();

        let nombre = await obtenerCliente(numero);

        if (!nombre) {
            if (!mensaje.startsWith("me llamo")) {
                await flowDynamic("👋 ¡Hola! Bienvenido a Isuapliques 😊. Estoy aquí para ayudarte con información sobre apliques, estampados DTF y camisetas.\n\nPor favor, dime tu nombre escribiendo: *me llamo [tu nombre]*");
                return;
            }

            nombre = mensaje.replace(/me llamo\s?/i, "").trim();
            await guardarCliente(numero, nombre);
            await flowDynamic(`¡Gracias ${nombre}! 😄 ¿Sobre qué producto deseas saber más? Puedes escribir: *apliques*, *estampados DTF*, *camisetas*, *envíos* o *hablar con un asesor*`);
            return;
        }

        const aiResponse = await getChatGPTResponse(mensaje);

        await saveConversation(nombre, mensaje, aiResponse);

        await flowDynamic(aiResponse);
    });

const main = async () => {
    const adapterFlow = createFlow([welcomeFlow, dtfFlow, enviosFlow, asesorHumanoFlow, clientesIndecisosFlow]);
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

    adapterProvider.server.post('/v1/samples', handleCtx(async (bot, req, res) => {
        const { number, name } = req.body;
        await bot.dispatch('SAMPLES', { from: number, name });
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
