export type ReplyKind = 'human_reply' | 'auto_reply' | 'bounce';
export type ClassifierFn = (text: string) => Promise<ReplyKind>;

const AUTO_REPLY_PATTERNS = [
  /fuera de (?:la )?oficina/i,
  /out of office/i,
  /vacaciones/i,
  /no estaré disponible/i,
  /respuesta automática/i,
  /autorespuesta/i,
];

const BOUNCE_PATTERNS = [
  /mail delivery subsystem/i,
  /delivery failed/i,
  /address not found/i,
  /undeliverable/i,
  /no se ha podido entregar/i,
];

export async function classifyReply(
  body: string,
  llm: ClassifierFn
): Promise<ReplyKind> {
  if (BOUNCE_PATTERNS.some((rx) => rx.test(body))) return 'bounce';
  if (AUTO_REPLY_PATTERNS.some((rx) => rx.test(body))) return 'auto_reply';
  return llm(body);
}
