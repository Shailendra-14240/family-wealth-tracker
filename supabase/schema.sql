-- Family Wealth Tracker — Supabase Schema
-- Run this in the Supabase SQL Editor after creating a project.

-- 1. Accounts
create table accounts (
  id         bigint generated always as identity primary key,
  user_id    uuid references auth.users(id) on delete cascade not null,
  name       text not null,
  type       text not null check (type in ('brokerage','savings','loan','mutual_fund','crypto','other')),
  balance    numeric(14,2) not null default 0,
  created_at timestamptz default now()
);

alter table accounts enable row level security;

create policy "Users can read own accounts"
  on accounts for select using (auth.uid() = user_id);

create policy "Users can insert own accounts"
  on accounts for insert with check (auth.uid() = user_id);

create policy "Users can update own accounts"
  on accounts for update using (auth.uid() = user_id);

-- 2. Holdings
create table holdings (
  id         bigint generated always as identity primary key,
  user_id    uuid references auth.users(id) on delete cascade not null,
  account_id bigint references accounts(id) on delete cascade,
  symbol     text not null,
  qty        numeric(12,2) not null,
  avg_price  numeric(12,2) not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table holdings enable row level security;

create policy "Users can read own holdings"
  on holdings for select using (auth.uid() = user_id);

create policy "Users can insert own holdings"
  on holdings for insert with check (auth.uid() = user_id);

create policy "Users can update own holdings"
  on holdings for update using (auth.uid() = user_id);

-- 3. Transactions
create table transactions (
  id         bigint generated always as identity primary key,
  user_id    uuid references auth.users(id) on delete cascade not null,
  account_id bigint references accounts(id) on delete cascade,
  date       date not null,
  type       text not null check (type in ('buy','sell')),
  symbol     text not null,
  qty        numeric(12,2) not null,
  price      numeric(12,2) not null,
  notes      text,
  created_at timestamptz default now()
);

alter table transactions enable row level security;

create policy "Users can read own transactions"
  on transactions for select using (auth.uid() = user_id);

create policy "Users can insert own transactions"
  on transactions for insert with check (auth.uid() = user_id);

-- 4. Net worth snapshots (for trend chart)
create table net_worth_snapshots (
  id         bigint generated always as identity primary key,
  user_id    uuid references auth.users(id) on delete cascade not null,
  date       date not null default current_date,
  net_worth  numeric(14,2) not null,
  assets     numeric(14,2) not null,
  liabilities numeric(14,2) not null,
  created_at timestamptz default now(),
  unique (user_id, date)
);

alter table net_worth_snapshots enable row level security;

create policy "Users can read own snapshots"
  on net_worth_snapshots for select using (auth.uid() = user_id);

create policy "Users can insert own snapshots"
  on net_worth_snapshots for insert with check (auth.uid() = user_id);
