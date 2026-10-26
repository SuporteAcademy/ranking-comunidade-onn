import type {
  Config,
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

/** Posição com empate (1, 2, 2, 4): quem tem a mesma pontuação divide a posição. */
function posicionar<T>(itens: T[], valor: (t: T) => number): Map<T, { posicao: number; empatado: boolean }> {
  const ordenados = [...itens].sort((a, b) => valor(b) - valor(a));
  const out = new Map<T, { posicao: number; empatado: boolean }>();
  ordenados.forEach((item, i) => {
    const v = valor(item);
    const anterior = i > 0 ? ordenados[i - 1] : null;
    const posicao = anterior !== null && valor(anterior) === v ? out.get(anterior)!.posicao : i + 1;
    const empatado = ordenados.some((o, j) => j !== i && valor(o) === v);
    out.set(item, { posicao, empatado });
  });
  return out;
}

export interface RankingMes {
  mes: string;
  linhas: LinhaRanking[];
  excluidos: LinhaRanking[];
  encontros: ResultadoEncontro[];
  eventosContados: string[];
}

export function calcularRanking(dados: DadosApp, mes: string): RankingMes {
  const { config } = dados;
  const diretorio = montarDiretorio(dados.membros, dados.eventos);
  const encontros = encontrosDoMes(dados.encontros, mes).map((e) => calcularEncontro(e, diretorio, dados));
  const eventosContados = Object.entries(config.regrasEventos)
    .filter(([, r]) => r.conta)
    .map(([nome]) => nome);

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
        posicao: 0,
        posicaoPlataforma: null,
        empatado: false,
        excluido: false,
      };
      mapa.set(email, l);
    }
    return l;
  };

  for (const e of dados.eventos) {
    if (mesDe(e.data) !== mes) continue;
    const pts = pontosDoEvento(e, config);
    if (pts === null) continue;
    const l = linha(e.email, e.nome);
    const acc = (l.porEvento[e.evento] ??= { qtd: 0, pontos: 0 });
    acc.qtd += 1;
    acc.pontos += pts;
    l.pontosPlataforma += pts;
  }

  for (const r of encontros) {
    for (const p of r.pessoas) {
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
    l.excluido = estaExcluido(config, l.email, l.nome);
  }
  const validas = todas.filter((l) => !l.excluido && l.total > 0);

  const comPlataforma = validas.filter((l) => l.pontosPlataforma > 0);
  const posPlat = posicionar(comPlataforma, (l) => l.pontosPlataforma);
  for (const l of comPlataforma) l.posicaoPlataforma = posPlat.get(l)!.posicao;

  const pos = posicionar(validas, (l) => l.total);
  for (const l of validas) Object.assign(l, pos.get(l));

  const ordenar = (a: LinhaRanking, b: LinhaRanking) =>
    b.total - a.total || b.pontosAoVivo - a.pontosAoVivo || a.nome.localeCompare(b.nome, 'pt-BR');

  return {
    mes,
    linhas: validas.sort(ordenar),
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
