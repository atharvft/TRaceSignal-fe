create extension if not exists pgcrypto;

create table if not exists cases (
  id uuid primary key default gen_random_uuid(), case_ref text not null, chain text not null,
  wallet_address text not null, incident_date date, amount numeric, notes text,
  status text not null default 'New', created_by uuid, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists traces (
  id uuid primary key default gen_random_uuid(), case_id uuid not null references cases(id) on delete cascade,
  status text not null, progress int not null default 0, params jsonb, snapshot jsonb, summary jsonb,
  started_at timestamptz default now(), finished_at timestamptz, error text
);
create table if not exists audit_log (
  id uuid primary key default gen_random_uuid(), user_id uuid, action text not null, entity text, entity_id text,
  provider text, details jsonb, ts timestamptz not null default now()
);
create table if not exists vasp_addresses (
  id uuid primary key default gen_random_uuid(), vasp_name text not null, chain text not null, address text not null,
  type text not null check (type in ('EXCHANGE','CUSTODIAL')), source text, source_url text, added_by uuid,
  added_at timestamptz not null default now(), is_holdout boolean not null default false
);
create table if not exists mixer_addresses (id uuid primary key default gen_random_uuid(), chain text not null, address text not null, name text, source_url text);
create table if not exists bridge_contracts (id uuid primary key default gen_random_uuid(), chain text not null, address text not null, name text, source_url text);
create table if not exists reviews (id uuid primary key default gen_random_uuid(), trace_id uuid references traces(id) on delete cascade, candidate_id text not null, decision text not null, note text, created_at timestamptz not null default now());
create table if not exists sahyog_requests (id uuid primary key default gen_random_uuid(), case_id uuid references cases(id) on delete cascade, trace_id uuid references traces(id), candidate_id text not null, report jsonb, status text not null default 'SENT', created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create table if not exists validation_runs (id uuid primary key default gen_random_uuid(), params jsonb, recovered int, total int, false_positives int, results jsonb, ts timestamptz not null default now());

alter table cases enable row level security;
alter table traces enable row level security;
alter table audit_log enable row level security;
alter table vasp_addresses enable row level security;
alter table mixer_addresses enable row level security;
alter table bridge_contracts enable row level security;
alter table reviews enable row level security;
alter table sahyog_requests enable row level security;
alter table validation_runs enable row level security;

create policy "authenticated users can read cases" on cases for select to authenticated using (true);
create policy "authenticated users can create cases" on cases for insert to authenticated with check (true);
create policy "authenticated users can read traces" on traces for select to authenticated using (true);
create policy "authenticated users can read reference data" on vasp_addresses for select to authenticated using (true);
create policy "authenticated users can read mixers" on mixer_addresses for select to authenticated using (true);
create policy "authenticated users can read bridges" on bridge_contracts for select to authenticated using (true);
create policy "authenticated users can read reviews" on reviews for select to authenticated using (true);
create policy "authenticated users can read sahyog requests" on sahyog_requests for select to authenticated using (true);
create policy "authenticated users can read validation" on validation_runs for select to authenticated using (true);
