import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { apagarTudo, carregar, DADOS_VAZIOS, salvar } from '../lib/armazenamento';
import type { DadosApp } from '../lib/types';

interface Contexto {
  dados: DadosApp;
  carregado: boolean;
  erroArmazenamento: string | null;
  atualizar: (f: (atual: DadosApp) => Partial<DadosApp>) => void;
  substituirTudo: (novos: DadosApp) => void;
  limpar: () => Promise<void>;
}

const Ctx = createContext<Contexto | null>(null);

export function ProvedorDados({ children }: { children: ReactNode }) {
  const [dados, setDados] = useState<DadosApp>(DADOS_VAZIOS);
  const [carregado, setCarregado] = useState(false);
  const [erroArmazenamento, setErro] = useState<string | null>(null);
  const atual = useRef(dados);
  atual.current = dados;

  useEffect(() => {
    carregar()
      .then(setDados)
      .catch(() => setErro('Não foi possível ler os dados salvos neste navegador.'))
      .finally(() => setCarregado(true));
  }, []);

  const persistir = useCallback((parcial: Partial<DadosApp>) => {
    for (const [chave, valor] of Object.entries(parcial)) {
      salvar(chave as keyof DadosApp, valor as never).catch(() =>
        setErro('Não foi possível salvar neste navegador (modo anônimo ou sem espaço?). Baixe um backup para não perder o trabalho.'),
      );
    }
  }, []);

  const atualizar = useCallback(
    (f: (atual: DadosApp) => Partial<DadosApp>) => {
      const parcial = f(atual.current);
      const novo = { ...atual.current, ...parcial };
      atual.current = novo;
      setDados(novo);
      persistir(parcial);
    },
    [persistir],
  );

  const substituirTudo = useCallback(
    (novos: DadosApp) => {
      atual.current = novos;
      setDados(novos);
      persistir(novos);
    },
    [persistir],
  );

  const limpar = useCallback(async () => {
    await apagarTudo();
    atual.current = DADOS_VAZIOS;
    setDados(DADOS_VAZIOS);
  }, []);

  const valor = useMemo(
    () => ({ dados, carregado, erroArmazenamento, atualizar, substituirTudo, limpar }),
    [dados, carregado, erroArmazenamento, atualizar, substituirTudo, limpar],
  );
  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>;
}

export function useDados(): Contexto {
  const c = useContext(Ctx);
  if (!c) throw new Error('useDados fora do ProvedorDados');
  return c;
}
