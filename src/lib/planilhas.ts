import * as XLSX from 'xlsx';
import type { EventoPontuacao, LinhaPresenca, Membro } from './types';
import { normalizar } from './texto';

export type Celula = string | number | boolean | Date | null | undefined;
export type Linhas = Celula[][];

/** Lê a primeira aba de um .xlsx/.xls/.csv como matriz de células. */
export function lerPlanilha(conteudo: ArrayBuffer): Linhas {
  const wb = XLSX.read(conteudo, { type: 'array', cellDates: true });
  const aba = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json<Celula[]>(aba, { header: 1, raw: true, defval: null, blankrows: false });
}

function texto(c: Celula): string {
  if (c === null || c === undefined) return '';
  if (c instanceof Date) return c.toISOString();
  return String(c).trim();
}

function vazio(c: Celula): boolean {
  const t = texto(c);
  return t === '' || t === '-' || normalizar(t) === 'dado nao disponivel';
}

function opcional(c: Celula): string | undefined {
  return vazio(c) ? undefined : texto(c);
}

type Mapa<K extends string> = Record<K, number>;

/**
 * Procura a linha de cabeçalho nas primeiras linhas (exportações às vezes trazem
 * título antes da tabela) e devolve o índice de cada coluna pedida.
 */
function mapearColunas<K extends string>(
  linhas: Linhas,
  colunas: Record<K, string[]>,
  obrigatorias: NoInfer<K>[],
  tipo: string,
): { mapa: Mapa<K>; inicio: number } {
  let melhor: { mapa: Mapa<K>; inicio: number; achadas: number } | null = null;
  for (let i = 0; i < Math.min(linhas.length, 15); i++) {
    const cab = (linhas[i] ?? []).map((c) => normalizar(texto(c)));
    const mapa = {} as Mapa<K>;
    const usadas = new Set<number>();
    for (const chave of Object.keys(colunas) as K[]) {
      const apelidos = colunas[chave];
      let idx = cab.findIndex((h, j) => !usadas.has(j) && apelidos.includes(h));
      if (idx < 0) idx = cab.findIndex((h, j) => !usadas.has(j) && h !== '' && apelidos.some((a) => h.startsWith(a)));
      mapa[chave] = idx;
      if (idx >= 0) usadas.add(idx);
    }
    const achadas = obrigatorias.filter((k) => mapa[k] >= 0).length;
    if (!melhor || achadas > melhor.achadas) melhor = { mapa, inicio: i + 1, achadas };
    if (achadas === obrigatorias.length) break;
  }
  if (!melhor || melhor.achadas < obrigatorias.length) {
    const faltando = obrigatorias.filter((k) => !melhor || melhor.mapa[k] < 0).map((k) => colunas[k][0]);
    throw new Error(
      `Essa não parece ser a planilha de ${tipo}. Não encontrei as colunas: ${faltando.join(', ')}.`,
    );
  }
  return { mapa: melhor.mapa, inicio: melhor.inicio };
}

// ---------- Membros ----------

export function parseMembros(linhas: Linhas): Membro[] {
  const { mapa, inicio } = mapearColunas(
    linhas,
    {
      nome: ['nome', 'nome completo'],
      email: ['email', 'e-mail'],
      cpf: ['cpf'],
      codigo: ['codigo do aluno', 'codigo'],
      situacao: ['situacao', 'status'],
      subplataformas: ['subplataformas'],
      turmas: ['turmas'],
      ultimoAcesso: ['ultimo acesso'],
    },
    ['nome', 'email'],
    'membros',
  );
  const porEmail = new Map<string, Membro>();
  for (const l of linhas.slice(inicio)) {
    const email = texto(l[mapa.email]).toLowerCase();
    if (!email.includes('@')) continue;
    const pegar = (k: keyof typeof mapa) => (mapa[k] >= 0 ? opcional(l[mapa[k]]) : undefined);
    porEmail.set(email, {
      email,
      nome: texto(l[mapa.nome]) || email,
      cpf: pegar('cpf'),
      codigo: pegar('codigo'),
      situacao: pegar('situacao'),
      subplataformas: pegar('subplataformas'),
      turmas: pegar('turmas'),
      ultimoAcesso: pegar('ultimoAcesso'),
    });
  }
  return [...porEmail.values()];
}

// ---------- Pontos da plataforma ----------

const pad = (n: number) => String(n).padStart(2, '0');

function isoLocal(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

/** Aceita "01/10/2026 16:29:42", "2026-10-01 16:29", Date ou número serial do Excel. */
export function parseDataHora(c: Celula): string | null {
  if (c instanceof Date) return isoLocal(c);
  if (typeof c === 'number') {
    const p = XLSX.SSF.parse_date_code(c);
    if (!p) return null;
    return `${p.y}-${pad(p.m)}-${pad(p.d)}T${pad(p.H)}:${pad(p.M)}:${pad(Math.floor(p.S))}`;
  }
  const t = texto(c);
  let m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[ T,]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (m) return `${m[3]}-${pad(+m[2])}-${pad(+m[1])}T${pad(+(m[4] ?? 0))}:${m[5] ?? '00'}:${m[6] ?? '00'}`;
  m = t.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}T${m[4] ?? '00'}:${m[5] ?? '00'}:${m[6] ?? '00'}`;
  return null;
}

export function parseEventos(linhas: Linhas): EventoPontuacao[] {
  const { mapa, inicio } = mapearColunas(
    linhas,
    {
      email: ['email', 'e-mail'],
      nome: ['nome'],
      cpf: ['cpf'],
      pontos: ['pontuacao', 'pontos'],
      evento: ['evento'],
      origem: ['origem'],
      data: ['data de conquista', 'data'],
    },
    ['email', 'pontos', 'evento', 'data'],
    'pontos da plataforma',
  );
  const eventos: EventoPontuacao[] = [];
  for (const l of linhas.slice(inicio)) {
    const email = texto(l[mapa.email]).toLowerCase();
    const data = parseDataHora(l[mapa.data]);
    const pontos = Number(String(l[mapa.pontos] ?? '').replace(',', '.'));
    if (!email.includes('@') || !data || !Number.isFinite(pontos)) continue;
    eventos.push({
      email,
      nome: texto(l[mapa.nome]) || email,
      cpf: mapa.cpf >= 0 ? opcional(l[mapa.cpf]) : undefined,
      evento: texto(l[mapa.evento]),
      pontos,
      origem: mapa.origem >= 0 ? opcional(l[mapa.origem]) : undefined,
      data,
    });
  }
  return eventos;
}

/** A origem entra na chave: duas aulas concluídas no mesmo segundo são lançamentos diferentes. */
export function chaveEvento(e: EventoPontuacao): string {
  return `${e.email}|${e.evento}|${e.data}|${e.pontos}|${e.origem ?? ''}`;
}

/** Junta duas importações sem duplicar eventos (o relatório costuma vir acumulado). */
export function mesclarEventos(atuais: EventoPontuacao[], novos: EventoPontuacao[]): EventoPontuacao[] {
  const mapa = new Map(atuais.map((e) => [chaveEvento(e), e]));
  for (const e of novos) mapa.set(chaveEvento(e), e);
  return [...mapa.values()].sort((a, b) => a.data.localeCompare(b.data));
}

// ---------- Presença (Google Meet) ----------

/** "1 h 2 min", "52 s", "1 h", "00:52:10", "52 min 3 s" → segundos */
export function parseDuracao(c: Celula): number {
  if (c instanceof Date) return c.getHours() * 3600 + c.getMinutes() * 60 + c.getSeconds();
  if (typeof c === 'number') return c < 1 ? Math.round(c * 86400) : Math.round(c * 60);
  const t = normalizar(texto(c));
  if (!t) return 0;
  const hms = t.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (hms) return +hms[1] * 3600 + +hms[2] * 60 + +(hms[3] ?? 0);
  let total = 0;
  for (const m of t.matchAll(/(\d+(?:[.,]\d+)?)\s*(horas?|hrs?|h|minutos?|mins?|m|segundos?|seg|secs?|s)\b/g)) {
    const v = Number(m[1].replace(',', '.'));
    const u = m[2];
    if (u.startsWith('h')) total += v * 3600;
    else if (u.startsWith('m')) total += v * 60;
    else total += v;
  }
  return Math.round(total);
}

/** "19:53" → minutos desde meia-noite */
export function parseHorario(c: Celula): number | null {
  if (c instanceof Date) return c.getHours() * 60 + c.getMinutes();
  if (typeof c === 'number' && c >= 0 && c < 1) return Math.round(c * 1440);
  const m = texto(c).match(/(\d{1,2}):(\d{2})/);
  return m ? +m[1] * 60 + +m[2] : null;
}

export function parsePresenca(linhas: Linhas): LinhaPresenca[] {
  const { mapa, inicio } = mapearColunas(
    linhas,
    {
      nome: ['nome', 'primeiro nome', 'first name', 'name', 'participante'],
      sobrenome: ['sobrenome', 'last name'],
      email: ['enviar e-mail', 'e-mail', 'email'],
      duracao: ['duracao', 'duration', 'tempo', 'tempo de participacao'],
      entrada: ['horario de entrada', 'hora de entrada', 'entrada', 'first seen', 'joined'],
      saida: ['horario de saida', 'hora de saida', 'saida', 'last seen', 'left'],
    },
    ['nome', 'duracao'],
    'presença do ao vivo',
  );
  const out: LinhaPresenca[] = [];
  for (const l of linhas.slice(inicio)) {
    const nome = texto(l[mapa.nome]);
    const sobrenome = mapa.sobrenome >= 0 ? texto(l[mapa.sobrenome]) : '';
    if (!nome && !sobrenome) continue;
    out.push({
      nome,
      sobrenome,
      email: mapa.email >= 0 ? texto(l[mapa.email]).toLowerCase() : '',
      duracaoSeg: parseDuracao(l[mapa.duracao]),
      entradaMin: mapa.entrada >= 0 ? parseHorario(l[mapa.entrada]) : null,
      saidaMin: mapa.saida >= 0 ? parseHorario(l[mapa.saida]) : null,
    });
  }
  return out;
}

/** Tenta tirar a data do nome do arquivo ("presenca 24-09-2026.xlsx"). */
export function dataDoNomeArquivo(nome: string, anoPadrao: number): string | null {
  let m = nome.match(/(20\d{2})[-_.](\d{1,2})[-_.](\d{1,2})/);
  if (m) return `${m[1]}-${pad(+m[2])}-${pad(+m[3])}`;
  m = nome.match(/(\d{1,2})[-_./](\d{1,2})[-_./](20\d{2}|\d{2})(?!\d)/);
  if (m) {
    const ano = m[3].length === 2 ? 2000 + +m[3] : +m[3];
    return `${ano}-${pad(+m[2])}-${pad(+m[1])}`;
  }
  m = nome.match(/(?:^|\D)(\d{1,2})[-_./](\d{1,2})(?!\d)/);
  if (m && +m[2] >= 1 && +m[2] <= 12 && +m[1] >= 1 && +m[1] <= 31) return `${anoPadrao}-${pad(+m[2])}-${pad(+m[1])}`;
  return null;
}

/** Quinta-feira mais recente (inclusive hoje), formato YYYY-MM-DD. */
export function ultimaQuinta(hoje = new Date()): string {
  const d = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
  d.setDate(d.getDate() - ((d.getDay() - 4 + 7) % 7));
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
