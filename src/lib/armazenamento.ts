import { clear, createStore, getMany, set } from 'idb-keyval';
import { CONFIG_PADRAO, type DadosApp } from './types';

// Os dados ficam no IndexedDB do navegador (sem servidor, sem custo).
// Para migrar para o Supabase, troque estas funções por chamadas às tabelas de
// supabase/migrations — o resto do app só conversa com carregar/salvar.

const loja = createStore('ranking-comunidade-onn', 'dados');

const CHAVES = ['membros', 'membrosImport', 'eventos', 'eventosImport', 'encontros', 'vinculos', 'config'] as const;

export const DADOS_VAZIOS: DadosApp = {
  membros: [],
  membrosImport: null,
  eventos: [],
  eventosImport: null,
  encontros: [],
  vinculos: {},
  config: CONFIG_PADRAO,
};

function completar(parcial: Partial<DadosApp>): DadosApp {
  return {
    ...DADOS_VAZIOS,
    ...Object.fromEntries(Object.entries(parcial).filter(([, v]) => v !== undefined)),
    config: { ...CONFIG_PADRAO, ...(parcial.config ?? {}) },
  };
}

export async function carregar(): Promise<DadosApp> {
  const valores = await getMany(CHAVES as unknown as string[], loja);
  return completar(Object.fromEntries(CHAVES.map((k, i) => [k, valores[i]])) as Partial<DadosApp>);
}

export async function salvar<K extends keyof DadosApp>(chave: K, valor: DadosApp[K]): Promise<void> {
  await set(chave, valor, loja);
}

export async function apagarTudo(): Promise<void> {
  await clear(loja);
}

const VERSAO_BACKUP = 1;

export function gerarBackup(dados: DadosApp): string {
  return JSON.stringify({ app: 'ranking-comunidade-onn', versao: VERSAO_BACKUP, geradoEm: new Date().toISOString(), dados });
}

export function lerBackup(texto: string): DadosApp {
  const obj = JSON.parse(texto);
  if (obj?.app !== 'ranking-comunidade-onn' || !obj.dados) throw new Error('Esse arquivo não é um backup deste sistema.');
  return completar(obj.dados);
}
