import * as dotenv from 'dotenv';
import { join } from 'path';
import express from 'express';
import cors from 'cors';
import { createBot, createFlow, createProvider, addKeyword, utils, EVENTS } from '@builderbot/bot';
import { MemoryDB as Database } from '@builderbot/bot';
import { MetaProvider as Provider } from '@builderbot/provider-meta';
import OpenAI from 'openai';

import { getChatGPTResponse } from './aiService';
import { db } from './firebaseConfig';
import trainingRoutes from '../routes/trainingRoutes';
import conversationRoutes from '../routes/conversationRoutes';
import { dtfFlow } from './flows/dtfFlow';
import { enviosFlow } from './flows/enviosFlow';
import { asesorHumanoFlow } from './flows/asesorHumanoFlow';
import { clientesIndecisosFlow } from './flows/clientesIndecisosFlow';
import { obtenerCliente, guardarCliente } from './clienteService';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());
app.use('/api/conversations', conversationRoutes);
app.use('/api/training', trainingRoutes);

// Meta verification endpoint
app.get('/webhook', (req, res) => {
    const verifyToken = process.env.verifyToken;
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (mode === 'subscribe' && token === verifyToken) {
        console.log('✅ Webhook verificado correctamente con Meta.');
        res.status(200).send(challenge);
    } else {
        console.warn('❌ Falló la verificación del webhook.');
        res.sendStatus(403);
    }
});

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

let knowledgeBase: Record<string, string> = {};

async function loadKnowledgeBase() {
    const snapshot = await db.collection('training').get();
    knowledgeBase = snapshot.docs.reduce((acc, doc) => {
        acc[doc.data().question.toLowerCase()] = doc.data().answer;
        return acc;
    }, {} as Record<string, string>);
}

async function saveConversation(user: string, message: string, response: string) {
    try {
        await db.collection('conversations').add({
            user,
            message,
            response,
            timestamp: new Date(),
        });
    } catch (error) {
        console.error('❌ Error al guardar la conversación en Firestore:', error);
    }
}

// Welcome Flow
const welcomeFlow = addKeyword(['hi', 'hello', 'hola', 'buenas', 'hey'])
    .addAnswer('', { capture: true }, async (ctx, { flowDynamic }) => {
        const numero = ctx.from;
        const mensaje = ctx.body.trim().toLowerCase();
        let nombre = await obtenerCliente(numero);

        if (!nombre) {
            if (!mensaje.startsWith('me llamo')) {
                await flowDynamic(
                    '👋 ¡Hola! Bienvenido a Isuapliques 😊.\nEstoy aquí para ayudarte con información sobre apliques, estampados DTF y camisetas.\n\nPor favor, dime tu nombre escribiendo: *me llamo [tu nombre]*'
                );
                return;
            }

            nombre = mensaje.replace(/me llamo\s?/i, '').trim();
            await guardarCliente(numero, nombre);
            await flowDynamic(
                `¡Gracias ${nombre}! 😄 ¿Sobre qué producto deseas saber más? Puedes escribir: *apliques*, *estampados DTF*, *camisetas*, *envíos* o *hablar con un asesor*`
            );
            return;
        }

        const aiResponse = await getChatGPTResponse(mensaje);
        await saveConversation(nombre, mensaje, aiResponse);
        await flowDynamic(aiResponse);
    });

// Fallback con IA si no coincide con ningún otro
const fallbackFlow = addKeyword("").addAnswer('', { capture: true }, async (ctx, { flowDynamic }) => {
    const userMessage = ctx.body;
    const aiResponse = await getChatGPTResponse(userMessage);

    await saveConversation(ctx.from, userMessage, aiResponse);
    await flowDynamic(aiResponse);
});

const main = async () => {
    await loadKnowledgeBase();

    const adapterFlow = createFlow([
        welcomeFlow,
        dtfFlow,
        enviosFlow,
        asesorHumanoFlow,
        clientesIndecisosFlow,
        fallbackFlow,
    ]);

    const adapterProvider = createProvider(Provider, {
        jwtToken: process.env.jwtToken,
        numberId: process.env.numberId,
        verifyToken: process.env.verifyToken,
        version: 'v22.0',
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

    httpServer(Number(process.env.PORT) || 3008);
};

main().catch((err) => {
    console.error('Error al iniciar el bot:', err);
});
