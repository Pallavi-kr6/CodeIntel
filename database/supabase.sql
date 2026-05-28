create table users (

id uuid primary key default gen_random_uuid(),

email text unique,

name text,

created_at timestamp
default now()

);


create table repositories (

id uuid primary key
default gen_random_uuid(),

user_id uuid references users(id),

repo_name text,

created_at timestamp
default now()

);


create table reviews (

id uuid primary key
default gen_random_uuid(),

repo_id uuid references repositories(id),

risk_score integer,

summary text,

created_at timestamp
default now()

);


create table issues (

id uuid primary key
default gen_random_uuid(),

review_id uuid references reviews(id),

severity text,

description text
);



alter table repositories
enable row level security;


create policy
"Users can insert own repos"

on repositories

for insert

with check (true);



create policy
"Users can view own repos"

on repositories

for select

using (true);