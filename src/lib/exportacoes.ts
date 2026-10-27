import * as XLSX from 'xlsx';
import type { RankingMes } from './calculo';
import { noPeriodo, pontosDoEvento } from './calculo';
import { CRITERIOS_DESEMPATE, type DadosApp, type LinhaRanking } from './types';
import { dataBR, minutosMinimos, nomeMes } from './texto';
import { nomeCompleto } from './vinculo';

const ROTULO_STATUS: Record<string, string> = {
  email: 'E-mail igual',
  email_nome: 'E-mail mascarado + nome',
  nome: 'Nome completo',
  manual: 'Vínculo manual',
  sugestao: 'Precisa confirmar',
  sem_vinculo: 'Sem vínculo',
  ignorado: 'Ignorado',
};

export function rotuloStatus(s: string): string {
  return ROTULO_STATUS[s] ?? s;
}

function nomeAba(nome: string, usados: Set<string>): string {
  const base = nome.replace(/[\\/?*[\]:]/g, '-').slice(0, 31);
  let n = base;
  for (let i = 2; usados.has(n); i++) n = `${base.slice(0, 28)} ${i}`;
  usados.add(n);
  return n;
}

export function variacao(l: LinhaRanking): string {
  if (l.posicaoPlataforma === null) return 'entrou';
  const d = l.posicaoPlataforma - l.posicao;
  if (d > 0) return `subiu ${d}`;
  if (d < 0) return `caiu ${-d}`;
  return 'manteve';
}

function linhaPlanilha(l: LinhaRanking, r: RankingMes) {
  const out: Record<string, string | number> = {
    'Posição': l.excluido ? '-' : l.posicao,
    'Nome': l.nome,
    'E-mail': l.email,
  };
  for (const ev of r.eventosContados) {
    out[`${ev} (qtd)`] = l.porEvento[ev]?.qtd ?? 0;
    out[`${ev} (pts)`] = l.porEvento[ev]?.pontos ?? 0;
  }
  out['Pontos plataforma'] = l.pontosPlataforma;
  out['Posição só na plataforma'] = l.posicaoPlataforma ?? '-';
  out['Ao vivos com presença'] = l.aoVivos;
  out['Pontos ao vivo'] = l.pontosAoVivo;
  out['Total'] = l.total;
  out['Tempo nos ao vivos (min)'] = Math.round(l.segundosAoVivo / 60);
  out['Membro desde'] = l.membroDesde ? dataBR(l.membroDesde) : '';
  out['Desempate'] = l.decididoPor ?? '';
  out['Variação'] = l.excluido ? '' : variacao(l);
  out['Empate'] = l.empatado ? 'sim' : '';
  return out;
}

export function baixarRanking(r: RankingMes, dados: DadosApp): void {
  const wb = XLSX.utils.book_new();
  const usados = new Set<string>();
  const add = (nome: string, linhas: Record<string, unknown>[]) =>
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(linhas.length ? linhas : [{ '': 'Sem dados' }]), nomeAba(nome, usados));

  add('Ranking oficial', r.linhas.map((l) => linhaPlanilha(l, r)));

  const pessoas = new Map<string, { nome: string; email: string; por: Record<string, number> }>();
  for (const enc of r.encontros) {
    for (const p of enc.pessoas) {
      const reg = pessoas.get(p.email) ?? { nome: p.nome, email: p.email, por: {} };
      reg.por[enc.encontro.id] = p.segundos;
      pessoas.set(p.email, reg);
    }
  }
  add(
    'Presença no mês',
    [...pessoas.values()]
      .map((p) => {
        const out: Record<string, string | number> = { Nome: p.nome, 'E-mail': p.email };
        let qtd = 0;
        for (const enc of r.encontros) {
          const seg = p.por[enc.encontro.id];
          const ok = seg !== undefined && seg >= enc.minimoSeg;
          if (ok) qtd++;
          out[`${dataBR(enc.encontro.data)} (min)`] = seg === undefined ? '' : Math.round(seg / 60);
          out[`${dataBR(enc.encontro.data)} pontua?`] = seg === undefined ? '' : ok ? 'sim' : 'não';
        }
        out['Ao vivos com presença'] = qtd;
        out['Pontos ao vivo'] = qtd * dados.config.pontosAoVivo;
        return out;
      })
      .sort((a, b) => Number(b['Ao vivos com presença']) - Number(a['Ao vivos com presença'])),
  );

  for (const enc of r.encontros) {
    const porEmail = new Map(enc.pessoas.map((p) => [p.email, p]));
    add(
      `Encontro ${dataBR(enc.encontro.data).slice(0, 5).replace('/', '-')}`,
      enc.linhas.map((l) => {
        const p = l.membro ? porEmail.get(l.membro.email) : undefined;
        return {
          'Nome no Meet': nomeCompleto(l.linha),
          'E-mail no Meet': l.linha.email,
          'Tempo nesta entrada (min)': Math.round(l.linha.duracaoSeg / 60),
          'Vínculo': rotuloStatus(l.status),
          'Membro': l.membro?.nome ?? '',
          'E-mail do membro': l.membro?.email ?? '',
          'Tempo total da pessoa (min)': p ? Math.round(p.segundos / 60) : '',
          'Mínimo (min)': minutosMinimos(enc.minimoSeg),
          'Pontua': p?.qualificado ? 'sim' : 'não',
          'Observação': p?.inativo ? 'Membro inativo no cadastro' : l.motivo,
        };
      }),
    );
  }

  if (r.excluidos.length) add('Fora do ranking', r.excluidos.map((l) => linhaPlanilha(l, r)));

  add('Regras usadas', [
    { Regra: 'Mês', Valor: nomeMes(r.mes) },
    { Regra: 'Pontos da plataforma lidos de', Valor: `${dataBR(r.periodo.inicio)} a ${dataBR(r.periodo.fim)}` },
    { Regra: 'Pontos por ao vivo', Valor: dados.config.pontosAoVivo },
    ...r.encontros.map((e) => ({
      Regra: `Encontro ${dataBR(e.encontro.data)}`,
      Valor: `${e.encontro.duracaoMin} min, presença mínima ${e.encontro.percentualMinimo}% (${minutosMinimos(e.minimoSeg)} min)`,
    })),
    ...r.eventosContados.map((ev) => {
      const fixo = dados.config.regrasEventos[ev]?.pontosFixos;
      return { Regra: `Evento contado: ${ev}`, Valor: fixo === null || fixo === undefined ? 'valor da planilha' : `${fixo} pts fixos` };
    }),
    ...(dados.config.desempate.length
      ? dados.config.desempate.map((c, i) => ({ Regra: `Desempate ${i + 1}º`, Valor: CRITERIOS_DESEMPATE[c] }))
      : [{ Regra: 'Desempate', Valor: 'nenhum critério (empate divide a posição)' }]),
    { Regra: 'Gerado em', Valor: new Date().toLocaleString('pt-BR') },
  ]);

  XLSX.writeFile(wb, `ranking-oficial-${r.mes}.xlsx`);
}

/**
 * Mesmo formato do relatório de pontos da plataforma, com uma linha
 * "Encontro ao vivo" para cada presença válida — pronto para conferir ou subir.
 */
export function baixarPlanilhaPlataforma(r: RankingMes, dados: DadosApp): void {
  const linhas: Record<string, string | number>[] = [];
  for (const e of dados.eventos) {
    if (!noPeriodo(e.data, r.periodo)) continue;
    const pts = pontosDoEvento(e, dados.config);
    if (pts === null) continue;
    linhas.push({
      Nome: e.nome,
      CPF: e.cpf ?? '',
      Email: e.email,
      'Pontuação': pts,
      'Razão/Descrição': '',
      Evento: e.evento,
      Origem: e.origem ?? '-',
      'Data de Conquista': `${dataBR(e.data)} ${e.data.slice(11, 19)}`,
    });
  }
  const cpfs = new Map(dados.membros.map((m) => [m.email, m.cpf ?? '']));
  for (const enc of r.encontros) {
    for (const p of enc.pessoas) {
      if (!p.qualificado) continue;
      linhas.push({
        Nome: p.nome,
        CPF: cpfs.get(p.email) ?? '',
        Email: p.email,
        'Pontuação': dados.config.pontosAoVivo,
        'Razão/Descrição': `Presença de ${Math.round(p.segundos / 60)} min (mínimo ${minutosMinimos(enc.minimoSeg)} min)`,
        Evento: 'Encontro ao vivo',
        Origem: enc.encontro.titulo,
        'Data de Conquista': `${dataBR(enc.encontro.data)} 20:00:00`,
      });
    }
  }
  linhas.sort((a, b) => String(a.Email).localeCompare(String(b.Email)));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(linhas), 'Relatório');
  XLSX.writeFile(wb, `pontos-plataforma-com-ao-vivo-${r.mes}.xlsx`);
}

export function textoCanal(r: RankingMes, quantos = 10): string {
  const medalha = (p: number) => (p === 1 ? '🥇' : p === 2 ? '🥈' : p === 3 ? '🥉' : `${p}º`);
  const mes = nomeMes(r.mes);
  const linhas = r.linhas.slice(0, quantos).map((l) => `${medalha(l.posicao)} ${l.nome} — ${l.total.toLocaleString('pt-BR')} pts`);
  return [
    `🏆 Ranking oficial da Comunidade ONN — ${mes.charAt(0).toUpperCase()}${mes.slice(1)}`,
    '',
    ...linhas,
    '',
    'Pontuação final, já com a presença nos encontros ao vivo. Parabéns a todos que participaram! 🧡',
  ].join('\n');
}

export function baixarArquivo(conteudo: string, nome: string, tipo = 'application/json'): void {
  const url = URL.createObjectURL(new Blob([conteudo], { type: tipo }));
  const a = document.createElement('a');
  a.href = url;
  a.download = nome;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
