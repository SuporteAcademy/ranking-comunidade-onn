# Ranking Comunidade ONN

Calculadora do ranking mensal da gamificação: junta os pontos que a plataforma já contabiliza
(mensagem publicada, postagem respondida) com os **70 pontos por encontro ao vivo** de quem
ficou pelo menos **80%** do encontro.

Não tem servidor nem banco: roda no navegador, guarda tudo no próprio navegador (IndexedDB)
e exporta os resultados em Excel. As migrations do Supabase já estão prontas em
`supabase/migrations/` para quando valer a pena ter banco.

## Como rodar

```bash
npm install
npm run dev        # abre em http://localhost:5173
```

Outros comandos: `npm test` (testes) e `npm run build` (gera `dist/`).

**Publicação:** cada push na branch `main` publica o site no GitHub Pages automaticamente
(`.github/workflows/deploy.yml`). O site é só a calculadora — as planilhas que você importa
nunca saem do seu navegador.

**Dados reais ficam fora do git** (`.gitignore`): a pasta `exemplos-de-planilhas/`, qualquer
`.xlsx`/`.csv`, backups `.json` e arquivos `.env`. O teste que roda em cima das planilhas reais
(`src/lib/__tests__/exemplos.local.test.ts`) também fica só no seu computador.

## Fechamento do mês, passo a passo

1. **Importar → Membros da comunidade**: exportação de membros da plataforma.
2. **Importar → Pontos da plataforma**: relatório de pontuação. Pode ser o relatório completo; o
   sistema separa por mês e não duplica o que já foi importado.
3. **Importar → Presença nos ao vivos**: o relatório de participantes do Meet de cada encontro
   (dá para escolher vários arquivos de uma vez). Para cada um, informe a data — se o nome do arquivo
   tiver a data (`presenca 24-09-2026.xlsx`), ela já vem preenchida.
4. **Presenças**: resolva as pendências marcadas em laranja (pessoas que ficaram tempo suficiente,
   mas que o sistema não conseguiu identificar). A escolha fica salva para os próximos meses.
5. **Ranking**: confira e baixe.
   - **Baixar ranking (.xlsx)** — ranking oficial, presença do mês, detalhe de cada encontro e as regras usadas.
   - **Planilha da plataforma + ao vivos** — o relatório no mesmo formato da plataforma, com uma linha
     "Encontro ao vivo" (70 pts) para cada presença válida.
   - **Copiar texto para o canal** — o top 10 pronto para colar.
6. **Ajustes → Baixar backup** — guarde o backup do mês (os dados vivem só naquele navegador).

## Regras do cálculo

- **Pontos da plataforma**: só os eventos marcados em Ajustes contam (padrão: *Mensagem publicada* e
  *Postagem respondida*; *Login* e *Aula concluída* ficam de fora). Vale o valor da planilha, a menos
  que você fixe um valor — útil porque a plataforma já mudou a pontuação ao longo do tempo (a mensagem
  já valeu 5, 10 e 30).
- **Ao vivo**: tempo mínimo = duração do encontro × presença mínima (60 min × 80% = **48 min**). Cada
  encontro pode ter duração e percentual próprios.
- **Mais de uma entrada da mesma pessoa** (caiu e voltou, entrou pelo celular como convidada): os tempos
  são somados, sem contar em dobro quem ficou com duas abas abertas ao mesmo tempo.
- **Só membros pontuam**: quem não é ligado a alguém do cadastro (ou da planilha de pontos) não ganha os
  70 pontos. Membro com situação diferente de "Ativo" também não.
- **Fora do ranking**: contas da equipe e bots de gravação (regras em Ajustes; padrão: `coimbraacademy`,
  `coimbracademy`, `curseduca.com`, `notetaker`, `fireflies`…). Dá para tirar alguém pelo botão **Tirar**.
- **Empate**: quem tem os mesmos pontos divide a posição. Se houver empate entre 1º e 2º, o sistema avisa
  antes de você divulgar — o critério de desempate é decisão de vocês.
- **▲▼ no ranking**: quantas posições a pessoa ganhou ou perdeu em relação ao ranking só da plataforma.

## Como o sistema descobre quem é quem na lista do Meet

O Meet mascara os e-mails (`mara********@***.com`), mas deixa as 4 primeiras letras, o tamanho exato
do que vem antes do @ e o final do domínio. Ordem de tentativa:

| Status | Como foi identificado | Conta? |
|---|---|---|
| Vínculo manual | você escolheu em Presenças (fica salvo) | sim |
| E-mail igual | e-mail completo bate com o cadastro | sim |
| E-mail mascarado + nome | começo e tamanho do e-mail batem **e** o nome confere | sim |
| Nome completo | e-mail diferente do cadastro, mas o nome completo é de um único membro | sim |
| Precisa confirmar | mais de um membro possível, ou só o formato do e-mail bate | **não** |
| Sem vínculo | ninguém encontrado | **não** |
| Ignorado | equipe, bot ou ignorado manualmente | não |

Comparação de nomes: ignora acentos e maiúsculas, aceita abreviação ("Mari" → "Maria") e um erro de
digitação em nomes longos ("Guimarais" → "Guimarães"), mas não troca nomes parecidos ("Mariana" ≠ "Marina").

## Estrutura

```
exemplos-de-planilhas/   planilhas de exemplo (só local, fora do git)
src/lib/                 regras — sem React, testáveis
  planilhas.ts           leitura das planilhas (acha as colunas pelo nome)
  vinculo.ts             quem é quem na lista do Meet
  calculo.ts             presença por encontro e ranking do mês
  exportacoes.ts         arquivos Excel e texto do canal
  armazenamento.ts       IndexedDB + backup (trocar aqui pelo Supabase)
  types.ts               modelos (espelham as tabelas da migration)
src/components/          telas
supabase/migrations/     estrutura do banco para o futuro
```

## Quando for para o Supabase

A migration `supabase/migrations/20261026120000_gamificacao_inicial.sql` cria as tabelas
(`membros`, `eventos_pontuacao`, `encontros`, `encontro_participacoes`, `vinculos_participantes`,
`configuracoes`, `regras_eventos`, `exclusoes_ranking`, `fechamentos_mensais`, `fechamento_ranking`),
as views `presencas_qualificadas` e `ranking_mensal`, e RLS liberando só usuários autenticados.
Ela só cria objetos novos. O caminho é trocar `src/lib/armazenamento.ts` por chamadas a essas tabelas — o
resto do app não muda.
