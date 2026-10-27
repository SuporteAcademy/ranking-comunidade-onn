const PARTICULAS = new Set(['da', 'de', 'do', 'das', 'dos', 'e', 'di', 'du']);

export function semAcento(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '');
}

export function normalizar(s: string | null | undefined): string {
  return semAcento(String(s ?? ''))
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

const cacheTokens = new Map<string, string[]>();

export function tokensNome(s: string | null | undefined): string[] {
  const chave = String(s ?? '');
  const salvo = cacheTokens.get(chave);
  if (salvo) return salvo;
  const tokens = normalizar(chave)
    .replace(/[^a-z\s]/g, ' ')
    .split(' ')
    .filter((t) => t.length > 1 && !PARTICULAS.has(t));
  if (cacheTokens.size > 50_000) cacheTokens.clear();
  cacheTokens.set(chave, tokens);
  return tokens;
}

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  const linha = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let anterior = linha[0];
    linha[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const temp = linha[j];
      linha[j] = Math.min(linha[j] + 1, linha[j - 1] + 1, anterior + (a[i - 1] === b[j - 1] ? 0 : 1));
      anterior = temp;
    }
  }
  return linha[b.length];
}

/**
 * Compara um pedaço do nome digitado no Meet com um pedaço do nome no cadastro.
 * Aceita abreviação ("Mari" → "Maria") e um erro de digitação em nomes longos
 * ("Guimarais" → "Guimaraes"), mas não troca nomes parecidos ("Mariana" ≠ "Marina").
 */
export function tokenBate(doMeet: string, doCadastro: string): boolean {
  if (doMeet === doCadastro) return true;
  if (doMeet.length >= 4 && doCadastro.startsWith(doMeet)) return true;
  if (doMeet.length >= 7 && doCadastro.length >= 7 && levenshtein(doMeet, doCadastro) <= 1) return true;
  return false;
}

export interface Semelhanca {
  /** fração dos pedaços do nome do Meet encontrados no cadastro (0–1) */
  cobertura: number;
  primeiroNomeBate: boolean;
}

export function semelhancaNome(nomeMeet: string, nomeCadastro: string): Semelhanca {
  const a = tokensNome(nomeMeet);
  const b = tokensNome(nomeCadastro);
  if (!a.length || !b.length) return { cobertura: 0, primeiroNomeBate: false };
  const encontrados = a.filter((t) => b.some((m) => tokenBate(t, m))).length;
  return { cobertura: encontrados / a.length, primeiroNomeBate: tokenBate(a[0], b[0]) };
}

export function formatarMinutos(segundos: number): string {
  const min = Math.floor(segundos / 60);
  if (min < 1) return `${Math.round(segundos)} s`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (!h) return `${m} min`;
  return m ? `${h} h ${m} min` : `${h} h`;
}

/** Mínimo exigido em minutos inteiros (51,2 min → 52 min, já que o Meet conta minutos cheios). */
export function minutosMinimos(segundos: number): number {
  return Math.ceil(segundos / 60);
}

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

export function nomeMes(mes: string): string {
  const [ano, m] = mes.split('-').map(Number);
  return `${MESES[m - 1]} de ${ano}`;
}

export function capitalizar(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function dataBR(iso: string): string {
  const [a, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${a}`;
}
