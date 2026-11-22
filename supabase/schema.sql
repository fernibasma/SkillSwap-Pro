-- ============================================================================
-- SkillSwap Pro — Schéma PostgreSQL complet pour Supabase (Auth + RLS)
-- ============================================================================

-- Extensions
create extension if not exists "pgcrypto";

-- Types énumérés
do $$ begin
  create type user_role as enum ('student', 'company', 'admin');
exception when duplicate_object then null; end $$;

do $$ begin
  create type account_status as enum ('active', 'suspended');
exception when duplicate_object then null; end $$;

do $$ begin
  create type skill_mode as enum ('offered', 'wanted');
exception when duplicate_object then null; end $$;

do $$ begin
  create type skill_level as enum ('Débutant', 'Intermédiaire', 'Avancé', 'Expert');
exception when duplicate_object then null; end $$;

do $$ begin
  create type exchange_status as enum ('pending', 'accepted', 'rejected', 'completed');
exception when duplicate_object then null; end $$;

do $$ begin
  create type challenge_status as enum ('open', 'closed', 'archived');
exception when duplicate_object then null; end $$;

do $$ begin
  create type submission_status as enum ('submitted', 'approved', 'needs_revision');
exception when duplicate_object then null; end $$;

-- 1. Profils utilisateurs liés à auth.users
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  full_name text not null,
  role user_role not null default 'student',
  status account_status not null default 'active',
  university text default '',
  major text default '',
  company_name text default '',
  sector text default '',
  city text default '',
  bio text default '',
  website_url text default '',
  github_url text default '',
  linkedin_url text default '',
  notify_exchanges boolean not null default true,
  notify_challenges boolean not null default true,
  notify_messages boolean not null default true,
  profile_visibility text not null default 'public',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Trigger d'attribution automatique du rôle administrateur pour fernibasma@gmail.com
create or replace function public.handle_new_user()
returns trigger as $$
declare
  assigned_role user_role;
begin
  if lower(new.email) = 'fernibasma@gmail.com' then
    assigned_role := 'admin';
  elsif coalesce(new.raw_user_meta_data->>'role', 'student') = 'company' then
    assigned_role := 'company';
  else
    assigned_role := 'student';
  end if;

  insert into public.profiles (id, email, full_name, role, university, major, company_name, sector)
  values (
    new.id,
    lower(new.email),
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    assigned_role,
    coalesce(new.raw_user_meta_data->>'university', ''),
    coalesce(new.raw_user_meta_data->>'major', ''),
    coalesce(new.raw_user_meta_data->>'company_name', ''),
    coalesce(new.raw_user_meta_data->>'sector', '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- 2. Catalogue des compétences
create table if not exists public.skills (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  category text not null,
  description text default '',
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

-- 3. Compétences des étudiants (proposées et recherchées)
create table if not exists public.user_skills (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  skill_id uuid not null references public.skills(id) on delete cascade,
  mode skill_mode not null,
  level skill_level not null default 'Intermédiaire',
  notes text default '',
  created_at timestamptz not null default now(),
  unique (user_id, skill_id, mode)
);

-- 4. Demandes d'échange de compétences
create table if not exists public.skill_exchanges (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.profiles(id) on delete cascade,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  offered_skill_id uuid not null references public.skills(id) on delete cascade,
  requested_skill_id uuid not null references public.skills(id) on delete cascade,
  message text not null default '',
  proposed_hours integer not null default 2,
  status exchange_status not null default 'pending',
  response_note text default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 5. Défis pratiques publiés par les entreprises
create table if not exists public.challenges (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  category text not null,
  difficulty text not null default 'Intermédiaire',
  summary text not null,
  brief text not null,
  reward text not null default '',
  deadline text not null,
  status challenge_status not null default 'open',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 6. Soumissions et évaluations des défis
create table if not exists public.challenge_submissions (
  id uuid primary key default gen_random_uuid(),
  challenge_id uuid not null references public.challenges(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  solution_url text not null,
  summary text not null,
  score integer check (score >= 0 and score <= 100),
  feedback text default '',
  status submission_status not null default 'submitted',
  evaluated_by uuid references public.profiles(id) on delete set null,
  evaluated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (challenge_id, student_id)
);

-- 7. Projets du portfolio étudiant
create table if not exists public.portfolio_projects (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  category text not null,
  description text not null,
  technologies text not null default '',
  project_url text default '',
  completed_at text not null,
  created_at timestamptz not null default now()
);

-- 8. Messagerie directe
create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references public.profiles(id) on delete cascade,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  content text not null,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

-- 9. Notifications
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  type text not null,
  title text not null,
  body text not null,
  link_tab text default 'overview',
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

-- Activation RLS sur toutes les tables
alter table public.profiles enable row level security;
alter table public.skills enable row level security;
alter table public.user_skills enable row level security;
alter table public.skill_exchanges enable row level security;
alter table public.challenges enable row level security;
alter table public.challenge_submissions enable row level security;
alter table public.portfolio_projects enable row level security;
alter table public.messages enable row level security;
alter table public.notifications enable row level security;

-- Fonction utilitaire admin
create or replace function public.is_admin()
returns boolean as $$
  select exists (
    select 1 from public.profiles where id = auth.uid() and role = 'admin' and status = 'active'
  );
$$ language sql security definer stable;

-- Politiques RLS principales
create policy "Profils lisibles par utilisateurs authentifiés" on public.profiles
  for select using (auth.role() = 'authenticated');

create policy "Modification de son propre profil ou par admin" on public.profiles
  for update using (auth.uid() = id or public.is_admin());

create policy "Catalogue des compétences lisible par tous" on public.skills
  for select using (true);

create policy "Gestion compétences par admin" on public.skills
  for all using (public.is_admin());

create policy "Compétences utilisateurs lisibles" on public.user_skills
  for select using (auth.role() = 'authenticated');

create policy "Gestion de ses propres compétences" on public.user_skills
  for all using (auth.uid() = user_id or public.is_admin());

create policy "Échanges visibles aux participants et admin" on public.skill_exchanges
  for select using (auth.uid() = requester_id or auth.uid() = recipient_id or public.is_admin());

create policy "Création d'échange par demandeur" on public.skill_exchanges
  for insert with check (auth.uid() = requester_id);

create policy "Mise à jour échange par participant ou admin" on public.skill_exchanges
  for update using (auth.uid() = requester_id or auth.uid() = recipient_id or public.is_admin());

create policy "Défis lisibles publiquement" on public.challenges
  for select using (true);

create policy "Création défi par entreprise ou admin" on public.challenges
  for insert with check (
    exists (select 1 from public.profiles where id = auth.uid() and role in ('company', 'admin'))
  );

create policy "Modification défi par propriétaire ou admin" on public.challenges
  for update using (auth.uid() = company_id or public.is_admin());

create policy "Soumissions visibles par étudiant, entreprise hôte ou admin" on public.challenge_submissions
  for select using (
    auth.uid() = student_id
    or exists (select 1 from public.challenges c where c.id = challenge_id and c.company_id = auth.uid())
    or public.is_admin()
  );

create policy "Soumission par étudiant" on public.challenge_submissions
  for insert with check (auth.uid() = student_id);

create policy "Évaluation par entreprise hôte ou admin" on public.challenge_submissions
  for update using (
    exists (select 1 from public.challenges c where c.id = challenge_id and c.company_id = auth.uid())
    or public.is_admin()
  );

create policy "Portfolio lisible par utilisateurs authentifiés" on public.portfolio_projects
  for select using (auth.role() = 'authenticated');

create policy "Gestion de son propre portfolio" on public.portfolio_projects
  for all using (auth.uid() = student_id or public.is_admin());

create policy "Messages visibles aux participants" on public.messages
  for select using (auth.uid() = sender_id or auth.uid() = recipient_id);

create policy "Envoi message par expéditeur" on public.messages
  for insert with check (auth.uid() = sender_id);

create policy "Lecture message par destinataire" on public.messages
  for update using (auth.uid() = recipient_id);

create policy "Notifications propres" on public.notifications
  for all using (auth.uid() = user_id);

-- 10. Offres d'abonnement (Étudiant & Entreprise)
create table if not exists public.subscription_plans (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  target_role text not null check (target_role in ('student', 'company')),
  billing_cycle text not null check (billing_cycle in ('monthly', 'annual')),
  price_mad numeric(10, 2) not null check (price_mad >= 0),
  currency text not null default 'DH',
  duration_months integer not null check (duration_months > 0),
  description text not null default '',
  features jsonb not null default '[]'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 11. Abonnements des utilisateurs (sans doublon actif par utilisateur)
create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.profiles(id) on delete cascade,
  plan_id uuid not null references public.subscription_plans(id) on delete restrict,
  price_paid_mad numeric(10, 2) not null default 0,
  status text not null default 'pending_payment' check (status in ('active', 'expired', 'pending_payment', 'cancelled')),
  starts_at timestamptz,
  expires_at timestamptz,
  auto_renew boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 12. Paiements / Transactions (aucun numéro de carte ni CVV stocké)
create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  subscription_id uuid references public.subscriptions(id) on delete set null,
  plan_id uuid not null references public.subscription_plans(id) on delete restrict,
  amount_mad numeric(10, 2) not null,
  currency text not null default 'DH',
  provider text not null default 'sandbox',
  payment_method text not null default 'card',
  card_brand text not null default '',
  card_last4 text not null default '',
  provider_ref text not null unique,
  status text not null default 'pending' check (status in ('pending', 'succeeded', 'failed', 'cancelled', 'refund_requested', 'refunded')),
  failure_reason text not null default '',
  refund_reason text not null default '',
  refunded_at timestamptz,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 13. Factures & reçus générés après paiement validé
create table if not exists public.invoices (
  id uuid primary key default gen_random_uuid(),
  invoice_number text not null unique,
  payment_id uuid not null unique references public.payments(id) on delete cascade,
  subscription_id uuid references public.subscriptions(id) on delete set null,
  user_id uuid not null references public.profiles(id) on delete cascade,
  customer_name text not null,
  customer_email text not null,
  customer_org text not null default '',
  plan_name text not null,
  amount_mad numeric(10, 2) not null,
  currency text not null default 'DH',
  status text not null default 'paid' check (status in ('paid', 'refunded')),
  issued_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists idx_subscriptions_user_status on public.subscriptions(user_id, status);
create index if not exists idx_payments_user_created on public.payments(user_id, created_at desc);
create index if not exists idx_invoices_user_issued on public.invoices(user_id, issued_at desc);

alter table public.subscription_plans enable row level security;
alter table public.subscriptions enable row level security;
alter table public.payments enable row level security;
alter table public.invoices enable row level security;

create policy "Plans lisibles publiquement" on public.subscription_plans
  for select using (true);

create policy "Gestion des plans par admin" on public.subscription_plans
  for all using (public.is_admin());

create policy "Abonnements lisibles par propriétaire ou admin" on public.subscriptions
  for select using (auth.uid() = user_id or public.is_admin());

create policy "Paiements lisibles par propriétaire ou admin" on public.payments
  for select using (auth.uid() = user_id or public.is_admin());

create policy "Factures lisibles par propriétaire ou admin" on public.invoices
  for select using (auth.uid() = user_id or public.is_admin());

insert into public.subscription_plans (code, name, target_role, billing_cycle, price_mad, currency, duration_months, description, features)
values
  (
    'student_annual',
    'Abonnement Étudiant Annuel',
    'student',
    'annual',
    100,
    'DH',
    12,
    'Accès complet pendant 12 mois aux échanges de compétences, challenges d’entreprises, portfolio vérifié et messagerie.',
    '["Échanges de compétences illimités entre étudiants", "Participation et soumission aux challenges d’entreprises", "Portfolio public vérifié et visible par les recruteurs", "Messagerie directe et notifications en temps réel"]'::jsonb
  ),
  (
    'company_monthly',
    'Entreprise Mensuel',
    'company',
    'monthly',
    490,
    'DH',
    1,
    'Formule souple sans engagement annuel pour publier des challenges et sourcer des talents universitaires.',
    '["Publication de challenges pratiques et évaluation notée", "Accès complet à l’annuaire et portfolios des talents", "Messagerie directe avec les étudiants présélectionnés", "Facturation mensuelle avec reçu téléchargeable"]'::jsonb
  ),
  (
    'company_annual',
    'Entreprise Annuel',
    'company',
    'annual',
    4900,
    'DH',
    12,
    'Couverture annuelle complète pour les équipes RH et techniques avec 2 mois offerts par rapport au tarif mensuel.',
    '["Challenges illimités toute l’année (12 mois)", "Accès prioritaire aux talents et portfolios vérifiés", "Messagerie directe illimitée avec les candidats", "Économie annuelle dédiée et suivi administratif prioritaire"]'::jsonb
  )
on conflict (code) do nothing;

