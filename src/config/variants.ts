import { getClient } from '../services/supabase.js';
import { logger } from '../lib/logger.js';

/**
 * Variantes A/B/C. Volumen bajo (5-30/día), así que solo testeamos cambios GRANDES.
 * Cualquier cambio sutil sería indetectable: con baseline ~5% reply, detectar +20% lift
 * requiere ~7.000 envíos por variante. Por eso variamos ángulo entero, no palabras.
 *
 * Hipótesis pre-registradas (revisar tras N=300/variante o p<0.05):
 *
 *  v1_directo (control):
 *    - Email base del system prompt: observación → oferta → salida fácil.
 *    - Hipótesis nula. Es el baseline.
 *
 *  v2_pregunta:
 *    - Abre con pregunta retórica antes de la observación.
 *    - Porque las preguntas activan engagement.
 *    - Predicción: +30-50% reply rate vs v1.
 *
 *  v3_proof:
 *    - Añade UNA línea de prueba social ("ya he hecho web a otro negocio similar de la zona").
 *    - Porque social proof es la palanca ausente más potente en el control.
 *    - Predicción: +50-100% reply rate vs v1.
 *    - Riesgo: si suena inventado, baja trust. Por eso es genérico, sin nombres.
 */
export const VARIANT_DEFINITIONS = [
  {
    name: 'v1_directo',
    prompt_snippet: '',
    active: true,
    weight: 1,
  },
  {
    name: 'v2_pregunta',
    prompt_snippet: `VARIACIÓN ACTIVA — APERTURA CON PREGUNTA:
Antes de la observación del problema, abre con UNA pregunta retórica corta dirigida al cliente final del negocio (no al dueño).
Ejemplos según caso:
- Sin web: "¿Cuánta gente os busca en Google y no os encuentra?"
- Web antigua: "¿Habéis visto vuestra web en el móvil últimamente?"
- Problemas técnicos: "¿Sabéis cómo se ve vuestra web hoy desde un móvil nuevo?"
La pregunta va SOLA, en su propio <p>, antes de la observación. La observación viene después como respuesta implícita.
Sin signos de exclamación. Sin "¿verdad?" ni coletillas.`,
    active: true,
    weight: 1,
  },
  {
    name: 'v3_proof',
    prompt_snippet: `VARIACIÓN ACTIVA — PROOF POINT SUTIL:
Después de la observación del problema y antes de la oferta, añade UNA frase corta mencionando que ya has hecho esto para otro negocio similar de la zona.
Ejemplos según categoría:
- Clínica: "He montado web a otra clínica del País Vasco hace poco, sé el tipo de cosas que mueven la aguja."
- Asesoría/despacho: "He montado web a otro despacho de la zona hace poco, sé qué genera confianza y qué no."
- Inmobiliaria: "He montado web a otra inmobiliaria del norte hace poco, sé qué hace que entren más llamadas."
- Reformas: "He montado web a otro negocio de reformas de la zona hace poco, sé qué tipo de cosas convierten."
- Otros: "He montado web a otro negocio similar de la zona hace poco."
NUNCA inventes nombres concretos de clientes. NUNCA pongas cifras inventadas ("subí ventas un X%").
La frase va sola, sin "y" ni "además". Tono: comentario al margen, no presunción.`,
    active: true,
    weight: 1,
  },
] as const;

/**
 * Idempotent upsert by `name`. Safe to call on every boot.
 * Existing variants keep their sent_count / reply_count; only the snippet/weight/active fields update.
 */
export async function ensureVariantsSeeded(): Promise<void> {
  const log = logger.child({ component: 'variant-seed' });
  const sb = getClient();
  for (const v of VARIANT_DEFINITIONS) {
    const { error } = await sb.from('variants').upsert(v, { onConflict: 'name' });
    if (error) {
      log.error({ err: error.message, variant: v.name }, 'variant upsert failed');
      throw new Error(`Failed to seed variant ${v.name}: ${error.message}`);
    }
  }
  log.info({ count: VARIANT_DEFINITIONS.length }, 'variants ensured');
}
