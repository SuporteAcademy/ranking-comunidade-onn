import { describe, expect, it } from 'vitest';
import { calcularRanking, tempoCombinado } from '../calculo';
import { dataDoNomeArquivo, parseDataHora, parseDuracao, ultimaQuinta } from '../planilhas';
import { tokenBate } from '../texto';
import { CONFIG_PADRAO, type DadosApp, type EventoPontuacao, type LinhaPresenca } from '../types';
import { emailCompativel, lerMascara } from '../vinculo';

describe('leitura de campos', () => {
  it('converte as durações do Meet', () => {
    expect(parseDuracao('52 s')).toBe(52);
    expect(parseDuracao('52 min')).toBe(52 * 60);
    expect(parseDuracao('1 h')).toBe(3600);
    expect(parseDuracao('1 h 2 min')).toBe(3720);
    expect(parseDuracao('00:48:30')).toBe(48 * 60 + 30);
  });

  it('lê datas da plataforma', () => {
    expect(parseDataHora('01/10/2026 16:29:42')).toBe('2026-10-01T16:29:42');
    expect(parseDataHora('2026-09-24')).toBe('2026-09-24T00:00:00');
  });

  it('tira a data do nome do arquivo', () => {
    expect(dataDoNomeArquivo('presenca 24-09-2026.xlsx', 2026)).toBe('2026-09-24');
    expect(dataDoNomeArquivo('ao vivo 2026-10-01.csv', 2026)).toBe('2026-10-01');
    expect(dataDoNomeArquivo('live 03.09.xlsx', 2026)).toBe('2026-09-03');
    expect(dataDoNomeArquivo('Ex. presença dos ao vivos.xlsx', 2026)).toBeNull();
  });

  it('acha a última quinta-feira', () => {
    expect(ultimaQuinta(new Date(2026, 9, 26))).toBe('2026-10-22');
    expect(ultimaQuinta(new Date(2026, 9, 22))).toBe('2026-10-22');
  });
});

describe('identificação', () => {
  it('compara e-mail mascarado pelo começo e pelo tamanho', () => {
    const m = lerMascara('mara********@***.com')!;
    expect(emailCompativel(m, 'mara.silva01@exemplo.com')).toBe(true);
    expect(emailCompativel(m, 'mara.silva1@exemplo.com')).toBe(false);
    expect(emailCompativel(m, 'mara.silva01@exemplo.com.br')).toBe(false);
    expect(emailCompativel(lerMascara('pedr******@***.br')!, 'pedro.abcd@exemplo.com.br')).toBe(true);
  });

  it('aceita abreviação e erro de digitação, mas não troca nomes', () => {
    expect(tokenBate('mari', 'maria')).toBe(true);
    expect(tokenBate('guimarais', 'guimaraes')).toBe(true);
    expect(tokenBate('mariana', 'marina')).toBe(false);
    expect(tokenBate('mariana', 'maria')).toBe(false);
  });
});

const linha = (duracaoMin: number, entrada: number, saida: number): LinhaPresenca => ({
  nome: 'x',
  sobrenome: '',
  email: '',
  duracaoSeg: duracaoMin * 60,
  entradaMin: entrada,
  saidaMin: saida,
});

describe('tempo de quem entrou mais de uma vez', () => {
  it('soma entradas separadas', () => {
    expect(tempoCombinado([linha(3, 1174, 1177), linha(25, 1178, 1203)])).toBe(28 * 60);
  });
  it('não conta em dobro duas abas abertas ao mesmo tempo', () => {
    expect(tempoCombinado([linha(60, 1140, 1200), linha(60, 1140, 1200)])).toBe(61 * 60);
  });
});

describe('ranking', () => {
  const ev = (email: string, evento: string, pontos: number, data = '2026-10-05T10:00:00'): EventoPontuacao => ({
    email,
    nome: email.split('@')[0],
    evento,
    pontos,
    data,
  });

  const base = (eventos: EventoPontuacao[], presentes: { email: string; min: number }[]): DadosApp => ({
    membros: ['ana@x.com', 'bia@x.com', 'caio@x.com'].map((email) => ({ email, nome: email.split('@')[0], situacao: 'Ativo' })),
    membrosImport: null,
    eventos,
    eventosImport: null,
    encontros: [
      {
        id: 'e1',
        data: '2026-10-08',
        titulo: 'Live',
        duracaoMin: 60,
        percentualMinimo: 80,
        arquivo: 'x.xlsx',
        importadoEm: '',
        linhas: presentes.map((p) => ({
          nome: p.email.split('@')[0],
          sobrenome: '',
          email: p.email,
          duracaoSeg: p.min * 60,
          entradaMin: null,
          saidaMin: null,
        })),
      },
    ],
    vinculos: {},
    config: CONFIG_PADRAO,
  });

  it('o líder da plataforma cai quando não foi aos ao vivos', () => {
    const dados = base(
      [
        ...Array.from({ length: 4 }, () => ev('ana@x.com', 'Mensagem publicada', 30)),
        ev('bia@x.com', 'Mensagem publicada', 30),
        ev('bia@x.com', 'Postagem respondida', 20),
        ev('ana@x.com', 'Login', 3),
        ev('ana@x.com', 'Mensagem publicada', 30, '2026-09-30T23:59:00'),
      ],
      [
        { email: 'bia@x.com', min: 55 },
        { email: 'caio@x.com', min: 47 },
      ],
    );
    const r = calcularRanking(dados, '2026-10');
    const ana = r.linhas.find((l) => l.email === 'ana@x.com')!;
    const bia = r.linhas.find((l) => l.email === 'bia@x.com')!;
    expect(ana.total).toBe(120); // Login e setembro não contam
    expect(bia.total).toBe(50 + 70);
    expect(ana.posicaoPlataforma).toBe(1);
    expect(bia.posicaoPlataforma).toBe(2);
    // empatam em 1º; na tabela, quem tem mais ao vivo aparece primeiro
    expect([ana.posicao, bia.posicao, ana.empatado, bia.empatado]).toEqual([1, 1, true, true]);
    expect(r.linhas[0].email).toBe('bia@x.com');
    expect(r.linhas.find((l) => l.email === 'caio@x.com')).toBeUndefined(); // 47 min < 48
  });

  it('valor fixo substitui o da planilha', () => {
    const dados = base([ev('ana@x.com', 'Mensagem publicada', 10)], []);
    dados.config = {
      ...CONFIG_PADRAO,
      regrasEventos: { ...CONFIG_PADRAO.regrasEventos, 'Mensagem publicada': { conta: true, pontosFixos: 30 } },
    };
    expect(calcularRanking(dados, '2026-10').linhas[0].total).toBe(30);
  });

  it('posição na plataforma e virada no ranking final', () => {
    const dados = base(
      [ev('ana@x.com', 'Mensagem publicada', 30), ev('ana@x.com', 'Mensagem publicada', 30), ev('bia@x.com', 'Mensagem publicada', 30)],
      [{ email: 'bia@x.com', min: 60 }],
    );
    const r = calcularRanking(dados, '2026-10');
    const bia = r.linhas.find((l) => l.email === 'bia@x.com')!;
    const ana = r.linhas.find((l) => l.email === 'ana@x.com')!;
    expect(bia.posicaoPlataforma).toBe(2);
    expect(bia.posicao).toBe(1);
    expect(ana.posicaoPlataforma).toBe(1);
    expect(ana.posicao).toBe(2);
  });
});
