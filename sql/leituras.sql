-- Tabela de eventos de leitura — rode no SQL Editor do Supabase.
-- Cada linha é um evento: abertura de conto (pagina 0) ou virada de página (pagina > 0).

create table if not exists leituras (
  id                bigint generated always as identity primary key,
  user_id           bigint not null,
  post_id           text not null,
  pagina            int not null default 0,
  origem            text not null default 'bot',   -- 'canal' (deep link da sugestão) | 'bot' (menu/surpresa/novela/paginação)
  premium_bloqueado boolean not null default false, -- true quando bateu no muro de assinante
  criado_em         timestamptz not null default now()
);

create index if not exists leituras_post_id_idx   on leituras (post_id);
create index if not exists leituras_criado_em_idx on leituras (criado_em);
create index if not exists leituras_origem_idx     on leituras (origem);
