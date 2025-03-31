import { addKeyword } from '@builderbot/bot';
import { db } from '../firebaseConfig';

export const asesorHumanoFlow = addKeyword([
  'quiero hablar con alguien',
  'asesor humano',
  'atención personalizada',
  'prefiero hablar con alguien directamente',
])
  .addAnswer('😊 ¡Claro que sí! Ya mismo te comunico con uno de nuestros asesores.')
  .addAction(async (ctx, { flowDynamic }) => {
    const { from } = ctx;

    // Marcar solicitud en Firestore
    await db.collection('solicitudesHumanas').doc(from).set({
      user: from,
      timestamp: new Date(),
      status: 'pendiente'
    });

    await flowDynamic('🕐 Un asesor se pondrá en contacto contigo pronto.');
  });

