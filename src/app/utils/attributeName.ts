/**
 * Autocorrector de nombres de atributos nuevos:
 * - Normaliza a snake_case (minúsculas, sin espacios, sin tildes, sin caracteres inválidos).
 * - Valida que las palabras estén bien escritas en inglés usando el diccionario
 *   del sistema a través del proceso principal de Electron (window.desktopApp).
 *
 * Solo debe aplicarse a atributos NUEVOS; los existentes nunca se modifican.
 */

declare global {
  interface Window {
    desktopApp?: {
      checkEnglishWords?: (words: string[]) => Promise<{ ok: boolean; unknown: string[]; error?: string }>;
    };
  }
}

export function normalizeAttributeName(raw: string): string {
  return raw
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/_{2,}/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase();
}

export async function findNonEnglishWords(name: string): Promise<string[]> {
  const tokens = name
    .split(/_+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 1);
  if (tokens.length === 0) {
    return [];
  }

  const checker = window.desktopApp?.checkEnglishWords;
  if (!checker) {
    return [];
  }

  try {
    const result = await checker(tokens);
    if (!result?.ok) {
      return [];
    }
    return result.unknown || [];
  } catch {
    return [];
  }
}
