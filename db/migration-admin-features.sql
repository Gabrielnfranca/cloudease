-- 1. Tabela de Mensagens do Ticket (Chat)
create table if not exists ticket_messages (
  id uuid default gen_random_uuid() primary key,
  ticket_id integer references tickets(id) not null,
  user_id uuid references public.profiles(id), -- Quem enviou (ID público)
  message text not null,
  is_staff boolean default false, -- Se foi enviado por um admin/suporte
  created_at timestamp with time zone default now()
);

-- 2. Tabela de Avisos/Notificações Globais
create table if not exists system_announcements (
  id uuid default gen_random_uuid() primary key,
  title text not null,
  message text not null,
  type text check (type in ('info', 'warning', 'error', 'success')) default 'info',
  active boolean default true,
  created_at timestamp with time zone default now()
);

-- 3. Tabela de Membros do Time (Permissões de Admin)
create table if not exists team_roles (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.profiles(id) not null,
  role text default 'support', -- admin, developer, support, viewer
  permissions jsonb default '{}',
  created_at timestamp with time zone default now()
);

-- Habilitar RLS
alter table ticket_messages enable row level security;
alter table system_announcements enable row level security;
alter table team_roles enable row level security;

-- Políticas (COMENTADAS PARA RODAR VIA SCRIPT - RODAR NO DASHBOARD SE PRECISAR)
-- create policy "Admins View All Messages" on ticket_messages for select using (
--   exists (select 1 from profiles where profiles.id = auth.uid() and profiles.is_admin = true)
-- );

-- create policy "Admins Insert Messages" on ticket_messages for insert with check (
--   exists (select 1 from profiles where profiles.id = auth.uid() and profiles.is_admin = true)
-- );

-- create policy "Public Read Announcements" on system_announcements for select using (true);

-- create policy "Admins Manage Announcements" on system_announcements for all using (
--   exists (select 1 from profiles where profiles.id = auth.uid() and profiles.is_admin = true)
-- );
