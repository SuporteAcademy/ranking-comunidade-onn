import { useEffect, useMemo, useState } from 'react';
import { AbaAjustes } from './components/AbaAjustes';
import { AbaImportar } from './components/AbaImportar';
import { AbaPresencas } from './components/AbaPresencas';
import { AbaRanking } from './components/AbaRanking';
import { DialogoEncontro } from './components/DialogoEncontro';
import { Aviso } from './components/ui';
import { calcularRanking, mesesDisponiveis, mesPadrao } from './lib/calculo';
import { capitalizar, nomeMes } from './lib/texto';
import type { Encontro } from './lib/types';
import { montarDiretorio } from './lib/vinculo';
import { useDados } from './state/dados';

type Aba = 'importar' | 'presencas' | 'ranking' | 'ajustes';

export function App() {
  const { dados, carregado, erroArmazenamento, atualizar } = useDados();
  const [aba, setAba] = useState<Aba | null>(null);
  const [mesEscolhido, setMes] = useState<string | null>(null);
  const [editando, setEditando] = useState<Encontro | null>(null);

  const mes = mesEscolhido ?? mesPadrao(dados);
  const meses = useMemo(() => {
    const lista = mesesDisponiveis(dados);
    return lista.includes(mes) ? lista : [mes, ...lista].sort().reverse();
  }, [dados, mes]);
  const diretorio = useMemo(() => montarDiretorio(dados.membros, dados.eventos), [dados.membros, dados.eventos]);
  const ranking = useMemo(() => calcularRanking(dados, mes), [dados, mes]);

  // Aba inicial: ranking se já há dados salvos; senão, importação.
  useEffect(() => {
    if (carregado && aba === null) setAba(dados.eventos.length && dados.encontros.length ? 'ranking' : 'importar');
  }, [carregado]);

  if (!carregado) return <p className="conteudo muted">Carregando…</p>;

  const abaAtual: Aba = aba ?? 'importar';
  const pendencias = ranking.encontros.reduce((s, e) => s + e.pendenciasRelevantes, 0);

  const abas: [Aba, string, number?][] = [
    ['importar', 'Importar'],
    ['presencas', 'Presenças', pendencias],
    ['ranking', 'Ranking'],
    ['ajustes', 'Ajustes'],
  ];

  return (
    <>
      <header className="topo">
        <div className="topo-inner">
          <div className="topo-linha">
            <div className="marca">
              <h1>Ranking Comunidade ONN</h1>
              <span>plataforma + encontros ao vivo</span>
            </div>
            <div className="seletor-mes">
              <label htmlFor="mes">Mês</label>
              <select id="mes" value={mes} onChange={(e) => setMes(e.target.value)}>
                {meses.map((m) => (
                  <option key={m} value={m}>
                    {capitalizar(nomeMes(m))}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <nav className="abas" role="tablist">
            {abas.map(([id, rotulo, contador]) => (
              <button key={id} role="tab" aria-selected={abaAtual === id} onClick={() => setAba(id)}>
                {rotulo}
                {!!contador && <span className="contador">{contador}</span>}
              </button>
            ))}
          </nav>
        </div>
      </header>

      <main className="conteudo">
        {erroArmazenamento && (
          <div style={{ marginBottom: 16 }}>
            <Aviso tipo="ruim">
              <p>{erroArmazenamento}</p>
            </Aviso>
          </div>
        )}
        {abaAtual === 'importar' && <AbaImportar mes={mes} onEditarEncontro={setEditando} />}
        {abaAtual === 'presencas' && <AbaPresencas ranking={ranking} diretorio={diretorio} onEditarEncontro={setEditando} />}
        {abaAtual === 'ranking' && (
          <AbaRanking ranking={ranking} onIrPresencas={() => setAba('presencas')} onIrAjustes={() => setAba('ajustes')} />
        )}
        {abaAtual === 'ajustes' && <AbaAjustes />}
      </main>

      {editando && (
        <DialogoEncontro
          rascunho={editando}
          existentes={dados.encontros}
          onCancelar={() => setEditando(null)}
          onSalvar={(r) => {
            atualizar((d) => ({
              encontros: d.encontros
                .map((e) => (e.id === editando.id ? { ...e, ...r, id: e.id } : e))
                .sort((a, b) => a.data.localeCompare(b.data)),
            }));
            setEditando(null);
          }}
        />
      )}
    </>
  );
}
