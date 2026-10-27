-- Ranking Comunidade ONN — estrutura para quando os dados saírem do navegador.
-- Hoje o app guarda tudo no IndexedDB (src/lib/armazenamento.ts). Cada tabela
-- abaixo corresponde a um tipo em src/lib/types.ts.
--
-- Esta migration só cria objetos novos; não altera nem apaga nada existente.

-- ---------------------------------------------------------------------------
-- Membros (planilha "membros geral" da plataforma)          → tipo Membro
-- ---------------------------------------------------------------------------
create table if not exists public.membros (
  email           text primary key check (email = lower(email)),
  nome            text not null,
  cpf             text,
  codigo          text,
  situacao        text,
  subplataformas  text,
  turmas          text,
  ultimo_acesso   text,
  membro_desde    timestamp,            -- "Data de criação" da exportação; desempate por tempo de comunidade
  importado_em    timestamptz not null default now()
);

create index if not exists membros_nome_idx on public.membros (lower(nome));

-- ---------------------------------------------------------------------------
-- Lançamentos de pontos da plataforma (relatório de pontuação) → EventoPontuacao
-- A chave única evita duplicar quando o mesmo relatório é importado de novo.
-- ---------------------------------------------------------------------------
create table if not exists public.eventos_pontuacao (
  id              bigint generated always as identity primary key,
  email           text not null check (email = lower(email)),
  nome            text not null,
  cpf             text,
  evento          text not null,
  pontos          integer not null,
  origem          text not null default '-',
  conquistado_em  timestamp not null,
  importado_em    timestamptz not null default now(),
  -- a origem entra: duas aulas concluídas no mesmo segundo são lançamentos diferentes
  unique (email, evento, conquistado_em, pontos, origem)
);

create index if not exists eventos_pontuacao_mes_idx on public.eventos_pontuacao (date_trunc('month', conquistado_em));
create index if not exists eventos_pontuacao_email_idx on public.eventos_pontuacao (email);

-- ---------------------------------------------------------------------------
-- Encontros ao vivo                                          → Encontro
-- ---------------------------------------------------------------------------
create table if not exists public.encontros (
  id                 uuid primary key default gen_random_uuid(),
  data               date not null,
  titulo             text not null,
  duracao_min        integer not null default 60 check (duracao_min > 0),
  percentual_minimo  numeric(5,2) not null default 80 check (percentual_minimo > 0 and percentual_minimo <= 100),
  arquivo            text,
  importado_em       timestamptz not null default now()
);

create index if not exists encontros_data_idx on public.encontros (data);

-- ---------------------------------------------------------------------------
-- Linhas da lista de presença do Meet                       → LinhaPresenca
-- membro_email/status_vinculo guardam o resultado da identificação no momento
-- do fechamento (o app recalcula na hora; aqui fica registrado).
-- ---------------------------------------------------------------------------
create table if not exists public.encontro_participacoes (
  id              bigint generated always as identity primary key,
  encontro_id     uuid not null references public.encontros (id) on delete cascade,
  linha           integer not null,
  nome            text not null default '',
  sobrenome       text not null default '',
  email_meet      text not null default '',
  duracao_seg     integer not null default 0 check (duracao_seg >= 0),
  entrada_min     integer,
  saida_min       integer,
  membro_email    text,
  status_vinculo  text check (status_vinculo in ('email', 'email_nome', 'nome', 'manual', 'sugestao', 'sem_vinculo', 'ignorado')),
  unique (encontro_id, linha)
);

create index if not exists encontro_participacoes_membro_idx on public.encontro_participacoes (membro_email);

-- ---------------------------------------------------------------------------
-- Decisões manuais de "quem é quem" (nome + e-mail mascarado do Meet) → Vinculo
-- membro_email nulo = participante ignorado.
-- ---------------------------------------------------------------------------
create table if not exists public.vinculos_participantes (
  chave         text primary key,
  membro_email  text,
  rotulo        text not null,
  criado_em     timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Regras                                                      → Config
-- ---------------------------------------------------------------------------
create table if not exists public.configuracoes (
  id                  boolean primary key default true check (id), -- linha única
  pontos_ao_vivo      integer not null default 70,
  percentual_minimo   numeric(5,2) not null default 80,
  duracao_padrao_min  integer not null default 60,
  -- ordem dos critérios de desempate (no app: tempoAoVivo, antiguidade, aoVivos)
  criterios_desempate text[] not null default array['tempo_ao_vivo', 'antiguidade']::text[]
    check (criterios_desempate <@ array['tempo_ao_vivo', 'antiguidade', 'ao_vivos']::text[]),
  atualizado_em       timestamptz not null default now()
);

insert into public.configuracoes (id) values (true) on conflict (id) do nothing;

create table if not exists public.regras_eventos (
  evento        text primary key,
  conta         boolean not null default false,
  pontos_fixos  integer -- nulo = usa o valor que veio no relatório
);

insert into public.regras_eventos (evento, conta) values
  ('Mensagem publicada', true),
  ('Postagem respondida', true)
on conflict (evento) do nothing;

-- Período da planilha de pontos lido em cada mês. Mês sem linha = mês inteiro.
create table if not exists public.periodos_plataforma (
  mes     date primary key check (extract(day from mes) = 1), -- primeiro dia do mês
  inicio  date not null,
  fim     date not null,
  check (inicio <= fim)
);

create table if not exists public.exclusoes_ranking (
  id         bigint generated always as identity primary key,
  tipo       text not null check (tipo in ('padrao', 'email')),
  valor      text not null,
  motivo     text,
  criado_em  timestamptz not null default now(),
  unique (tipo, valor)
);

insert into public.exclusoes_ranking (tipo, valor, motivo) values
  ('padrao', 'coimbraacademy', 'contas da equipe'),
  ('padrao', 'coimbracademy', 'contas da equipe'),
  ('padrao', 'curseduca.com', 'suporte da plataforma'),
  ('padrao', 'notetaker', 'bot de gravação'),
  ('padrao', 'fireflies', 'bot de gravação'),
  ('padrao', 'read.ai', 'bot de gravação'),
  ('padrao', 'otter.ai', 'bot de gravação')
on conflict (tipo, valor) do nothing;

-- ---------------------------------------------------------------------------
-- Fechamento mensal: foto do ranking oficial divulgado no canal.
-- ---------------------------------------------------------------------------
create table if not exists public.fechamentos_mensais (
  id           uuid primary key default gen_random_uuid(),
  mes          date not null unique check (extract(day from mes) = 1), -- primeiro dia do mês
  regras       jsonb not null,       -- cópia da configuração usada no cálculo
  fechado_em   timestamptz not null default now(),
  observacao   text
);

create table if not exists public.fechamento_ranking (
  fechamento_id           uuid not null references public.fechamentos_mensais (id) on delete cascade,
  posicao                 integer not null,
  membro_email            text not null,
  nome                    text not null,
  pontos_plataforma       integer not null default 0,
  pontos_por_evento       jsonb not null default '{}'::jsonb,
  encontros_qualificados  integer not null default 0,
  pontos_ao_vivo          integer not null default 0,
  total                   integer not null,
  posicao_plataforma      integer,
  primary key (fechamento_id, membro_email)
);

-- ---------------------------------------------------------------------------
-- Visões de apoio (mesma regra do app, simplificada: soma o tempo das entradas
-- da pessoa no encontro, sem o ajuste de abas sobrepostas).
-- ---------------------------------------------------------------------------
create or replace view public.presencas_qualificadas
with (security_invoker = true) as
select
  e.id                         as encontro_id,
  e.data,
  p.membro_email,
  sum(p.duracao_seg)           as segundos,
  ceil(e.duracao_min * 60 * e.percentual_minimo / 100.0) as minimo_seg
from public.encontro_participacoes p
join public.encontros e on e.id = p.encontro_id
where p.membro_email is not null
  and p.status_vinculo in ('email', 'email_nome', 'nome', 'manual')
group by e.id, e.data, e.duracao_min, e.percentual_minimo, p.membro_email
having sum(p.duracao_seg) >= ceil(e.duracao_min * 60 * e.percentual_minimo / 100.0);

-- Converte um critério de desempate em um número: quanto menor, mais à frente no ranking.
create or replace function public.chave_desempate(criterio text, segundos bigint, encontros bigint, membro_desde timestamp)
returns numeric
language sql
immutable
set search_path = ''
as $$
  select case criterio
    when 'tempo_ao_vivo' then -coalesce(segundos, 0)
    when 'ao_vivos'      then -coalesce(encontros, 0)
    when 'antiguidade'   then coalesce(extract(epoch from membro_desde), 9e15) -- sem data vai para o fim
    else 0
  end::numeric
$$;

create or replace view public.ranking_mensal
with (security_invoker = true) as
with meses as (
  select date_trunc('month', conquistado_em)::date as mes from public.eventos_pontuacao
  union
  select mes from public.periodos_plataforma
),
plataforma as (
  select
    m.mes,
    ev.email,
    sum(coalesce(r.pontos_fixos, ev.pontos)) as pontos
  from meses m
  left join public.periodos_plataforma pp on pp.mes = m.mes
  join public.eventos_pontuacao ev
    on ev.conquistado_em::date between coalesce(pp.inicio, m.mes)
                                   and coalesce(pp.fim, (m.mes + interval '1 month - 1 day')::date)
  join public.regras_eventos r on r.evento = ev.evento and r.conta
  group by 1, 2
),
ao_vivo as (
  select
    date_trunc('month', q.data)::date as mes,
    q.membro_email as email,
    count(*) as encontros,
    count(*) * (select pontos_ao_vivo from public.configuracoes limit 1) as pontos
  from public.presencas_qualificadas q
  group by 1, 2
),
-- tempo total nos ao vivos do mês, inclusive nos encontros em que a pessoa não chegou ao mínimo
tempo as (
  select
    date_trunc('month', e.data)::date as mes,
    p.membro_email as email,
    sum(p.duracao_seg) as segundos
  from public.encontro_participacoes p
  join public.encontros e on e.id = p.encontro_id
  where p.membro_email is not null
    and p.status_vinculo in ('email', 'email_nome', 'nome', 'manual')
  group by 1, 2
),
juntos as (
  select
    coalesce(p.mes, a.mes) as mes,
    coalesce(p.email, a.email) as email,
    coalesce(p.pontos, 0) as pontos_plataforma,
    coalesce(a.encontros, 0) as encontros_qualificados,
    coalesce(a.pontos, 0) as pontos_ao_vivo,
    coalesce(p.pontos, 0) + coalesce(a.pontos, 0) as total
  from plataforma p
  full join ao_vivo a on a.mes = p.mes and a.email = p.email
)
select
  j.mes,
  rank() over (
    partition by j.mes
    order by
      j.total desc,
      public.chave_desempate(cfg.criterios[1], t.segundos, j.encontros_qualificados, m.membro_desde),
      public.chave_desempate(cfg.criterios[2], t.segundos, j.encontros_qualificados, m.membro_desde),
      public.chave_desempate(cfg.criterios[3], t.segundos, j.encontros_qualificados, m.membro_desde)
  ) as posicao,
  j.email,
  coalesce(m.nome, j.email) as nome,
  j.pontos_plataforma,
  case when j.pontos_plataforma > 0
    then rank() over (partition by j.mes, (j.pontos_plataforma > 0) order by j.pontos_plataforma desc)
  end as posicao_plataforma,
  j.encontros_qualificados,
  j.pontos_ao_vivo,
  j.total,
  coalesce(t.segundos, 0) as segundos_ao_vivo,
  m.membro_desde
from juntos j
left join public.membros m on m.email = j.email
left join tempo t on t.mes = j.mes and t.email = j.email
cross join (select criterios_desempate as criterios from public.configuracoes limit 1) cfg
where j.total > 0
  and not exists (select 1 from public.exclusoes_ranking x where x.tipo = 'email' and x.valor = j.email)
  and not exists (
    select 1 from public.exclusoes_ranking x
    where x.tipo = 'padrao' and (j.email ilike '%' || x.valor || '%' or coalesce(m.nome, '') ilike '%' || x.valor || '%')
  );

-- ---------------------------------------------------------------------------
-- Segurança: só usuários autenticados (equipe) leem e escrevem.
-- ---------------------------------------------------------------------------
alter table public.membros                enable row level security;
alter table public.eventos_pontuacao      enable row level security;
alter table public.encontros              enable row level security;
alter table public.encontro_participacoes enable row level security;
alter table public.vinculos_participantes enable row level security;
alter table public.configuracoes          enable row level security;
alter table public.regras_eventos         enable row level security;
alter table public.exclusoes_ranking      enable row level security;
alter table public.periodos_plataforma    enable row level security;
alter table public.fechamentos_mensais    enable row level security;
alter table public.fechamento_ranking     enable row level security;

do $$
declare t text;
begin
  foreach t in array array[
    'membros', 'eventos_pontuacao', 'encontros', 'encontro_participacoes', 'vinculos_participantes',
    'configuracoes', 'regras_eventos', 'exclusoes_ranking', 'periodos_plataforma', 'fechamentos_mensais', 'fechamento_ranking'
  ] loop
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = t and policyname = 'equipe_acesso_total') then
      execute format(
        'create policy equipe_acesso_total on public.%I for all to authenticated using (true) with check (true)', t
      );
    end if;
  end loop;
end $$;
