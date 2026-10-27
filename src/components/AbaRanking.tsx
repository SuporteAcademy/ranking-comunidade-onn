import { useState } from 'react';
import { noPeriodo, type RankingMes } from '../lib/calculo';
import { baixarPlanilhaPlataforma, baixarRanking, textoCanal } from '../lib/exportacoes';
import { dataBR, normalizar, nomeMes } from '../lib/texto';
import { CRITERIOS_DESEMPATE, type LinhaRanking } from '../lib/types';
import { useDados } from '../state/dados';
import { PeriodoPlataforma } from './PeriodoPlataforma';
import { Aviso, Vazio, fmt } from './ui';

function Movimento({ l }: { l: LinhaRanking }) {
  if (l.posicaoPlataforma === null) return <span className="mov novo" title="Não tinha pontos na plataforma — entrou pelo ao vivo">novo</span>;
  const d = l.posicaoPlataforma - l.posicao;
  const titulo = `Era ${l.posicaoPlataforma}º só com os pontos da plataforma`;
  if (d > 0) return <span className="mov sobe" title={titulo}>▲ {d}</span>;
  if (d < 0) return <span className="mov desce" title={titulo}>▼ {-d}</span>;
  return <span className="mov igual" title={titulo}>=</span>;
}

export function AbaRanking({
  ranking,
  onIrPresencas,
  onIrAjustes,
}: {
  ranking: RankingMes;
  onIrPresencas: () => void;
  onIrAjustes: () => void;
}) {
  const { dados, atualizar } = useDados();
  const [busca, setBusca] = useState('');
  const [copiado, setCopiado] = useState(false);

  const { linhas, encontros, eventosContados, excluidos } = ranking;
  const pendencias = encontros.reduce((s, e) => s + e.pendenciasRelevantes, 0);
  const temEventosNoPeriodo = dados.eventos.some((e) => noPeriodo(e.data, ranking.periodo));
  const empatePremio = linhas.filter((l) => l.posicao <= 2 && l.empatado);
  const lideresPlataforma = linhas.filter((l) => l.posicaoPlataforma === 1);
  const filtradas = busca.trim()
    ? linhas.filter((l) => normalizar(`${l.nome} ${l.email}`).includes(normalizar(busca)))
    : linhas;

  const excluir = (email: string) =>
    atualizar((d) => ({ config: { ...d.config, emailsExcluidos: [...new Set([...d.config.emailsExcluidos, email])] } }));
  const reincluir = (email: string) =>
    atualizar((d) => ({ config: { ...d.config, emailsExcluidos: d.config.emailsExcluidos.filter((e) => e !== email) } }));

  const copiar = async () => {
    await navigator.clipboard.writeText(textoCanal(ranking));
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2000);
  };

  return (
    <div className="pilha">
      <div className="titulo-secao">
        <div>
          <h2>Ranking oficial · {nomeMes(ranking.mes)}</h2>
          <p>
            Pontos da plataforma de {dataBR(ranking.periodo.inicio)} a {dataBR(ranking.periodo.fim)} (
            {eventosContados.join(' + ') || 'nenhum evento marcado'}) + {dados.config.pontosAoVivo} por ao vivo com presença.
          </p>
          <p className="small">
            Desempate:{' '}
            {dados.config.desempate.length
              ? dados.config.desempate.map((c) => CRITERIOS_DESEMPATE[c].toLowerCase()).join(' → ')
              : 'nenhum critério'}{' '}
            ·{' '}
            <button className="btn link" onClick={onIrAjustes}>
              alterar
            </button>
          </p>
        </div>
        <div className="linha">
          <button className="btn" onClick={copiar} disabled={!linhas.length}>
            {copiado ? 'Copiado ✓' : 'Copiar texto para o canal'}
          </button>
          <button className="btn" onClick={() => baixarPlanilhaPlataforma(ranking, dados)} disabled={!linhas.length}>
            Planilha da plataforma + ao vivos
          </button>
          <button className="btn primario" onClick={() => baixarRanking(ranking, dados)} disabled={!linhas.length}>
            Baixar ranking (.xlsx)
          </button>
        </div>
      </div>

      {dados.eventos.length > 0 && (
        <div className="cartao">
          <PeriodoPlataforma mes={ranking.mes} />
        </div>
      )}

      {pendencias > 0 && (
        <Aviso>
          <p>
            Há <strong>{pendencias} participante(s)</strong> dos ao vivos com tempo suficiente que ainda não foram identificados —
            o ranking pode mudar.{' '}
            <button className="btn link" onClick={onIrPresencas}>
              Resolver pendências
            </button>
          </p>
        </Aviso>
      )}
      {!encontros.length && (
        <Aviso>
          <p>Nenhum encontro ao vivo importado para este mês — por enquanto o ranking é só o da plataforma (parcial).</p>
        </Aviso>
      )}
      {!temEventosNoPeriodo && dados.eventos.length > 0 && (
        <Aviso>
          <p>
            A planilha de pontos importada não tem nenhum lançamento entre {dataBR(ranking.periodo.inicio)} e{' '}
            {dataBR(ranking.periodo.fim)}. Confira o período ou importe o relatório atualizado da plataforma.
          </p>
        </Aviso>
      )}
      {empatePremio.length > 1 && (
        <Aviso tipo="ruim">
          <p>
            <strong>Empate na zona de premiação:</strong> {empatePremio.map((l) => `${l.nome} (${fmt(l.total)})`).join(', ')}.
            {dados.config.desempate.length
              ? ' Eles empatam também nos critérios de desempate — decida antes de divulgar ou acrescente outro critério em Ajustes.'
              : ' Escolha um critério de desempate em Ajustes antes de divulgar.'}
          </p>
        </Aviso>
      )}

      {linhas.length > 0 ? (
        <>
          <div className="resumo">
            <div className="metrica">
              <span>No ranking</span>
              <strong>{linhas.length}</strong>
            </div>
            <div className="metrica">
              <span>Encontros no mês</span>
              <strong>{encontros.length}</strong>
            </div>
            <div className="metrica">
              <span>Pontuaram em ao vivo</span>
              <strong>{linhas.filter((l) => l.aoVivos > 0).length}</strong>
            </div>
            <div className="metrica">
              <span>Líder só na plataforma</span>
              <strong style={{ fontSize: 16, paddingTop: 8 }}>
                {lideresPlataforma.length
                  ? `${lideresPlataforma.map((l) => l.nome.split(' ')[0]).join(', ')} → ${lideresPlataforma.map((l) => `${l.posicao}º`).join(', ')}`
                  : '—'}
              </strong>
            </div>
          </div>

          <div className="linha entre">
            <input
              className="entrada"
              type="search"
              placeholder="Buscar pessoa…"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              style={{ minWidth: 260 }}
              aria-label="Buscar no ranking"
            />
            <span className="muted small">▲▼ = posições ganhas ou perdidas em relação ao ranking só da plataforma</span>
          </div>

          <div className="tabela-wrap">
            <table>
              <thead>
                <tr>
                  <th className="centro">#</th>
                  <th>Membro</th>
                  {eventosContados.map((ev) => (
                    <th key={ev} className="dir">
                      {ev}
                    </th>
                  ))}
                  <th className="dir">Plataforma</th>
                  <th className="dir">Ao vivos</th>
                  <th className="dir">Total</th>
                  <th aria-label="Ações" />
                </tr>
              </thead>
              <tbody>
                {filtradas.map((l) => (
                  <tr key={l.email} className={l.posicao <= 2 ? 'premio' : ''}>
                    <td className="centro">
                      <div className="posicao num">
                        {l.posicao}º
                      </div>
                      <Movimento l={l} />
                    </td>
                    <td className="pessoa">
                      <strong>
                        {l.nome} {l.posicao <= 2 && <span className="selo destaque">{l.posicao === 1 ? '🥇 prêmio' : '🥈 prêmio'}</span>}
                      </strong>
                      <span>{l.email}</span>
                    </td>
                    {eventosContados.map((ev) => (
                      <td key={ev} className="dir num">
                        {l.porEvento[ev] ? (
                          <>
                            {fmt(l.porEvento[ev].pontos)} <span className="muted small">({l.porEvento[ev].qtd}×)</span>
                          </>
                        ) : (
                          <span className="muted">—</span>
                        )}
                      </td>
                    ))}
                    <td className="dir num">
                      {fmt(l.pontosPlataforma)}
                      {l.posicaoPlataforma && <div className="muted small">era {l.posicaoPlataforma}º</div>}
                    </td>
                    <td className="dir num">
                      {l.aoVivos ? (
                        <>
                          {fmt(l.pontosAoVivo)}
                          <div className="muted small">
                            {l.aoVivos} de {encontros.length}
                          </div>
                        </>
                      ) : (
                        <span className="muted">0</span>
                      )}
                    </td>
                    <td className="dir num">
                      <span className="total">{fmt(l.total)}</span>
                      {l.decididoPor && (
                        <div className="muted small" title="Critério que desempatou com quem tem o mesmo total">
                          desempate: {l.decididoPor}
                        </div>
                      )}
                      {l.empatado && <div className="selo ruim">empate</div>}
                    </td>
                    <td className="dir">
                      <button className="btn mini" title="Tirar do ranking (equipe, teste…)" onClick={() => excluir(l.email)}>
                        Tirar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <Vazio titulo="Ainda não há pontuação neste mês">
          Importe os pontos da plataforma e as listas de presença, ou escolha outro mês lá em cima.
        </Vazio>
      )}

      {excluidos.length > 0 && (
        <details className="cartao">
          <summary>Fora do ranking ({excluidos.length})</summary>
          <p className="muted small">Equipe, bots e pessoas tiradas manualmente. As regras ficam em Ajustes.</p>
          <ul className="lista-encontros">
            {excluidos.map((l) => (
              <li key={l.email}>
                <span>
                  <strong>{l.nome}</strong> <span className="muted small">{l.email} · {fmt(l.total)} pts</span>
                </span>
                {dados.config.emailsExcluidos.includes(l.email) ? (
                  <button className="btn mini" onClick={() => reincluir(l.email)}>
                    Voltar ao ranking
                  </button>
                ) : (
                  <span className="muted small">por regra</span>
                )}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
