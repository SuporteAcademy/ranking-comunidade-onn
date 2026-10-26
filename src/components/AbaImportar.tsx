import { useState } from 'react';
import { mesDe } from '../lib/calculo';
import {
  dataDoNomeArquivo,
  lerPlanilha,
  mesclarEventos,
  parseEventos,
  parseMembros,
  parsePresenca,
  ultimaQuinta,
} from '../lib/planilhas';
import { capitalizar, dataBR, nomeMes } from '../lib/texto';
import type { Encontro } from '../lib/types';
import { useDados } from '../state/dados';
import { DialogoEncontro, type Rascunho } from './DialogoEncontro';
import { Aviso, BotaoArquivo, fmt } from './ui';

const quando = (iso: string) => new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });

export function AbaImportar({ onEditarEncontro }: { onEditarEncontro: (e: Encontro) => void }) {
  const { dados, atualizar } = useDados();
  const [erros, setErros] = useState<Record<string, string | null>>({});
  const [fila, setFila] = useState<Rascunho[]>([]);

  const comErro = async (chave: string, f: () => Promise<void>) => {
    setErros((e) => ({ ...e, [chave]: null }));
    try {
      await f();
    } catch (err) {
      setErros((e) => ({ ...e, [chave]: err instanceof Error ? err.message : String(err) }));
    }
  };

  const importarMembros = (arquivos: File[]) =>
    comErro('membros', async () => {
      const membros = parseMembros(lerPlanilha(await arquivos[0].arrayBuffer()));
      if (!membros.length) throw new Error('A planilha não tem nenhum membro com e-mail.');
      atualizar(() => ({ membros, membrosImport: { arquivo: arquivos[0].name, importadoEm: new Date().toISOString() } }));
    });

  const importarEventos = (arquivos: File[]) =>
    comErro('eventos', async () => {
      let todos = dados.eventos;
      for (const a of arquivos) {
        const novos = parseEventos(lerPlanilha(await a.arrayBuffer()));
        if (!novos.length) throw new Error(`"${a.name}" não tem nenhuma linha de pontos.`);
        todos = mesclarEventos(todos, novos);
      }
      atualizar(() => ({
        eventos: todos,
        eventosImport: { arquivo: arquivos.map((a) => a.name).join(', '), importadoEm: new Date().toISOString() },
      }));
    });

  const importarPresencas = (arquivos: File[]) =>
    comErro('presenca', async () => {
      const ano = new Date().getFullYear();
      const novos: Rascunho[] = [];
      for (const a of arquivos) {
        const linhas = parsePresenca(lerPlanilha(await a.arrayBuffer()));
        if (!linhas.length) throw new Error(`"${a.name}" não tem participantes.`);
        novos.push({
          data: dataDoNomeArquivo(a.name, ano) ?? ultimaQuinta(),
          titulo: '',
          duracaoMin: dados.config.duracaoPadraoMin,
          percentualMinimo: dados.config.percentualMinimo,
          arquivo: a.name,
          linhas,
        });
      }
      setFila((f) => [...f, ...novos]);
    });

  const salvarEncontro = (r: Rascunho, substituirId?: string) => {
    const novo: Encontro = { ...r, id: crypto.randomUUID(), importadoEm: new Date().toISOString() };
    atualizar((d) => ({
      encontros: [...d.encontros.filter((e) => e.id !== substituirId), novo].sort((a, b) => a.data.localeCompare(b.data)),
    }));
    setFila((f) => f.slice(1));
  };

  const removerEncontro = (e: Encontro) => {
    if (!confirm(`Remover o encontro de ${dataBR(e.data)}? A lista de presença dele sai do cálculo.`)) return;
    atualizar((d) => ({ encontros: d.encontros.filter((x) => x.id !== e.id) }));
  };

  const limparEventos = () => {
    if (!confirm('Apagar todos os pontos da plataforma importados? Você vai precisar importar a planilha de novo.')) return;
    atualizar(() => ({ eventos: [], eventosImport: null }));
  };

  const datasEventos = dados.eventos.map((e) => e.data).sort();
  const porMes = new Map<string, Encontro[]>();
  for (const e of [...dados.encontros].sort((a, b) => b.data.localeCompare(a.data))) {
    porMes.set(mesDe(e.data), [...(porMes.get(mesDe(e.data)) ?? []), e]);
  }

  return (
    <div className="pilha">
      <div className="titulo-secao">
        <div>
          <h2>Importar planilhas</h2>
          <p>Tudo fica salvo neste navegador. Para usar em outro computador, baixe um backup em Ajustes.</p>
        </div>
      </div>

      <div className="grade-3">
        <section className="cartao passo">
          <div className="linha">
            <span className={`passo-num ${dados.membros.length ? 'feito' : ''}`}>{dados.membros.length ? '✓' : 1}</span>
            <h3>Membros da comunidade</h3>
          </div>
          <p className="muted small" style={{ margin: 0 }}>
            Exportação de membros da plataforma. Serve para saber quem é membro e descobrir quem é quem na lista do Meet
            (lá os e-mails vêm mascarados).
          </p>
          {dados.membrosImport ? (
            <div className="status-import">
              <strong>{fmt(dados.membros.length)} membros</strong>
              <div className="muted small">
                {dados.membrosImport.arquivo} · {quando(dados.membrosImport.importadoEm)}
              </div>
            </div>
          ) : (
            <div className="status-import muted">Nenhuma planilha importada</div>
          )}
          {erros.membros && <Aviso tipo="ruim"><p>{erros.membros}</p></Aviso>}
          <div className="linha">
            <BotaoArquivo primario={!dados.membros.length} onArquivos={importarMembros}>
              {dados.membros.length ? 'Substituir planilha' : 'Escolher planilha'}
            </BotaoArquivo>
          </div>
        </section>

        <section className="cartao passo">
          <div className="linha">
            <span className={`passo-num ${dados.eventos.length ? 'feito' : ''}`}>{dados.eventos.length ? '✓' : 2}</span>
            <h3>Pontos da plataforma</h3>
          </div>
          <p className="muted small" style={{ margin: 0 }}>
            Relatório de pontuação (mensagens, respostas…). Pode importar o relatório completo: o sistema separa por mês e
            não duplica o que já foi importado.
          </p>
          {dados.eventosImport ? (
            <div className="status-import">
              <strong>{fmt(dados.eventos.length)} lançamentos de pontos</strong>
              <div className="muted small">
                de {dataBR(datasEventos[0])} a {dataBR(datasEventos[datasEventos.length - 1])} ·{' '}
                {quando(dados.eventosImport.importadoEm)}
              </div>
            </div>
          ) : (
            <div className="status-import muted">Nenhuma planilha importada</div>
          )}
          {erros.eventos && <Aviso tipo="ruim"><p>{erros.eventos}</p></Aviso>}
          <div className="linha">
            <BotaoArquivo primario={!!dados.membros.length && !dados.eventos.length} multiplos onArquivos={importarEventos}>
              {dados.eventos.length ? 'Importar mais' : 'Escolher planilha'}
            </BotaoArquivo>
            {dados.eventos.length > 0 && (
              <button className="btn perigo" onClick={limparEventos}>
                Limpar
              </button>
            )}
          </div>
        </section>

        <section className="cartao passo">
          <div className="linha">
            <span className={`passo-num ${dados.encontros.length ? 'feito' : ''}`}>{dados.encontros.length ? '✓' : 3}</span>
            <h3>Presença nos ao vivos</h3>
          </div>
          <p className="muted small" style={{ margin: 0 }}>
            Uma planilha por encontro (relatório de participantes do Meet). Dá para escolher várias de uma vez — você
            informa a data de cada uma.
          </p>
          {porMes.size ? (
            [...porMes.entries()].map(([mes, lista]) => (
              <div key={mes}>
                <div className="muted small" style={{ marginBottom: 4 }}>
                  {capitalizar(nomeMes(mes))} · {lista.length} encontro(s)
                </div>
                <ul className="lista-encontros">
                  {lista.map((e) => (
                    <li key={e.id}>
                      <span>
                        <strong className="num">{dataBR(e.data)}</strong>{' '}
                        <span className="muted small">
                          {e.linhas.length} linhas · {e.duracaoMin} min · {e.percentualMinimo}%
                        </span>
                      </span>
                      <span className="linha" style={{ gap: 4 }}>
                        <button className="btn mini" onClick={() => onEditarEncontro(e)}>
                          Editar
                        </button>
                        <button className="btn mini perigo" onClick={() => removerEncontro(e)} aria-label={`Remover encontro de ${dataBR(e.data)}`}>
                          Remover
                        </button>
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))
          ) : (
            <div className="status-import muted">Nenhum encontro importado</div>
          )}
          {erros.presenca && <Aviso tipo="ruim"><p>{erros.presenca}</p></Aviso>}
          <div className="linha">
            <BotaoArquivo primario={!!dados.eventos.length && !dados.encontros.length} multiplos onArquivos={importarPresencas}>
              Adicionar lista de presença
            </BotaoArquivo>
          </div>
        </section>
      </div>

      {fila[0] && (
        <DialogoEncontro
          key={`${fila[0].arquivo}-${fila.length}`}
          rascunho={fila[0]}
          existentes={dados.encontros}
          restantes={fila.length - 1}
          onSalvar={salvarEncontro}
          onCancelar={() => setFila((f) => f.slice(1))}
        />
      )}
    </div>
  );
}
