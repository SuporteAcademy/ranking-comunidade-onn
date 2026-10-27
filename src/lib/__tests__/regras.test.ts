import { describe, expect, it } from 'vitest';
import { calcularRanking, limitesDoMes, tempoCombinado } from '../calculo';
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
    // empatam em 120; bia passou mais tempo nos ao vivos e fica na frente
    expect([bia.posicao, ana.posicao, ana.empatado, bia.empatado]).toEqual([1, 2, false, false]);
    expect(bia.decididoPor).toBe('55 min nos ao vivos');
    expect(r.linhas[0].email).toBe('bia@x.com');
    expect(r.linhas.find((l) => l.email === 'caio@x.com')).toBeUndefined(); // 47 min < 48
  });

  it('desempate: tempo nos ao vivos conta mesmo onde não pontuou; depois, tempo de comunidade', () => {
    const dados = base(
      [ev('ana@x.com', 'Mensagem publicada', 30), ev('bia@x.com', 'Mensagem publicada', 30), ev('caio@x.com', 'Mensagem publicada', 30)],
      [
        { email: 'ana@x.com', min: 30 }, // abaixo de 48: não ganha os 70, mas o tempo conta no desempate
        { email: 'bia@x.com', min: 10 },
      ],
    );
    dados.membros = [
      { email: 'ana@x.com', nome: 'ana', situacao: 'Ativo', membroDesde: '2025-01-10T00:00:00' },
      { email: 'bia@x.com', nome: 'bia', situacao: 'Ativo', membroDesde: '2024-03-01T00:00:00' },
      { email: 'caio@x.com', nome: 'caio', situacao: 'Ativo', membroDesde: '2023-05-01T00:00:00' },
    ];
    let r = calcularRanking(dados, '2026-10');
    expect(r.linhas.map((l) => l.email)).toEqual(['ana@x.com', 'bia@x.com', 'caio@x.com']);
    expect(r.linhas.map((l) => l.posicao)).toEqual([1, 2, 3]);

    // invertendo a ordem: tempo de comunidade primeiro
    dados.config = { ...CONFIG_PADRAO, desempate: ['antiguidade', 'tempoAoVivo'] };
    r = calcularRanking(dados, '2026-10');
    expect(r.linhas.map((l) => l.email)).toEqual(['caio@x.com', 'bia@x.com', 'ana@x.com']);
    expect(r.linhas[0].decididoPor).toBe('membro desde 01/05/2023');

    // sem critério: os três dividem o 1º lugar
    dados.config = { ...CONFIG_PADRAO, desempate: [] };
    r = calcularRanking(dados, '2026-10');
    expect(r.linhas.every((l) => l.posicao === 1 && l.empatado)).toBe(true);
  });

  it('desempate usa o tempo real, mesmo acima de 60 min', () => {
    const dados = base([], [
      { email: 'ana@x.com', min: 65 },
      { email: 'bia@x.com', min: 75 },
      { email: 'caio@x.com', min: 60 },
    ]);
    const r = calcularRanking(dados, '2026-10');
    expect(r.linhas.map((l) => [l.email, l.total, l.posicao])).toEqual([
      ['bia@x.com', 70, 1],
      ['ana@x.com', 70, 2],
      ['caio@x.com', 70, 3],
    ]);
    expect(r.linhas.map((l) => l.segundosAoVivo / 60)).toEqual([75, 65, 60]);
    expect(r.linhas.some((l) => l.empatado)).toBe(false);
  });

  it('valor fixo substitui o da planilha', () => {
    const dados = base([ev('ana@x.com', 'Mensagem publicada', 10)], []);
    dados.config = {
      ...CONFIG_PADRAO,
      regrasEventos: { ...CONFIG_PADRAO.regrasEventos, 'Mensagem publicada': { conta: true, pontosFixos: 30 } },
    };
    expect(calcularRanking(dados, '2026-10').linhas[0].total).toBe(30);
  });

  it('limites do mês', () => {
    expect(limitesDoMes('2026-02')).toEqual({ inicio: '2026-02-01', fim: '2026-02-28' });
    expect(limitesDoMes('2028-02').fim).toBe('2028-02-29');
    expect(limitesDoMes('2026-10').fim).toBe('2026-10-31');
  });

  it('período personalizado dos pontos da plataforma', () => {
    const eventos = [
      ev('ana@x.com', 'Mensagem publicada', 30, '2026-09-28T09:00:00'),
      ev('ana@x.com', 'Mensagem publicada', 30, '2026-10-01T00:00:00'),
      ev('ana@x.com', 'Mensagem publicada', 30, '2026-10-25T23:59:59'),
      ev('ana@x.com', 'Mensagem publicada', 30, '2026-10-26T08:00:00'),
    ];
    const dados = base(eventos, [{ email: 'bia@x.com', min: 60 }]);
    // padrão: mês inteiro → 3 lançamentos de outubro
    expect(calcularRanking(dados, '2026-10').linhas.find((l) => l.email === 'ana@x.com')!.pontosPlataforma).toBe(90);

    // 28/09 a 25/10: entra o de setembro, sai o de 26/10 (as duas pontas contam)
    dados.config = { ...CONFIG_PADRAO, periodosPlataforma: { '2026-10': { inicio: '2026-09-28', fim: '2026-10-25' } } };
    const r = calcularRanking(dados, '2026-10');
    expect(r.periodo).toEqual({ inicio: '2026-09-28', fim: '2026-10-25' });
    expect(r.linhas.find((l) => l.email === 'ana@x.com')!.pontosPlataforma).toBe(90);
    expect(r.linhas.find((l) => l.email === 'bia@x.com')!.pontosAoVivo).toBe(70); // ao vivo segue o mês

    // o período de outubro não mexe em setembro
    expect(calcularRanking(dados, '2026-09').periodo).toEqual({ inicio: '2026-09-01', fim: '2026-09-30' });
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
