import { useMemo, useState } from 'react';
import { gerarBackup, lerBackup } from '../lib/armazenamento';
import { baixarArquivo } from '../lib/exportacoes';
import type { Config, RegraEvento } from '../lib/types';
import { useDados } from '../state/dados';
import { Aviso, BotaoArquivo, fmt } from './ui';

export function AbaAjustes() {
  const { dados, atualizar, substituirTudo, limpar } = useDados();
  const { config } = dados;
  const [novoPadrao, setNovoPadrao] = useState('');
  const [msg, setMsg] = useState<{ tipo: 'ok' | 'ruim'; texto: string } | null>(null);

  const mudar = (parcial: Partial<Config>) => atualizar((d) => ({ config: { ...d.config, ...parcial } }));

  const eventos = useMemo(() => {
    const mapa = new Map<string, { qtd: number; valores: Set<number> }>();
    for (const e of dados.eventos) {
      const reg = mapa.get(e.evento) ?? { qtd: 0, valores: new Set() };
      reg.qtd++;
      reg.valores.add(e.pontos);
      mapa.set(e.evento, reg);
    }
    for (const nome of Object.keys(config.regrasEventos)) if (!mapa.has(nome)) mapa.set(nome, { qtd: 0, valores: new Set() });
    return [...mapa.entries()].sort((a, b) => b[1].qtd - a[1].qtd);
  }, [dados.eventos, config.regrasEventos]);

  const mudarRegra = (evento: string, parcial: Partial<RegraEvento>) => {
    const atual = config.regrasEventos[evento] ?? { conta: false, pontosFixos: null };
    mudar({ regrasEventos: { ...config.regrasEventos, [evento]: { ...atual, ...parcial } } });
  };

  const adicionarPadrao = () => {
    const p = novoPadrao.trim().toLowerCase();
    if (p && !config.padroesExclusao.includes(p)) mudar({ padroesExclusao: [...config.padroesExclusao, p] });
    setNovoPadrao('');
  };

  const vinculos = Object.values(dados.vinculos).sort((a, b) => b.criadoEm.localeCompare(a.criadoEm));

  const restaurar = async (arquivos: File[]) => {
    try {
      const novos = lerBackup(await arquivos[0].text());
      if (!confirm('Restaurar este backup? Os dados atuais deste navegador serão substituídos.')) return;
      substituirTudo(novos);
      setMsg({ tipo: 'ok', texto: 'Backup restaurado.' });
    } catch (err) {
      setMsg({ tipo: 'ruim', texto: err instanceof Error ? err.message : 'Não foi possível ler o backup.' });
    }
  };

  const apagar = async () => {
    if (!confirm('Apagar TODOS os dados deste navegador (planilhas, encontros, vínculos e ajustes)? Baixe um backup antes se quiser guardar.')) return;
    await limpar();
    setMsg({ tipo: 'ok', texto: 'Dados apagados.' });
  };

  return (
    <div className="pilha">
      <div className="titulo-secao">
        <div>
          <h2>Ajustes</h2>
          <p>Regras de pontuação, quem fica fora do ranking e backup dos dados.</p>
        </div>
      </div>

      <section className="cartao pilha">
        <h3>Ao vivo</h3>
        <div className="linha" style={{ gap: 16, alignItems: 'flex-end' }}>
          <label className="campo">
            Pontos por encontro
            <input type="number" min={0} value={config.pontosAoVivo} onChange={(e) => mudar({ pontosAoVivo: Number(e.target.value) })} />
          </label>
          <label className="campo">
            Presença mínima padrão (%)
            <input
              type="number"
              min={1}
              max={100}
              value={config.percentualMinimo}
              onChange={(e) => mudar({ percentualMinimo: Number(e.target.value) })}
            />
          </label>
          <label className="campo">
            Duração padrão (min)
            <input
              type="number"
              min={1}
              value={config.duracaoPadraoMin}
              onChange={(e) => mudar({ duracaoPadraoMin: Number(e.target.value) })}
            />
          </label>
        </div>
        <p className="muted small" style={{ margin: 0 }}>
          A presença mínima e a duração padrão valem para os próximos encontros importados. Para mudar um encontro que já
          está no sistema, use <em>Editar</em> nele.
        </p>
      </section>

      <section className="cartao pilha">
        <div>
          <h3>Eventos da plataforma</h3>
          <p className="muted small" style={{ margin: 0 }}>
            Marque o que entra no ranking. Deixe o valor em branco para usar os pontos que vieram na planilha, ou fixe um valor
            (útil se a plataforma mudou a pontuação no meio do caminho).
          </p>
        </div>
        <div className="tabela-wrap">
          <table>
            <thead>
              <tr>
                <th>Conta?</th>
                <th>Evento</th>
                <th className="dir">Lançamentos</th>
                <th>Valores na planilha</th>
                <th>Valor fixo</th>
              </tr>
            </thead>
            <tbody>
              {eventos.map(([nome, info]) => {
                const regra = config.regrasEventos[nome];
                return (
                  <tr key={nome}>
                    <td>
                      <input
                        type="checkbox"
                        checked={!!regra?.conta}
                        onChange={(e) => mudarRegra(nome, { conta: e.target.checked })}
                        aria-label={`Contar ${nome}`}
                      />
                    </td>
                    <td>{nome}</td>
                    <td className="dir num">{fmt(info.qtd)}</td>
                    <td className="num muted">{[...info.valores].sort((a, b) => a - b).join(', ') || '—'}</td>
                    <td>
                      <input
                        className="entrada"
                        style={{ width: 90 }}
                        type="number"
                        min={0}
                        placeholder="planilha"
                        value={regra?.pontosFixos ?? ''}
                        onChange={(e) => mudarRegra(nome, { pontosFixos: e.target.value === '' ? null : Number(e.target.value) })}
                        aria-label={`Valor fixo para ${nome}`}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="cartao pilha">
        <div>
          <h3>Fora do ranking</h3>
          <p className="muted small" style={{ margin: 0 }}>
            Quem tiver um destes trechos no nome ou no e-mail não entra no ranking e é ignorado nas listas de presença (contas
            da equipe, bots de gravação).
          </p>
        </div>
        <div className="chips-texto">
          {config.padroesExclusao.map((p) => (
            <span key={p}>
              {p}
              <button aria-label={`Remover ${p}`} onClick={() => mudar({ padroesExclusao: config.padroesExclusao.filter((x) => x !== p) })}>
                ×
              </button>
            </span>
          ))}
        </div>
        <form
          className="linha"
          onSubmit={(e) => {
            e.preventDefault();
            adicionarPadrao();
          }}
        >
          <input className="entrada" placeholder="ex.: @coimbraacademy" value={novoPadrao} onChange={(e) => setNovoPadrao(e.target.value)} />
          <button className="btn" type="submit">
            Adicionar
          </button>
        </form>
        {config.emailsExcluidos.length > 0 && (
          <>
            <div className="muted small">Pessoas tiradas manualmente:</div>
            <div className="chips-texto">
              {config.emailsExcluidos.map((e) => (
                <span key={e}>
                  {e}
                  <button aria-label={`Voltar ${e} ao ranking`} onClick={() => mudar({ emailsExcluidos: config.emailsExcluidos.filter((x) => x !== e) })}>
                    ×
                  </button>
                </span>
              ))}
            </div>
          </>
        )}
      </section>

      <section className="cartao pilha">
        <div>
          <h3>Vínculos salvos ({vinculos.length})</h3>
          <p className="muted small" style={{ margin: 0 }}>
            Decisões manuais de “quem é quem” na lista do Meet. São reaplicadas automaticamente em todo encontro.
          </p>
        </div>
        {vinculos.length ? (
          <ul className="lista-encontros">
            {vinculos.map((v) => (
              <li key={v.chave}>
                <span className="small">
                  <span className="muted">{v.chave.replace('|', ' · ') || '(sem nome)'}</span> →{' '}
                  <strong>{v.membroEmail ? `${v.rotulo} (${v.membroEmail})` : 'ignorado'}</strong>
                </span>
                <button
                  className="btn mini"
                  onClick={() =>
                    atualizar((d) => {
                      const novos = { ...d.vinculos };
                      delete novos[v.chave];
                      return { vinculos: novos };
                    })
                  }
                >
                  Desfazer
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <div className="status-import muted">Nenhum ainda.</div>
        )}
      </section>

      <section className="cartao pilha">
        <div>
          <h3>Backup</h3>
          <p className="muted small" style={{ margin: 0 }}>
            Os dados ficam só neste navegador. Baixe um backup no fechamento de cada mês — ele leva tudo (planilhas,
            encontros, vínculos e ajustes) e pode ser restaurado em qualquer computador.
          </p>
        </div>
        {msg && <Aviso tipo={msg.tipo}><p>{msg.texto}</p></Aviso>}
        <div className="linha">
          <button
            className="btn primario"
            onClick={() => baixarArquivo(gerarBackup(dados), `backup-ranking-onn-${new Date().toISOString().slice(0, 10)}.json`)}
          >
            Baixar backup
          </button>
          <BotaoArquivo aceita=".json" onArquivos={restaurar}>
            Restaurar backup
          </BotaoArquivo>
          <button className="btn perigo" onClick={apagar}>
            Apagar tudo
          </button>
        </div>
      </section>
    </div>
  );
}
