import { useMemo, useState } from 'react';
import type { RankingMes } from '../lib/calculo';
import { rotuloStatus } from '../lib/exportacoes';
import { dataBR, formatarMinutos, minutosMinimos, nomeMes } from '../lib/texto';
import { STATUS_CONTA, type Encontro, type Pessoa, type ResultadoEncontro, type ResultadoLinha } from '../lib/types';
import { nomeCompleto } from '../lib/vinculo';
import { useDados } from '../state/dados';
import { DialogoVinculo } from './DialogoVinculo';
import { Aviso, Vazio } from './ui';

type Filtro = 'todos' | 'pontuam' | 'pendentes' | 'nao';

const CLASSE_STATUS: Record<string, string> = {
  email: 'ok',
  email_nome: 'ok',
  manual: 'ok',
  nome: 'destaque',
  sugestao: 'alerta',
  sem_vinculo: 'alerta',
  ignorado: '',
};

function situacao(r: ResultadoLinha, enc: ResultadoEncontro) {
  const pessoa = r.membro ? enc.pessoas.find((p) => p.email === r.membro!.email) : undefined;
  const pendente = r.status === 'sugestao' || r.status === 'sem_vinculo';
  const relevante = pendente && r.linha.duracaoSeg >= enc.minimoSeg;
  return { pessoa, pendente, relevante, conta: STATUS_CONTA.includes(r.status) };
}

export function AbaPresencas({
  ranking,
  diretorio,
  onEditarEncontro,
}: {
  ranking: RankingMes;
  diretorio: Map<string, Pessoa>;
  onEditarEncontro: (e: Encontro) => void;
}) {
  const { dados } = useDados();
  const [selId, setSelId] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<Filtro>('todos');
  const [vinculando, setVinculando] = useState<ResultadoLinha | null>(null);

  const encontros = ranking.encontros;
  const sel = encontros.find((e) => e.encontro.id === selId) ?? encontros.find((e) => e.pendenciasRelevantes > 0) ?? encontros[0];

  const linhas = useMemo(() => {
    if (!sel) return [];
    return sel.linhas
      .map((r) => ({ r, s: situacao(r, sel) }))
      .filter(({ s }) => {
        if (filtro === 'pontuam') return s.pessoa?.qualificado;
        if (filtro === 'pendentes') return s.pendente;
        if (filtro === 'nao') return !s.pessoa?.qualificado && !s.pendente;
        return true;
      })
      .sort((a, b) => Number(b.s.relevante) - Number(a.s.relevante) || b.r.linha.duracaoSeg - a.r.linha.duracaoSeg);
  }, [sel, filtro]);

  if (!encontros.length) {
    return (
      <div className="pilha">
        <div className="titulo-secao">
          <div>
            <h2>Presença · {nomeMes(ranking.mes)}</h2>
          </div>
        </div>
        <Vazio titulo="Nenhum encontro ao vivo neste mês">
          Importe as listas de presença na aba Importar (ou troque o mês lá em cima).
        </Vazio>
      </div>
    );
  }

  const enc = sel!;
  const totalPendentes = enc.linhas.filter((r) => r.status === 'sugestao' || r.status === 'sem_vinculo').length;
  const minimoMin = minutosMinimos(enc.minimoSeg);

  // Resumo do mês: quem foi a quais encontros
  const pessoasMes = new Map<string, { nome: string; email: string; por: Map<string, { seg: number; ok: boolean }> }>();
  for (const e of encontros) {
    for (const p of e.pessoas) {
      const reg = pessoasMes.get(p.email) ?? { nome: p.nome, email: p.email, por: new Map() };
      reg.por.set(e.encontro.id, { seg: p.segundos, ok: p.qualificado });
      pessoasMes.set(p.email, reg);
    }
  }
  const resumoMes = [...pessoasMes.values()]
    .map((p) => ({ ...p, qtd: [...p.por.values()].filter((x) => x.ok).length }))
    .sort((a, b) => b.qtd - a.qtd || a.nome.localeCompare(b.nome, 'pt-BR'));

  return (
    <div className="pilha">
      <div className="titulo-secao">
        <div>
          <h2>Presença · {nomeMes(ranking.mes)}</h2>
          <p>
            Quem fica pelo menos {enc.encontro.percentualMinimo}% do encontro ganha {dados.config.pontosAoVivo} pontos. Confira
            as pendências antes de fechar o mês.
          </p>
        </div>
      </div>

      <div className="chips" role="group" aria-label="Encontros do mês">
        {encontros.map((e) => {
          const qtd = e.pessoas.filter((p) => p.qualificado).length;
          return (
            <button key={e.encontro.id} className="chip" aria-pressed={e === enc} onClick={() => setSelId(e.encontro.id)}>
              <span className="num">{dataBR(e.encontro.data).slice(0, 5)}</span>
              <span className="muted small">{qtd} pontuam</span>
              {e.pendenciasRelevantes > 0 && <span className="selo alerta">{e.pendenciasRelevantes} pendente(s)</span>}
            </button>
          );
        })}
      </div>

      <section className="cartao pilha">
        <div className="linha entre">
          <div>
            <h3>{enc.encontro.titulo}</h3>
            <div className="muted small">
              {dataBR(enc.encontro.data)} · duração {enc.encontro.duracaoMin} min · mínimo <strong>{minimoMin} min</strong> (
              {enc.encontro.percentualMinimo}%) · {enc.encontro.arquivo}
            </div>
          </div>
          <button className="btn" onClick={() => onEditarEncontro(enc.encontro)}>
            Editar data/duração
          </button>
        </div>

        <div className="resumo">
          <div className="metrica">
            <span>Linhas na lista</span>
            <strong>{enc.linhas.length}</strong>
          </div>
          <div className="metrica">
            <span>Membros identificados</span>
            <strong>{enc.pessoas.length}</strong>
          </div>
          <div className="metrica">
            <span>Ganham +{dados.config.pontosAoVivo}</span>
            <strong style={{ color: 'var(--ok)' }}>{enc.pessoas.filter((p) => p.qualificado).length}</strong>
          </div>
          <div className="metrica">
            <span>Pendências que podem pontuar</span>
            <strong style={{ color: enc.pendenciasRelevantes ? 'var(--warn)' : undefined }}>{enc.pendenciasRelevantes}</strong>
          </div>
        </div>

        {enc.pendenciasRelevantes > 0 && (
          <Aviso>
            <p>
              <strong>{enc.pendenciasRelevantes} participante(s)</strong> ficaram {minimoMin} min ou mais, mas o sistema não
              conseguiu dizer quem são. Clique em <em>Identificar</em> para ligar ao cadastro ou ignorar.
            </p>
          </Aviso>
        )}

        <div className="chips" role="group" aria-label="Filtro">
          {(
            [
              ['todos', `Todos (${enc.linhas.length})`],
              ['pontuam', `Pontuam (${enc.pessoas.filter((p) => p.qualificado).length} pessoas)`],
              ['pendentes', `Pendências (${totalPendentes})`],
              ['nao', 'Não pontuam'],
            ] as [Filtro, string][]
          ).map(([f, rotulo]) => (
            <button key={f} className="chip" aria-pressed={filtro === f} onClick={() => setFiltro(f)}>
              {rotulo}
            </button>
          ))}
        </div>

        <div className="tabela-wrap">
          <table>
            <thead>
              <tr>
                <th>Participante no Meet</th>
                <th>Tempo</th>
                <th>Membro</th>
                <th>Resultado</th>
                <th aria-label="Ações" />
              </tr>
            </thead>
            <tbody>
              {linhas.map(({ r, s }) => {
                const largura = Math.min(1, r.linha.duracaoSeg / (enc.encontro.duracaoMin * 60));
                return (
                  <tr key={r.indice}>
                    <td className="pessoa">
                      <strong>{nomeCompleto(r.linha) || '(sem nome)'}</strong>
                      <span>{r.linha.email || 'convidado sem e-mail'}</span>
                    </td>
                    <td className="num">
                      {formatarMinutos(r.linha.duracaoSeg)}
                      <div className="barra-tempo" aria-hidden>
                        <i className={r.linha.duracaoSeg >= enc.minimoSeg ? 'ok' : ''} style={{ width: `${largura * 100}%` }} />
                        <b style={{ left: `${enc.encontro.percentualMinimo}%` }} />
                      </div>
                    </td>
                    <td className="pessoa">
                      {r.membro ? (
                        <>
                          <strong>{r.membro.nome}</strong>
                          <span>{r.membro.email}</span>
                        </>
                      ) : (
                        <span>{r.sugestoes.length ? `${r.sugestoes.length} possível(is)` : '—'}</span>
                      )}
                      <div style={{ marginTop: 4 }} title={r.motivo}>
                        <span className={`selo ${CLASSE_STATUS[r.status]}`}>{rotuloStatus(r.status)}</span>
                      </div>
                    </td>
                    <td>
                      {s.pessoa?.qualificado ? (
                        <span className="selo ok">+{dados.config.pontosAoVivo} pts</span>
                      ) : s.pessoa?.inativo ? (
                        <span className="selo ruim">Membro inativo</span>
                      ) : s.relevante ? (
                        <span className="selo alerta">Pode valer {dados.config.pontosAoVivo}</span>
                      ) : r.status === 'ignorado' ? (
                        <span className="muted small">{r.motivo}</span>
                      ) : (
                        <span className="muted small">Abaixo de {minimoMin} min</span>
                      )}
                      {s.pessoa && s.pessoa.linhas.length > 1 && (
                        <div className="muted small">
                          {formatarMinutos(s.pessoa.segundos)} somando {s.pessoa.linhas.length} entradas
                        </div>
                      )}
                    </td>
                    <td className="dir">
                      <button className={`btn mini ${s.relevante ? 'primario' : ''}`} onClick={() => setVinculando(r)}>
                        {s.pendente ? 'Identificar' : 'Trocar'}
                      </button>
                    </td>
                  </tr>
                );
              })}
              {!linhas.length && (
                <tr>
                  <td colSpan={5} className="muted centro">
                    Nada neste filtro.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {resumoMes.length > 0 && (
        <section className="pilha">
          <div>
            <h3>Resumo do mês</h3>
            <p className="muted small" style={{ margin: 0 }}>
              ✓ = ganhou os pontos naquele encontro. O número é o tempo que a pessoa ficou (mesmo passando de 60 min, conta
              no desempate).
            </p>
          </div>
          <div className="tabela-wrap">
            <table className="matriz">
              <thead>
                <tr>
                  <th>Membro</th>
                  {encontros.map((e) => (
                    <th key={e.encontro.id} className="centro num">
                      {dataBR(e.encontro.data).slice(0, 5)}
                    </th>
                  ))}
                  <th className="dir">Ao vivos</th>
                  <th className="dir">Pontos</th>
                </tr>
              </thead>
              <tbody>
                {resumoMes.map((p) => (
                  <tr key={p.email}>
                    <td className="pessoa">
                      <strong>{p.nome}</strong>
                      <span>{p.email}</span>
                    </td>
                    {encontros.map((e) => {
                      const x = p.por.get(e.encontro.id);
                      return x?.ok ? (
                        <td key={e.encontro.id} className="marca-ok num" aria-label="presença válida">
                          ✓ {Math.round(x.seg / 60)}′
                        </td>
                      ) : (
                        <td key={e.encontro.id} className="marca-nao num">{x ? `${Math.round(x.seg / 60)}′` : '—'}</td>
                      );
                    })}
                    <td className="dir num">
                      {p.qtd}/{encontros.length}
                    </td>
                    <td className="dir num">
                      <strong>{p.qtd * dados.config.pontosAoVivo}</strong>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {vinculando && <DialogoVinculo resultado={vinculando} diretorio={diretorio} onFechar={() => setVinculando(null)} />}
    </div>
  );
}
