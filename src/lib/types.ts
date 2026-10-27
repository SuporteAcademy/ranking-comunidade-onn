// Modelos de dados do sistema. Cada tipo tem uma tabela correspondente em
// supabase/migrations — os nomes de campos foram mantidos próximos para facilitar
// a troca do armazenamento local pelo banco no futuro.

/** Membro da comunidade (planilha "membros geral"). Tabela: membros */
export interface Membro {
  email: string; // sempre minúsculo, é a chave
  nome: string;
  cpf?: string;
  codigo?: string;
  situacao?: string;
  subplataformas?: string;
  turmas?: string;
  ultimoAcesso?: string;
  /** data de cadastro na plataforma (ISO), usada no desempate por tempo de comunidade */
  membroDesde?: string;
}

/** Uma linha do relatório de pontos da plataforma. Tabela: eventos_pontuacao */
export interface EventoPontuacao {
  email: string;
  nome: string;
  cpf?: string;
  evento: string;
  pontos: number;
  origem?: string;
  /** ISO local, ex.: 2026-10-01T16:29:42 */
  data: string;
}

/** Uma linha da lista de presença exportada do Meet. Tabela: encontro_participacoes */
export interface LinhaPresenca {
  nome: string;
  sobrenome: string;
  /** Pode vir mascarado (mara********@***.com), completo ou vazio (convidado) */
  email: string;
  duracaoSeg: number;
  /** minutos desde 00:00; null quando a planilha não informa */
  entradaMin: number | null;
  saidaMin: number | null;
}

/** Um encontro ao vivo importado. Tabela: encontros */
export interface Encontro {
  id: string;
  /** YYYY-MM-DD */
  data: string;
  titulo: string;
  duracaoMin: number;
  percentualMinimo: number;
  arquivo: string;
  importadoEm: string;
  linhas: LinhaPresenca[];
}

/**
 * Decisão manual lembrada para um participante do Meet (nome + e-mail mascarado).
 * Tabela: vinculos_participantes
 */
export interface Vinculo {
  chave: string;
  /** e-mail do membro; null = ignorar este participante */
  membroEmail: string | null;
  rotulo: string;
  criadoEm: string;
}

export interface RegraEvento {
  conta: boolean;
  /** null = usa o valor que veio na planilha */
  pontosFixos: number | null;
}

/** Tabela: configuracoes / regras_eventos / exclusoes_ranking */
export interface Config {
  pontosAoVivo: number;
  percentualMinimo: number;
  duracaoPadraoMin: number;
  regrasEventos: Record<string, RegraEvento>;
  /** Trechos de nome ou e-mail que tiram a pessoa do ranking (equipe, bots) */
  padroesExclusao: string[];
  /** E-mails de membros tirados do ranking manualmente */
  emailsExcluidos: string[];
  /**
   * Período lido da planilha de pontos em cada mês (chave YYYY-MM).
   * Mês sem entrada = do dia 1 ao último dia do mês.
   */
  periodosPlataforma: Record<string, Periodo>;
  /** Critérios usados, em ordem, quando duas pessoas empatam no total */
  desempate: CriterioDesempate[];
}

export type CriterioDesempate = 'tempoAoVivo' | 'antiguidade' | 'aoVivos';

export const CRITERIOS_DESEMPATE: Record<CriterioDesempate, string> = {
  tempoAoVivo: 'Mais tempo assistindo aos ao vivos do mês',
  antiguidade: 'Mais tempo de comunidade (cadastro mais antigo)',
  aoVivos: 'Mais ao vivos com presença válida no mês',
};

/** Datas YYYY-MM-DD, as duas inclusivas */
export interface Periodo {
  inicio: string;
  fim: string;
}

export const CONFIG_PADRAO: Config = {
  pontosAoVivo: 70,
  percentualMinimo: 80,
  duracaoPadraoMin: 60,
  regrasEventos: {
    'Mensagem publicada': { conta: true, pontosFixos: null },
    'Postagem respondida': { conta: true, pontosFixos: null },
  },
  padroesExclusao: ['coimbraacademy', 'coimbracademy', 'curseduca.com', 'notetaker', 'fireflies', 'read.ai', 'otter.ai'],
  emailsExcluidos: [],
  periodosPlataforma: {},
  desempate: ['tempoAoVivo', 'antiguidade'],
};

export interface Importacao {
  arquivo: string;
  importadoEm: string;
}

export interface DadosApp {
  membros: Membro[];
  membrosImport: Importacao | null;
  eventos: EventoPontuacao[];
  eventosImport: Importacao | null;
  encontros: Encontro[];
  vinculos: Record<string, Vinculo>;
  config: Config;
}

/** Como uma linha de presença foi ligada a um membro */
export type StatusVinculo =
  | 'email' // e-mail completo bate exatamente
  | 'email_nome' // e-mail mascarado compatível + nome bate
  | 'nome' // só o nome completo bate (e-mail diferente do cadastro)
  | 'manual' // decisão salva pelo usuário
  | 'sugestao' // palpite fraco, precisa confirmar — não conta
  | 'sem_vinculo' // ninguém encontrado — não conta
  | 'ignorado'; // equipe, bot ou ignorado manualmente

export const STATUS_CONTA: StatusVinculo[] = ['email', 'email_nome', 'nome', 'manual'];

export interface Pessoa {
  email: string;
  nome: string;
  situacao?: string;
  noCadastro: boolean;
}

export interface ResultadoLinha {
  indice: number;
  linha: LinhaPresenca;
  chave: string;
  status: StatusVinculo;
  membro: Pessoa | null;
  sugestoes: Pessoa[];
  motivo: string;
}

export interface PresencaPessoa {
  email: string;
  nome: string;
  segundos: number;
  linhas: number[];
  qualificado: boolean;
  /** membro inativo no cadastro não pontua */
  inativo: boolean;
}

export interface ResultadoEncontro {
  encontro: Encontro;
  minimoSeg: number;
  linhas: ResultadoLinha[];
  pessoas: PresencaPessoa[];
  pendenciasRelevantes: number;
}

export interface LinhaRanking {
  email: string;
  nome: string;
  porEvento: Record<string, { qtd: number; pontos: number }>;
  pontosPlataforma: number;
  aoVivos: number;
  encontrosQualificados: string[];
  pontosAoVivo: number;
  total: number;
  /** tempo somado em todos os ao vivos do mês, mesmo nos que não pontuaram */
  segundosAoVivo: number;
  membroDesde?: string;
  posicao: number;
  posicaoPlataforma: number | null;
  /** empate total: mesmo total e mesmos valores em todos os critérios de desempate */
  empatado: boolean;
  /** quando o total empatou com alguém, qual critério decidiu (ex.: "312 min nos ao vivos") */
  decididoPor: string | null;
  excluido: boolean;
}
