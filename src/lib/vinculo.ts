import type { EventoPontuacao, LinhaPresenca, Membro, Pessoa, ResultadoLinha, Vinculo } from './types';
import { normalizar, semelhancaNome } from './texto';

/**
 * Diretório de pessoas que podem receber pontos: o cadastro de membros mais quem
 * aparece no relatório de pontos (caso o cadastro esteja desatualizado).
 */
export function montarDiretorio(membros: Membro[], eventos: EventoPontuacao[]): Map<string, Pessoa> {
  const dir = new Map<string, Pessoa>();
  for (const m of membros) dir.set(m.email, { email: m.email, nome: m.nome, situacao: m.situacao, noCadastro: true });
  for (const e of eventos) {
    if (!dir.has(e.email)) dir.set(e.email, { email: e.email, nome: e.nome, noCadastro: false });
  }
  return dir;
}

export function nomeCompleto(l: LinhaPresenca): string {
  return `${l.nome} ${l.sobrenome}`.replace(/\s+/g, ' ').trim();
}

/** Identifica o participante do Meet para lembrar decisões entre encontros. */
export function chaveParticipante(l: LinhaPresenca): string {
  return `${normalizar(nomeCompleto(l))}|${l.email}`;
}

interface Mascara {
  prefixo: string;
  tamanhoLocal: number;
  sufixoDominio: string;
}

/** "mara********@***.com" → prefixo "mara", 12 caracteres antes do @, domínio terminando em ".com" */
export function lerMascara(email: string): Mascara | null {
  const m = email.match(/^([^*@]*)(\*+)@\**(.*)$/);
  if (!m) return null;
  return { prefixo: m[1], tamanhoLocal: m[1].length + m[2].length, sufixoDominio: m[3] };
}

export function emailCompativel(mascara: Mascara, email: string): boolean {
  const at = email.indexOf('@');
  if (at < 0) return false;
  const local = email.slice(0, at);
  const dominio = email.slice(at + 1);
  return local.length === mascara.tamanhoLocal && local.startsWith(mascara.prefixo) && dominio.endsWith(mascara.sufixoDominio);
}

export function casaPadrao(padroes: string[], ...campos: string[]): string | null {
  const alvo = campos.map((c) => normalizar(c)).join(' ');
  return padroes.find((p) => p.trim() && alvo.includes(normalizar(p))) ?? null;
}

/**
 * Liga uma linha da lista de presença a uma pessoa do diretório.
 * Ordem: decisão salva → regra de exclusão → e-mail exato → e-mail mascarado + nome
 * → nome completo → sugestão fraca (não conta até alguém confirmar).
 */
export function vincularLinha(
  linha: LinhaPresenca,
  indice: number,
  diretorio: Map<string, Pessoa>,
  vinculos: Record<string, Vinculo>,
  padroesExclusao: string[],
): ResultadoLinha {
  const chave = chaveParticipante(linha);
  const nome = nomeCompleto(linha);
  const base = { indice, linha, chave, sugestoes: [] as Pessoa[] };

  const salvo = vinculos[chave];
  if (salvo) {
    if (salvo.membroEmail === null) return { ...base, status: 'ignorado', membro: null, motivo: 'Ignorado manualmente' };
    const p = diretorio.get(salvo.membroEmail) ?? { email: salvo.membroEmail, nome: salvo.rotulo, noCadastro: false };
    return { ...base, status: 'manual', membro: p, motivo: 'Vínculo salvo manualmente' };
  }

  const padrao = casaPadrao(padroesExclusao, nome, linha.email);
  if (padrao) return { ...base, status: 'ignorado', membro: null, motivo: `Equipe/bot (regra "${padrao}")` };

  const achou = (status: 'email' | 'email_nome' | 'nome', membro: Pessoa, motivo: string): ResultadoLinha => {
    const regra = casaPadrao(padroesExclusao, membro.nome, membro.email);
    if (regra) return { ...base, status: 'ignorado', membro: null, motivo: `Conta da equipe: ${membro.email}` };
    return { ...base, status, membro, motivo };
  };

  if (linha.email && !linha.email.includes('*')) {
    const p = diretorio.get(linha.email);
    if (p) return achou('email', p, 'E-mail igual ao do cadastro');
  }

  const pessoas = [...diretorio.values()];
  const mascara = linha.email ? lerMascara(linha.email) : null;

  if (mascara) {
    const candidatos = pessoas
      .filter((p) => emailCompativel(mascara, p.email))
      .map((p) => ({ p, s: semelhancaNome(nome, p.nome) }))
      .filter(({ s }) => s.primeiroNomeBate || s.cobertura >= 0.5)
      .sort((a, b) => b.s.cobertura - a.s.cobertura);
    if (candidatos.length === 1 || (candidatos.length > 1 && candidatos[0].s.cobertura > candidatos[1].s.cobertura)) {
      return achou('email_nome', candidatos[0].p, 'E-mail mascarado e nome conferem');
    }
    if (candidatos.length > 1) {
      return { ...base, status: 'sugestao', membro: null, sugestoes: candidatos.map((c) => c.p), motivo: 'Mais de um membro possível' };
    }
  }

  // Nome completo: todos os pedaços do nome digitado no Meet aparecem no cadastro.
  const porNome = tokensSuficientes(nome)
    ? pessoas.filter((p) => {
        const s = semelhancaNome(nome, p.nome);
        return s.cobertura === 1 && s.primeiroNomeBate;
      })
    : [];
  if (porNome.length === 1) {
    return achou('nome', porNome[0], 'Nome completo confere (e-mail diferente do cadastro)');
  }
  if (porNome.length > 1) {
    return { ...base, status: 'sugestao', membro: null, sugestoes: porNome.slice(0, 8), motivo: 'Nome igual ao de mais de um membro' };
  }

  // Palpite: só o e-mail mascarado bate, ou só o primeiro nome.
  const palpites = mascara ? pessoas.filter((p) => emailCompativel(mascara, p.email)).slice(0, 8) : [];
  if (palpites.length) {
    return { ...base, status: 'sugestao', membro: null, sugestoes: palpites, motivo: 'Só o formato do e-mail bate — confira o nome' };
  }
  return { ...base, status: 'sem_vinculo', membro: null, motivo: linha.email ? 'Nenhum membro com esse nome ou e-mail' : 'Convidado sem e-mail — nome não encontrado' };
}

function tokensSuficientes(nome: string): boolean {
  return normalizar(nome).split(' ').filter((t) => t.length > 1).length >= 2;
}

/** Busca para o seletor manual. */
export function buscarPessoas(diretorio: Map<string, Pessoa>, termo: string, limite = 30): Pessoa[] {
  const t = normalizar(termo);
  if (!t) return [];
  const pedacos = t.split(' ');
  return [...diretorio.values()]
    .filter((p) => {
      const alvo = normalizar(`${p.nome} ${p.email}`);
      return pedacos.every((x) => alvo.includes(x));
    })
    .slice(0, limite);
}
