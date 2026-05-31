-- ==========================================
-- REPOSITORY INTELLIGENCE SCHEMA
-- Full-codebase analysis, file intelligence, and report persistence.
-- Run after database/newSupabase.sql.
-- ==========================================

create type public.repository_scan_status as enum ('queued', 'running', 'completed', 'failed');
create type public.repository_issue_severity as enum ('info', 'low', 'medium', 'high', 'critical');
create type public.repository_issue_category as enum (
  'architecture',
  'code_quality',
  'performance',
  'security',
  'scalability',
  'devops'
);

alter table public.repositories
  add column if not exists default_branch text,
  add column if not exists github_repo_id bigint,
  add column if not exists last_analyzed_at timestamp with time zone;

create table public.repository_scans (
  id uuid primary key default gen_random_uuid(),
  repo_id uuid references public.repositories(id) on delete cascade not null,
  user_id uuid references public.users(id) on delete cascade not null,
  repo_owner text not null,
  repo_name text not null,
  branch text not null,
  status public.repository_scan_status default 'queued' not null,
  progress integer default 0 not null check (progress >= 0 and progress <= 100),
  current_stage text default 'queued' not null,
  error_message text,
  commit_sha text,
  total_files integer default 0 not null,
  analyzed_files integer default 0 not null,
  skipped_files integer default 0 not null,
  total_lines integer default 0 not null,
  health_score integer check (health_score >= 0 and health_score <= 100),
  architecture_score integer check (architecture_score >= 0 and architecture_score <= 100),
  engineering_quality_score integer check (engineering_quality_score >= 0 and engineering_quality_score <= 100),
  maintainability_score integer check (maintainability_score >= 0 and maintainability_score <= 100),
  scalability_score integer check (scalability_score >= 0 and scalability_score <= 100),
  security_score integer check (security_score >= 0 and security_score <= 100),
  technical_debt_score integer check (technical_debt_score >= 0 and technical_debt_score <= 100),
  risk_distribution jsonb default '[]'::jsonb not null,
  complexity_heatmap jsonb default '[]'::jsonb not null,
  graph jsonb default '{}'::jsonb not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  started_at timestamp with time zone,
  completed_at timestamp with time zone
);

create table public.file_analyses (
  id uuid primary key default gen_random_uuid(),
  scan_id uuid references public.repository_scans(id) on delete cascade not null,
  repo_id uuid references public.repositories(id) on delete cascade not null,
  file_path text not null,
  language text not null,
  purpose text,
  lines integer default 0 not null,
  complexity integer default 0 not null,
  risk_score integer check (risk_score >= 0 and risk_score <= 100),
  maintainability_score integer check (maintainability_score >= 0 and maintainability_score <= 100),
  imports jsonb default '[]'::jsonb not null,
  exports jsonb default '[]'::jsonb not null,
  issues jsonb default '[]'::jsonb not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  unique(scan_id, file_path)
);

create table public.architecture_reports (
  id uuid primary key default gen_random_uuid(),
  scan_id uuid references public.repository_scans(id) on delete cascade not null unique,
  repo_id uuid references public.repositories(id) on delete cascade not null,
  summary text not null,
  production_readiness text,
  priority_fixes jsonb default '[]'::jsonb not null,
  refactoring_suggestions jsonb default '[]'::jsonb not null,
  recommendations jsonb default '[]'::jsonb not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create table public.security_reports (
  id uuid primary key default gen_random_uuid(),
  scan_id uuid references public.repository_scans(id) on delete cascade not null unique,
  repo_id uuid references public.repositories(id) on delete cascade not null,
  score integer check (score >= 0 and score <= 100),
  critical_findings integer default 0 not null,
  high_findings integer default 0 not null,
  findings jsonb default '[]'::jsonb not null,
  recommendations jsonb default '[]'::jsonb not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create table public.technical_debt_reports (
  id uuid primary key default gen_random_uuid(),
  scan_id uuid references public.repository_scans(id) on delete cascade not null unique,
  repo_id uuid references public.repositories(id) on delete cascade not null,
  score integer check (score >= 0 and score <= 100),
  hotspots jsonb default '[]'::jsonb not null,
  duplicated_logic jsonb default '[]'::jsonb not null,
  refactoring_plan jsonb default '[]'::jsonb not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create index repository_scans_repo_created_idx on public.repository_scans(repo_id, created_at desc);
create index repository_scans_user_created_idx on public.repository_scans(user_id, created_at desc);
create index file_analyses_scan_risk_idx on public.file_analyses(scan_id, risk_score desc);

alter table public.repository_scans enable row level security;
alter table public.file_analyses enable row level security;
alter table public.architecture_reports enable row level security;
alter table public.security_reports enable row level security;
alter table public.technical_debt_reports enable row level security;

create policy "Users can manage own repository scans"
  on public.repository_scans for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can manage own file analyses"
  on public.file_analyses for all
  using (
    exists (
      select 1 from public.repository_scans s
      where s.id = scan_id and s.user_id = auth.uid()
    )
  );

create policy "Users can manage own architecture reports"
  on public.architecture_reports for all
  using (
    exists (
      select 1 from public.repository_scans s
      where s.id = scan_id and s.user_id = auth.uid()
    )
  );

create policy "Users can manage own security reports"
  on public.security_reports for all
  using (
    exists (
      select 1 from public.repository_scans s
      where s.id = scan_id and s.user_id = auth.uid()
    )
  );

create policy "Users can manage own technical debt reports"
  on public.technical_debt_reports for all
  using (
    exists (
      select 1 from public.repository_scans s
      where s.id = scan_id and s.user_id = auth.uid()
    )
  );
