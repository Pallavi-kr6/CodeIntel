-- ==========================================
-- AI CODE REVIEWER - DATABASE SCHEMA (v2.0)
-- Optimized for Supabase with triggers & RLS
-- ==========================================

-- Enable extensions if not enabled
create extension if not exists "uuid-ossp";

-- 1. USERS TABLE (Mirrors auth.users with automatic triggers)
create table public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  email text unique not null,
  name text,
  avatar_url text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 2. REPOSITORIES TABLE
create table public.repositories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users(id) on delete cascade not null,
  repo_name text not null,
  repo_owner text not null,
  is_connected boolean default true not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  unique(user_id, repo_owner, repo_name)
);

-- 3. REVIEWS TABLE
create table public.reviews (
  id uuid primary key default gen_random_uuid(),
  repo_id uuid references public.repositories(id) on delete cascade not null,
  pull_number integer not null,
  commit_sha text,
  risk_score integer check (risk_score >= 0 and risk_score <= 100),
  summary text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 4. ISSUES TABLE
create table public.issues (
  id uuid primary key default gen_random_uuid(),
  review_id uuid references public.reviews(id) on delete cascade not null,
  severity text check (severity in ('low', 'medium', 'high', 'critical')) not null,
  description text not null,
  file_path text,
  line_number integer,
  suggested_fix text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- ==========================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- Enforce tight security on all tables
-- ==========================================

-- Enable RLS on all tables
alter table public.users enable row level security;
alter table public.repositories enable row level security;
alter table public.reviews enable row level security;
alter table public.issues enable row level security;

-- USERS POLICIES
create policy "Users can read own record"
  on public.users for select
  using (auth.uid() = id);

create policy "Users can update own record"
  on public.users for update
  using (auth.uid() = id);

create policy "Users can insert own record"
  on public.users for insert
  with check (auth.uid() = id);

-- REPOSITORIES POLICIES
create policy "Users can manage own repositories"
  on public.repositories for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- REVIEWS POLICIES
create policy "Users can manage reviews of own repositories"
  on public.reviews for all
  using (
    exists (
      select 1 from public.repositories r
      where r.id = repo_id and r.user_id = auth.uid()
    )
  );

-- ISSUES POLICIES
create policy "Users can manage issues of own reviews"
  on public.issues for all
  using (
    exists (
      select 1 from public.reviews rev
      join public.repositories r on r.id = rev.repo_id
      where rev.id = review_id and r.user_id = auth.uid()
    )
  );

-- ==========================================
-- AUTHENTICATION TRIGGERS
-- Automatically sync public.users on signup
-- ==========================================

-- Function to handle new user registration in Supabase Auth
create or replace function public.handle_new_user()
returns trigger
security definer set search_path = public
language plpgsql
as $$
begin
  insert into public.users (id, email, name, avatar_url)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'preferred_username', 'Developer'),
    new.raw_user_meta_data->>'avatar_url'
  )
  on conflict (id) do update
  set email = excluded.email,
      name = excluded.name,
      avatar_url = excluded.avatar_url;
  return new;
end;
$$;

-- Trigger to execute the function when auth.users grows
create or replace trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
