-- 1. Profiles Table (Extends Supabase Auth)
create table if not exists public.profiles (
  id uuid references auth.users on delete cascade not null primary key,
  name text,
  email text,
  is_admin boolean default false,
  status text default 'active',
  last_login timestamp with time zone,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

-- Trigger to create profile on signup
create or replace function public.handle_new_user() 
returns trigger as $$
begin
  insert into public.profiles (id, email, name)
  values (new.id, new.email, new.raw_user_meta_data->>'name');
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- 2. Providers (API Connections)
create table if not exists public.providers (
  id serial primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  provider_name text not null, -- 'digitalocean', 'vultr', 'linode'
  api_key text not null,
  label text,
  created_at timestamp with time zone default now()
);

-- 3. Servers Cache
create table if not exists public.servers_cache (
  id serial primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  provider_id integer references public.providers(id) on delete set null,
  external_id text,
  name text,
  ip_address text,
  status text,
  specs jsonb,
  created_at timestamp with time zone default now(),
  last_synced timestamp with time zone default now()
);

-- 4. Sites
create table if not exists public.sites (
  id serial primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  server_id integer references public.servers_cache(id) on delete set null,
  domain text not null,
  platform text default 'php',
  php_version text,
  status text default 'provisioning',
  enable_temp_url boolean default false,
  system_user text,
  system_password text,
  last_error text,
  created_at timestamp with time zone default now()
);

-- 5. Applications (Details for WordPress etc)
create table if not exists public.applications (
  id serial primary key,
  site_id integer references public.sites(id) on delete cascade,
  db_name text,
  db_user text,
  db_pass text,
  db_host text default 'localhost',
  db_port integer default 3306,
  wp_admin_user text,
  wp_admin_pass text,
  created_at timestamp with time zone default now()
);

-- 6. Domains (DNS Management)
create table if not exists public.domains (
  id serial primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  domain text not null,
  registrar text,
  dns_provider text,
  expiry_date timestamp with time zone,
  status text default 'active',
  created_at timestamp with time zone default now()
);

-- 7. Tickets (Support)
create table if not exists public.tickets (
  id serial primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  subject text not null,
  description text,
  urgency text default 'medium',
  status text default 'open',
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

-- 8. Invoices (Billing)
create table if not exists public.invoices (
  id serial primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  amount decimal(10,2) not null,
  status text default 'paid',
  created_at timestamp with time zone default now()
);

-- 9. Enable RLS (Row Level Security)
alter table profiles enable row level security;
alter table providers enable row level security;
alter table servers_cache enable row level security;
alter table sites enable row level security;
alter table applications enable row level security;
alter table domains enable row level security;
alter table tickets enable row level security;
alter table invoices enable row level security;

-- 10. POLICIES (Simple: Users can only see their own data)

-- Profiles
create policy "Users can view own profile" on profiles for select using (auth.uid() = id);
create policy "Users can update own profile" on profiles for update using (auth.uid() = id);

-- Providers
create policy "Users can CRUD own providers" on providers for all using (auth.uid() = user_id);

-- Servers
create policy "Users can CRUD own servers" on servers_cache for all using (auth.uid() = user_id);

-- Sites
create policy "Users can CRUD own sites" on sites for all using (auth.uid() = user_id);

-- Applications
create policy "Users can CRUD own apps" on applications for all 
using (exists (select 1 from sites where sites.id = applications.site_id and sites.user_id = auth.uid()));

-- Domains
create policy "Users can CRUD own domains" on domains for all using (auth.uid() = user_id);

-- Tickets
create policy "Users can CRUD own tickets" on tickets for all using (auth.uid() = user_id);

-- Invoices
create policy "Users can view own invoices" on invoices for select using (auth.uid() = user_id);

