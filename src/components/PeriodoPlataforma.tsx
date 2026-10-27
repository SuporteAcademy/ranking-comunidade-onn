import { limitesDoMes, noPeriodo, periodoPlataforma, pontosDoEvento } from '../lib/calculo';
import { nomeMes } from '../lib/texto';
import type { Periodo } from '../lib/types';
import { useDados } from '../state/dados';
import { fmt } from './ui';

/** Escolhe de qual data até qual data a planilha de pontos entra no cálculo do mês. */
export function PeriodoPlataforma({ mes }: { mes: string }) {
  const { dados, atualizar } = useDados();
  const periodo = periodoPlataforma(dados.config, mes);
  const padrao = limitesDoMes(mes);
  const personalizado = periodo.inicio !== padrao.inicio || periodo.fim !== padrao.fim;
  const contam = dados.eventos.filter((e) => noPeriodo(e.data, periodo) && pontosDoEvento(e, dados.config) !== null).length;

  const salvar = (novo: Periodo) =>
    atualizar((d) => {
      const periodos = { ...d.config.periodosPlataforma };
      if (novo.inicio === padrao.inicio && novo.fim === padrao.fim) delete periodos[mes];
      else periodos[mes] = novo;
      return { config: { ...d.config, periodosPlataforma: periodos } };
    });

  // Se o início passar do fim (ou o contrário), a outra ponta acompanha.
  const mudarInicio = (inicio: string) => inicio && salvar({ inicio, fim: inicio > periodo.fim ? inicio : periodo.fim });
  const mudarFim = (fim: string) => fim && salvar({ inicio: fim < periodo.inicio ? fim : periodo.inicio, fim });

  return (
    <div className="periodo">
      <div className="muted small">Pontos da plataforma lidos no cálculo de {nomeMes(mes)}</div>
      <div className="linha">
        <input className="entrada" type="date" aria-label="Ler pontos a partir de" value={periodo.inicio} onChange={(e) => mudarInicio(e.target.value)} />
        <span className="muted">até</span>
        <input className="entrada" type="date" aria-label="Ler pontos até" value={periodo.fim} onChange={(e) => mudarFim(e.target.value)} />
        {personalizado ? (
          <button className="btn mini" onClick={() => salvar(padrao)}>
            Usar o mês inteiro
          </button>
        ) : (
          <span className="selo">mês inteiro</span>
        )}
      </div>
      <div className="muted small">
        {fmt(contam)} lançamento(s) contam nesse período{personalizado && ' · período personalizado, salvo para este mês'}
      </div>
    </div>
  );
}
