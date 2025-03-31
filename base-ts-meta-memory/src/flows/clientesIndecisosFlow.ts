import { addKeyword } from "@builderbot/bot";

export const clientesIndecisosFlow = addKeyword(['no sé', 'solo estoy mirando', 'no estoy seguro'])
  .addAnswer('🤔 No hay problema, tenemos varias opciones que podrían interesarte.')
  .addAnswer('¿Te gustaría saber más sobre nuestros estampados DTF, camisetas o personalizaciones?')
  .addAnswer('También puedo mostrarte algunos productos populares si lo deseas.');
