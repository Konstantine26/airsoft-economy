const PREFIX = 'airsoft-economy:participant:';

export function encodeParticipantCode(participantNumber: number): string {
  return `${PREFIX}${participantNumber}`;
}

export function decodeParticipantCode(raw: string): number | null {
  const text = raw.trim();
  const withoutPrefix = text.startsWith(PREFIX) ? text.slice(PREFIX.length) : text;
  const digits = withoutPrefix.replace(/\D/g, '');
  if (!digits) return null;
  const n = Number(digits);
  return Number.isSafeInteger(n) ? n : null;
}
