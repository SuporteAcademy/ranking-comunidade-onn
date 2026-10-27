import type {
  Config,
  CriterioDesempate,
  Periodo,
  DadosApp,
  Encontro,
  EventoPontuacao,
  LinhaPresenca,
  LinhaRanking,
  Pessoa,
  PresencaPessoa,
  ResultadoEncontro,
} from './types';
import { STATUS_CONTA } from './types';
import { casaPadrao, montarDiretorio, vincularLinha } from './vinculo';

export function minimoSegundos(e: Pick<Encontro, 'duracaoMin' | 'percentualMinimo'>): number {
  return Math.ceil(e.duracaoMin * 60 * (e.percentualMinimo / 100));
}

/**
 * Tempo total de uma pessoa que aparece em mais de uma linha (entrou por outro
 * aparelho, como convidado, etc.): soma as durações, mas nunca passa do tempo
 * coberto pelas janelas entrada→saída — assim duas abas abertas ao mesmo tempo
 * não contam em dobro.
 */
export function tempoCombinado(linhas: LinhaPresenca[]): number {
  const soma = linhas.reduce((s, l) => s + l.duracaoSeg, 0);
  if (linhas.length < 2) return soma;
  const janelas = linhas
    .filter((l) => l.entradaMin !== null && l.saidaMin !== null && l.saidaMin >= l.entradaMin)
    .map((l) => [l.entradaMin!, l.saidaMin!] as [number, number])
    .sort((a, b) => a[0] - b[0]);
  if (janelas.length !== linhas.length) return soma;
  let coberto = 0;
  let [ini, fim] = janelas[0];
  for (const [a, b] of janelas.slice(1)) {
    if (a <= fim) fim = Math.max(fim, b);
    else {
      coberto += fim - ini + 1;
      [ini, fim] = [a, b];
    }
  }
  coberto += fim - ini + 1; // +1: os horários vêm sem segundos
  return Math.min(soma, coberto * 60);
}

export function calcularEncontro(
  encontro: Encontro,
  diretorio: Map<string, Pessoa>,
  dados: Pick<DadosApp, 'vinculos' | 'config'>,
): ResultadoEncontro {
  const minimoSeg = minimoSegundos(encontro);
  const linhas = encontro.linhas.map((l, i) =>
    vincularLinha(l, i, diretorio, dados.vinculos, dados.config.padroesExclusao),
  );

  const grupos = new Map<string, number[]>();
  for (const r of linhas) {
    if (!r.membro || !STATUS_CONTA.includes(r.status)) continue;
    grupos.set(r.membro.email, [...(grupos.get(r.membro.email) ?? []), r.indice]);
  }

  const pessoas: PresencaPessoa[] = [...grupos.entries()].map(([email, idx]) => {
    const p = diretorio.get(email);
    const segundos = tempoCombinado(idx.map((i) => encontro.linhas[i]));
    const inativo = !!p?.situacao && !/^ativ/i.test(p.situacao);
    return {
      email,
      nome: p?.nome ?? linhas[idx[0]].membro!.nome,
      segundos,
      linhas: idx,
      qualificado: segundos >= minimoSeg && !inativo,
      inativo,
    };
  });
  pessoas.sort((a, b) => b.segundos - a.segundos);

  // Pendência relevante: sem vínculo e com tempo suficiente para pontuar.
  const pendenciasRelevantes = linhas.filter(
    (r) => (r.status === 'sugestao' || r.status === 'sem_vinculo') && r.linha.duracaoSeg >= minimoSeg,
  ).length;

  return { encontro, minimoSeg, linhas, pessoas, pendenciasRelevantes };
}

export function mesDe(dataIso: string): string {
  return dataIso.slice(0, 7);
}

export function limitesDoMes(mes: string): Periodo {
  const [ano, m] = mes.split('-').map(Number);
  const ultimoDia = new Date(ano, m, 0).getDate();
  return { inicio: `${mes}-01`, fim: `${mes}-${String(ultimoDia).padStart(2, '0')}` };
}

/** Período da planilha de pontos que entra no cálculo do mês (padrão: o mês inteiro). */
export function periodoPlataforma(config: Config, mes: string): Periodo {
  return config.periodosPlataforma[mes] ?? limitesDoMes(mes);
}

export function noPeriodo(dataIso: string, p: Periodo): boolean {
  const dia = dataIso.slice(0, 10);
  return dia >= p.inicio && dia <= p.fim;
}

export function encontrosDoMes(encontros: Encontro[], mes: string): Encontro[] {
  return encontros.filter((e) => mesDe(e.data) === mes).sort((a, b) => a.data.localeCompare(b.data));
}

export function pontosDoEvento(e: EventoPontuacao, config: Config): number | null {
  const regra = config.regrasEventos[e.evento];
  if (!regra?.conta) return null;
  return regra.pontosFixos ?? e.pontos;
}

export function estaExcluido(config: Config, email: string, nome: string): boolean {
  return config.emailsExcluidos.includes(email) || !!casaPadrao(config.padroesExclusao, nome, email);
}

/**
 * Posição com empate (1, 2, 2, 4): quem fica igual pelo comparador divide a posição.
 * `comparar` devolve < 0 quando `a` fica na frente de `b`.
 */
function posicionar<T>(itens: T[], comparar: (a: T, b: T) => number): Map<T, { posicao: number; empatado: boolean }> {
  const ordenados = [...itens].sort(comparar);
  const out = new Map<T, { posicao: number; empatado: boolean }>();
  ordenados.forEach((item, i) => {
    const anterior = i > 0 ? ordenados[i - 1] : null;
    const posicao = anterior !== null && comparar(anterior, item) === 0 ? out.get(anterior)!.posicao : i + 1;
    const empatado = ordenados.some((o, j) => j !== i && comparar(o, item) === 0);
    out.set(item, { posicao, empatado });
  });
  return out;
}

type ParaDesempate = Pick<LinhaRanking, 'segundosAoVivo' | 'aoVivos' | 'membroDesde'>;

const COMPARAR_CRITERIO: Record<CriterioDesempate, (a: ParaDesempate, b: ParaDesempate) => number> = {
  tempoAoVivo: (a, b) => b.segundosAoVivo - a.segundosAoVivo,
  aoVivos: (a, b) => b.aoVivos - a.aoVivos,
  // cadastro mais antigo na frente; sem data vai para o fim
  antiguidade: (a, b) => {
    if (a.membroDesde === b.membroDesde) return 0;
    if (!a.membroDesde) return 1;
    if (!b.membroDesde) return -1;
    return a.membroDesde < b.membroDesde ? -1 : 1;
  },
};

function descreverCriterio(c: CriterioDesempate, l: ParaDesempate): string {
  if (c === 'tempoAoVivo') return `${Math.round(l.segundosAoVivo / 60)} min nos ao vivos`;
  if (c === 'aoVivos') return `${l.aoVivos} ao vivo(s) com presença`;
  return l.membroDesde ? `membro desde ${l.membroDesde.slice(8, 10)}/${l.membroDesde.slice(5, 7)}/${l.membroDesde.slice(0, 4)}` : 'sem data de cadastro';
}

export function compararDesempate(criterios: CriterioDesempate[], a: ParaDesempate, b: ParaDesempate): number {
  for (const c of criterios) {
    const r = COMPARAR_CRITERIO[c](a, b);
    if (r) return r;
  }
  return 0;
}

export interface RankingMes {
  mes: string;
  /** período lido da planilha de pontos */
  periodo: Periodo;
  linhas: LinhaRanking[];
  excluidos: LinhaRanking[];
  encontros: ResultadoEncontro[];
  eventosContados: string[];
}

export function calcularRanking(dados: DadosApp, mes: string): RankingMes {
  const { config } = dados;
  const diretorio = montarDiretorio(dados.membros, dados.eventos);
  const encontros = encontrosDoMes(dados.encontros, mes).map((e) => calcularEncontro(e, diretorio, dados));
  const periodo = periodoPlataforma(config, mes);
  const eventosContados = Object.entries(config.regrasEventos)
    .filter(([, r]) => r.conta)
    .map(([nome]) => nome);

  const membrosDesde = new Map(dados.membros.map((m) => [m.email, m.membroDesde]));
  const mapa = new Map<string, LinhaRanking>();
  const linha = (email: string, nome: string): LinhaRanking => {
    let l = mapa.get(email);
    if (!l) {
      l = {
        email,
        nome: diretorio.get(email)?.nome ?? nome,
        porEvento: {},
        pontosPlataforma: 0,
        aoVivos: 0,
        encontrosQualificados: [],
        pontosAoVivo: 0,
        total: 0,
        segundosAoVivo: 0,
        membroDesde: membrosDesde.get(email),
        posicao: 0,
        posicaoPlataforma: null,
        empatado: false,
        decididoPor: null,
        excluido: false,
      };
      mapa.set(email, l);
    }
    return l;
  };

  for (const e of dados.eventos) {
    if (!noPeriodo(e.data, periodo)) continue;
    const pts = pontosDoEvento(e, config);
    if (pts === null) continue;
    const l = linha(e.email, e.nome);
    const acc = (l.porEvento[e.evento] ??= { qtd: 0, pontos: 0 });
    acc.qtd += 1;
    acc.pontos += pts;
    l.pontosPlataforma += pts;
  }

  const tempoNoMes = new Map<string, number>();
  for (const r of encontros) {
    for (const p of r.pessoas) {
      tempoNoMes.set(p.email, (tempoNoMes.get(p.email) ?? 0) + p.segundos);
      if (!p.qualificado) continue;
      const l = linha(p.email, p.nome);
      l.aoVivos += 1;
      l.encontrosQualificados.push(r.encontro.id);
      l.pontosAoVivo += config.pontosAoVivo;
    }
  }

  const todas = [...mapa.values()];
  for (const l of todas) {
    l.total = l.pontosPlataforma + l.pontosAoVivo;
    l.segundosAoVivo = tempoNoMes.get(l.email) ?? 0;
    l.excluido = estaExcluido(config, l.email, l.nome);
  }
  const validas = todas.filter((l) => !l.excluido && l.total > 0);

  const comPlataforma = validas.filter((l) => l.pontosPlataforma > 0);
  const posPlat = posicionar(comPlataforma, (a, b) => b.pontosPlataforma - a.pontosPlataforma);
  for (const l of comPlataforma) l.posicaoPlataforma = posPlat.get(l)!.posicao;

  const comparar = (a: LinhaRanking, b: LinhaRanking) => b.total - a.total || compararDesempate(config.desempate, a, b);
  const pos = posicionar(validas, comparar);
  for (const l of validas) Object.assign(l, pos.get(l));

  const ordenar = (a: LinhaRanking, b: LinhaRanking) => comparar(a, b) || a.nome.localeCompare(b.nome, 'pt-BR');
  validas.sort(ordenar);

  // Para quem empatou no total: mostra os critérios que foi preciso usar contra o vizinho de cima e o de baixo
  // (ex.: mesmo tempo nos ao vivos que o próximo → decidiu o tempo de comunidade).
  validas.forEach((l, i) => {
    const vizinhos = [validas[i - 1], validas[i + 1]].filter((o) => o && o.total === l.total);
    const usados = vizinhos.map((o) => config.desempate.findIndex((c) => COMPARAR_CRITERIO[c](l, o) !== 0));
    const ate = Math.max(-1, ...usados);
    if (ate >= 0) l.decididoPor = config.desempate.slice(0, ate + 1).map((c) => descreverCriterio(c, l)).join(' · ');
  });

  return {
    mes,
    periodo,
    linhas: validas,
    excluidos: todas.filter((l) => l.excluido && l.total > 0).sort(ordenar),
    encontros,
    eventosContados,
  };
}

/** Meses que aparecem nos dados, do mais recente para o mais antigo. */
export function mesesDisponiveis(dados: DadosApp): string[] {
  const meses = new Set<string>();
  for (const e of dados.encontros) meses.add(mesDe(e.data));
  for (const e of dados.eventos) meses.add(mesDe(e.data));
  return [...meses].sort().reverse();
}

export function mesPadrao(dados: DadosApp): string {
  const encontros = dados.encontros.map((e) => mesDe(e.data)).sort();
  if (encontros.length) return encontros[encontros.length - 1];
  const meses = mesesDisponiveis(dados);
  if (meses.length) return meses[0];
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
