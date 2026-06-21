-- Tabela de usuários que já falaram com o bot — rode no SQL Editor do Supabase.
-- Cada linha é um usuário único; serve de lista para o broadcast (/avisar).

create table if not exists usuarios (
  user_id     bigint primary key,
  username    text,
  first_name  text,
  ativo       boolean not null default true,   -- false quando o usuário bloqueou o bot
  criado_em   timestamptz not null default now(),
  visto_em    timestamptz not null default now()
);

create index if not exists usuarios_ativo_idx on usuarios (ativo);

-- Backfill: todo mundo que já leu algum conto entra como usuário conhecido.
insert into usuarios (user_id)
select distinct user_id from leituras
on conflict (user_id) do nothing;
