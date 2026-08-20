-- Tabela de usuários que já falaram com o bot — rode no SQL Editor do Supabase.
-- Cada linha é um usuário único; serve de lista para o broadcast (/avisar).

create table if not exists usuarios (
  user_id     bigint primary key,
  username    text,
  first_name  text,
  ativo       boolean not null default true,   -- false quando o usuário bloqueou o bot
  receber_avisos boolean not null default true, -- false quando pediu pra não receber broadcast
  inativo_em  timestamptz,                     -- quando o bot descobriu o bloqueio (null = antes de a gente medir)
  criado_em   timestamptz not null default now(),
  visto_em    timestamptz not null default now()
);

-- Para bancos que já existiam antes do opt-out.
alter table usuarios add column if not exists receber_avisos boolean not null default true;
-- Fica nula nas linhas ja marcadas: preencher com a data de hoje diria que todas
-- bloquearam hoje, o que nao e verdade — elas so foram descobertas de uma vez.
alter table usuarios add column if not exists inativo_em timestamptz;

create index if not exists usuarios_ativo_idx on usuarios (ativo);
-- Índice do público do broadcast: ativo (não bloqueou) E que ainda quer receber.
create index if not exists usuarios_broadcast_idx on usuarios (ativo, receber_avisos);

-- A lista de usuários não deve ser legível pela chave anon.
-- O bot usa a service key, que ignora RLS — continua funcionando normalmente.
alter table usuarios enable row level security;

-- Backfill: todo mundo que já leu algum conto entra como usuário conhecido.
insert into usuarios (user_id)
select distinct user_id from leituras
on conflict (user_id) do nothing;
