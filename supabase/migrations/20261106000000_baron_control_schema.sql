-- =============================================================================
-- BARON CONTROL — esquema principal
-- Tabelas: profiles, admin_permissions, user_settings, investments,
--          daily_reports, facebook_accounts
-- Todas as tabelas privadas têm Row Level Security activo.
-- =============================================================================

create extension if not exists pgcrypto with schema extensions;

-- -----------------------------------------------------------------------------
-- Tipos
-- -----------------------------------------------------------------------------
create type public.account_status as enum ('pending', 'approved', 'rejected', 'suspended');
create type public.spend_currency as enum ('USD', 'USDT');

-- E-mail do administrador principal (imutável; validado no backend).
create or replace function public.primary_admin_email()
returns text
language sql
immutable
as $$ select 'chadlopesff@gmail.com'::text $$;

-- -----------------------------------------------------------------------------
-- profiles: 1 linha por utilizador de auth.users
-- -----------------------------------------------------------------------------
create table public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  email        text not null,
  status       public.account_status not null default 'pending',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  status_changed_at timestamptz,
  status_changed_by uuid references auth.users (id) on delete set null
);
create index profiles_status_idx on public.profiles (status);
create index profiles_email_idx on public.profiles (lower(email));

-- -----------------------------------------------------------------------------
-- admin_permissions: quem é administrador. Só escrito por funções do backend.
-- -----------------------------------------------------------------------------
create table public.admin_permissions (
  user_id     uuid primary key references auth.users (id) on delete cascade,
  is_primary  boolean not null default false,
  granted_at  timestamptz not null default now()
);
create unique index admin_permissions_one_primary on public.admin_permissions (is_primary) where is_primary;

-- -----------------------------------------------------------------------------
-- user_settings: taxa por defeito e reconciliação do saldo publicitário
-- -----------------------------------------------------------------------------
create table public.user_settings (
  user_id                 uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  default_rate            numeric(14, 4) not null default 75 check (default_rate > 0 and default_rate < 1000000),
  -- Saldo real verificado na conta de anúncios (USD) numa data de referência.
  reconciled_balance_usd  numeric(18, 2) check (reconciled_balance_usd >= 0),
  reconciled_on           date,
  updated_at              timestamptz not null default now(),
  constraint reconciliation_complete check (
    (reconciled_balance_usd is null and reconciled_on is null)
    or (reconciled_balance_usd is not null and reconciled_on is not null)
  )
);

-- -----------------------------------------------------------------------------
-- investments: cada compra/carregamento de USDT (nunca substitui anteriores)
-- -----------------------------------------------------------------------------
create table public.investments (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null default auth.uid() references auth.users (id) on delete cascade,
  usdt_amount        numeric(18, 2) not null check (usdt_amount > 0 and usdt_amount <= 100000000),
  rate               numeric(14, 4) not null check (rate > 0 and rate < 1000000),
  mzn_amount         numeric(20, 2) generated always as (round(usdt_amount * rate, 2)) stored,
  -- true  = USDT já carregado numa conta de anúncios
  -- false = USDT comprado e ainda em carteira (não carregado)
  loaded_to_ads      boolean not null default true,
  occurred_at        timestamptz not null default now(),
  note               text check (char_length(note) <= 500),
  client_request_id  uuid not null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint investments_idempotency unique (user_id, client_request_id)
);
create index investments_user_date_idx on public.investments (user_id, occurred_at desc);

-- -----------------------------------------------------------------------------
-- daily_reports: resultados diários (vários por dia permitidos)
-- -----------------------------------------------------------------------------
create table public.daily_reports (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null default auth.uid() references auth.users (id) on delete cascade,
  report_date         date not null,
  ad_spend            numeric(18, 2) not null check (ad_spend >= 0 and ad_spend <= 100000000),
  spend_currency      public.spend_currency not null default 'USDT',
  rate                numeric(14, 4) not null check (rate > 0 and rate < 1000000),
  ad_spend_mzn        numeric(20, 2) generated always as (round(ad_spend * rate, 2)) stored,
  revenue_mzn         numeric(20, 2) not null check (revenue_mzn >= 0 and revenue_mzn <= 100000000000),
  other_expenses_mzn  numeric(20, 2) not null default 0 check (other_expenses_mzn >= 0 and other_expenses_mzn <= 100000000000),
  net_profit_mzn      numeric(20, 2) generated always as (
                        round(revenue_mzn - round(ad_spend * rate, 2) - other_expenses_mzn, 2)
                      ) stored,
  roas                numeric(14, 4) generated always as (
                        case when ad_spend * rate > 0 then round(revenue_mzn / round(ad_spend * rate, 2), 4) end
                      ) stored,
  note                text check (char_length(note) <= 500),
  client_request_id   uuid not null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint daily_reports_idempotency unique (user_id, client_request_id)
);
create index daily_reports_user_date_idx on public.daily_reports (user_id, report_date desc);

-- -----------------------------------------------------------------------------
-- facebook_accounts: cofre. Credenciais guardadas apenas cifradas (AES-256-GCM)
-- pela Edge Function "vault". A chave nunca está na base de dados.
-- -----------------------------------------------------------------------------
create table public.facebook_accounts (
  id                   uuid primary key default gen_random_uuid(),
  user_id              uuid not null default auth.uid() references auth.users (id) on delete cascade,
  label                text not null check (char_length(label) between 1 and 80),
  login_ciphertext     text not null,
  password_ciphertext  text not null,
  notes_ciphertext     text,
  key_version          smallint not null default 1,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  -- Formato obrigatório "v<versão>.<iv base64>.<ciphertext base64>" — impede
  -- que alguém guarde texto simples nestas colunas.
  constraint login_is_ciphertext    check (login_ciphertext ~ '^v[0-9]+\.[A-Za-z0-9+/=]{16}\.[A-Za-z0-9+/=]{24,}$'),
  constraint password_is_ciphertext check (password_ciphertext ~ '^v[0-9]+\.[A-Za-z0-9+/=]{16}\.[A-Za-z0-9+/=]{24,}$'),
  constraint notes_is_ciphertext    check (notes_ciphertext is null or notes_ciphertext ~ '^v[0-9]+\.[A-Za-z0-9+/=]{16}\.[A-Za-z0-9+/=]{24,}$')
);
create index facebook_accounts_user_idx on public.facebook_accounts (user_id, created_at desc);

-- =============================================================================
-- Funções de autorização (SECURITY DEFINER, search_path fixo)
-- =============================================================================
create or replace function public.is_admin(uid uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.admin_permissions ap
    join public.profiles p on p.id = ap.user_id
    join auth.users u on u.id = ap.user_id
    where ap.user_id = uid
      and p.status = 'approved'
      and u.email_confirmed_at is not null
  );
$$;

create or replace function public.is_approved(uid uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p where p.id = uid and p.status = 'approved'
  );
$$;

-- =============================================================================
-- Triggers
-- =============================================================================

-- Novo utilizador em auth.users -> perfil "pending" (ou admin principal aprovado).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  is_primary boolean := lower(new.email) = public.primary_admin_email();
begin
  insert into public.profiles (id, email, status, status_changed_at)
  values (new.id, lower(new.email),
          case when is_primary then 'approved'::public.account_status else 'pending'::public.account_status end,
          case when is_primary then now() end);

  insert into public.user_settings (user_id) values (new.id);

  if is_primary then
    insert into public.admin_permissions (user_id, is_primary) values (new.id, true)
    on conflict (user_id) do update set is_primary = true;
  end if;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Mantém o e-mail do perfil sincronizado se o utilizador o alterar.
create or replace function public.handle_user_email_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.email is distinct from old.email then
    update public.profiles set email = lower(new.email), updated_at = now() where id = new.id;
  end if;
  return new;
end;
$$;

create trigger on_auth_user_email_changed
  after update of email on auth.users
  for each row execute function public.handle_user_email_change();

-- updated_at automático e user_id imutável.
create or replace function public.touch_row()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and new.user_id is distinct from old.user_id then
    raise exception 'user_id is immutable' using errcode = '42501';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create trigger investments_touch before update on public.investments
  for each row execute function public.touch_row();
create trigger daily_reports_touch before update on public.daily_reports
  for each row execute function public.touch_row();
create trigger facebook_accounts_touch before update on public.facebook_accounts
  for each row execute function public.touch_row();
create trigger user_settings_touch before update on public.user_settings
  for each row execute function public.touch_row();

-- =============================================================================
-- Row Level Security
-- =============================================================================
alter table public.profiles          enable row level security;
alter table public.admin_permissions enable row level security;
alter table public.user_settings     enable row level security;
alter table public.investments       enable row level security;
alter table public.daily_reports     enable row level security;
alter table public.facebook_accounts enable row level security;


-- Privilégios de base: anon não tem acesso a nada.
revoke all on public.profiles, public.admin_permissions, public.user_settings,
              public.investments, public.daily_reports, public.facebook_accounts
  from anon, authenticated;

grant select on public.profiles to authenticated;
grant select on public.admin_permissions to authenticated;
grant select, insert, update on public.user_settings to authenticated;
grant select, insert, update, delete on public.investments to authenticated;
grant select, insert, update, delete on public.daily_reports to authenticated;
grant select, insert, update, delete on public.facebook_accounts to authenticated;

-- Colunas geradas / de sistema não são graváveis pelo cliente.
revoke insert, update on public.investments from authenticated;
grant insert (usdt_amount, rate, loaded_to_ads, occurred_at, note, client_request_id)
  on public.investments to authenticated;
grant update (usdt_amount, rate, loaded_to_ads, occurred_at, note)
  on public.investments to authenticated;

revoke insert, update on public.daily_reports from authenticated;
grant insert (report_date, ad_spend, spend_currency, rate, revenue_mzn, other_expenses_mzn, note, client_request_id)
  on public.daily_reports to authenticated;
grant update (report_date, ad_spend, spend_currency, rate, revenue_mzn, other_expenses_mzn, note)
  on public.daily_reports to authenticated;

revoke insert, update on public.facebook_accounts from authenticated;
grant insert (id, label, login_ciphertext, password_ciphertext, notes_ciphertext, key_version)
  on public.facebook_accounts to authenticated;
grant update (label, login_ciphertext, password_ciphertext, notes_ciphertext, key_version)
  on public.facebook_accounts to authenticated;

revoke insert, update on public.user_settings from authenticated;
grant insert (default_rate, reconciled_balance_usd, reconciled_on) on public.user_settings to authenticated;
grant update (default_rate, reconciled_balance_usd, reconciled_on) on public.user_settings to authenticated;

-- profiles: o próprio vê o seu perfil; o admin vê todos. Ninguém escreve
-- directamente (alterações de estado só pelas funções admin_* abaixo).
create policy profiles_select_own on public.profiles
  for select to authenticated using (id = (select auth.uid()));
create policy profiles_select_admin on public.profiles
  for select to authenticated using ((select public.is_admin()));

-- admin_permissions: cada um só vê a sua linha (para o frontend saber se é admin).
create policy admin_permissions_select_own on public.admin_permissions
  for select to authenticated using (user_id = (select auth.uid()));

-- Macro de política para tabelas privadas: dono + conta aprovada.
-- (O administrador NÃO tem políticas aqui — não vê dados privados de ninguém.)
create policy user_settings_select on public.user_settings
  for select to authenticated using (user_id = (select auth.uid()) and (select public.is_approved()));
create policy user_settings_insert on public.user_settings
  for insert to authenticated with check (user_id = (select auth.uid()) and (select public.is_approved()));
create policy user_settings_update on public.user_settings
  for update to authenticated
  using (user_id = (select auth.uid()) and (select public.is_approved()))
  with check (user_id = (select auth.uid()) and (select public.is_approved()));

create policy investments_select on public.investments
  for select to authenticated using (user_id = (select auth.uid()) and (select public.is_approved()));
create policy investments_insert on public.investments
  for insert to authenticated with check (user_id = (select auth.uid()) and (select public.is_approved()));
create policy investments_update on public.investments
  for update to authenticated
  using (user_id = (select auth.uid()) and (select public.is_approved()))
  with check (user_id = (select auth.uid()) and (select public.is_approved()));
create policy investments_delete on public.investments
  for delete to authenticated using (user_id = (select auth.uid()) and (select public.is_approved()));

create policy daily_reports_select on public.daily_reports
  for select to authenticated using (user_id = (select auth.uid()) and (select public.is_approved()));
create policy daily_reports_insert on public.daily_reports
  for insert to authenticated with check (user_id = (select auth.uid()) and (select public.is_approved()));
create policy daily_reports_update on public.daily_reports
  for update to authenticated
  using (user_id = (select auth.uid()) and (select public.is_approved()))
  with check (user_id = (select auth.uid()) and (select public.is_approved()));
create policy daily_reports_delete on public.daily_reports
  for delete to authenticated using (user_id = (select auth.uid()) and (select public.is_approved()));

create policy facebook_accounts_select on public.facebook_accounts
  for select to authenticated using (user_id = (select auth.uid()) and (select public.is_approved()));
create policy facebook_accounts_insert on public.facebook_accounts
  for insert to authenticated with check (user_id = (select auth.uid()) and (select public.is_approved()));
create policy facebook_accounts_update on public.facebook_accounts
  for update to authenticated
  using (user_id = (select auth.uid()) and (select public.is_approved()))
  with check (user_id = (select auth.uid()) and (select public.is_approved()));
create policy facebook_accounts_delete on public.facebook_accounts
  for delete to authenticated using (user_id = (select auth.uid()) and (select public.is_approved()));

-- =============================================================================
-- Funções administrativas (RPC). Validação de permissões no servidor.
-- =============================================================================
create or replace function public.admin_list_users(search text default null)
returns table (id uuid, email text, status public.account_status, created_at timestamptz,
               status_changed_at timestamptz, is_admin boolean, is_primary boolean,
               email_confirmed boolean, last_sign_in_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return query
    select p.id, p.email, p.status, p.created_at, p.status_changed_at,
           (ap.user_id is not null), coalesce(ap.is_primary, false),
           (u.email_confirmed_at is not null), u.last_sign_in_at
    from public.profiles p
    join auth.users u on u.id = p.id
    left join public.admin_permissions ap on ap.user_id = p.id
    where search is null or search = '' or p.email ilike '%' || search || '%'
    order by case p.status when 'pending' then 0 else 1 end, p.created_at desc;
end;
$$;

create or replace function public.admin_set_status(target uuid, new_status public.account_status)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_is_primary boolean;
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if target = auth.uid() then
    raise exception 'cannot change own status' using errcode = '42501';
  end if;
  select coalesce(ap.is_primary, false) into target_is_primary
    from public.profiles p left join public.admin_permissions ap on ap.user_id = p.id
    where p.id = target;
  if not found then
    raise exception 'user not found' using errcode = 'P0002';
  end if;
  if target_is_primary then
    raise exception 'primary admin is protected' using errcode = '42501';
  end if;
  update public.profiles
     set status = new_status, status_changed_at = now(), status_changed_by = auth.uid(), updated_at = now()
   where id = target;
end;
$$;

create or replace function public.admin_delete_user(target uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if target = auth.uid() then
    raise exception 'cannot delete self' using errcode = '42501';
  end if;
  if exists (select 1 from public.admin_permissions where user_id = target and is_primary) then
    raise exception 'primary admin is protected' using errcode = '42501';
  end if;
  -- Remove a conta de autenticação; ON DELETE CASCADE apaga todos os dados do utilizador.
  delete from auth.users where id = target;
  if not found then
    raise exception 'user not found' using errcode = 'P0002';
  end if;
end;
$$;

-- Protege o administrador principal contra alterações por SQL directo de
-- qualquer sessão que não seja o próprio backend (postgres/supabase_admin).
create or replace function public.protect_primary_admin()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from public.admin_permissions where user_id = old.id and is_primary)
     and new.status <> 'approved' then
    raise exception 'primary admin must stay approved' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger profiles_protect_primary before update of status on public.profiles
  for each row execute function public.protect_primary_admin();

revoke all on function public.admin_list_users(text) from public, anon;
revoke all on function public.admin_set_status(uuid, public.account_status) from public, anon;
revoke all on function public.admin_delete_user(uuid) from public, anon;
revoke all on function public.handle_new_user() from public, anon, authenticated;
revoke all on function public.handle_user_email_change() from public, anon, authenticated;
revoke all on function public.protect_primary_admin() from public, anon, authenticated;
grant execute on function public.admin_list_users(text) to authenticated;
grant execute on function public.admin_set_status(uuid, public.account_status) to authenticated;
grant execute on function public.admin_delete_user(uuid) to authenticated;
grant execute on function public.is_admin(uuid) to authenticated;
grant execute on function public.is_approved(uuid) to authenticated;

-- is_admin/is_approved com argumento arbitrário só revelam um booleano; mesmo
-- assim restringimos a consulta de terceiros a administradores.
create or replace function public.is_approved(uid uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (uid = auth.uid() or public.is_admin())
     and exists (select 1 from public.profiles p where p.id = uid and p.status = 'approved');
$$;

-- =============================================================================
-- vault_audit: registo de acessos ao cofre (sem segredos). Usado também para
-- bloquear tentativas repetidas de reautenticação falhadas.
-- =============================================================================
create table public.vault_audit (
  id          bigint generated always as identity primary key,
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  account_id  uuid,
  action      text not null check (action in ('reveal', 'reveal_failed', 'create', 'update', 'delete')),
  created_at  timestamptz not null default now()
);
create index vault_audit_user_idx on public.vault_audit (user_id, created_at desc);
alter table public.vault_audit enable row level security;
revoke all on public.vault_audit from anon, authenticated;
grant select on public.vault_audit to authenticated;
grant insert (account_id, action) on public.vault_audit to authenticated;
create policy vault_audit_select on public.vault_audit
  for select to authenticated using (user_id = (select auth.uid()) and (select public.is_approved()));
create policy vault_audit_insert on public.vault_audit
  for insert to authenticated with check (user_id = (select auth.uid()) and (select public.is_approved()));
