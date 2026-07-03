-- Family Wealth Tracker — Shared Schema (no auth)

create table accounts (
  id         bigint generated always as identity primary key,
  name       text not null,
  type       text not null check (type in ('demat','savings','loan','mutual_fund','crypto','other')),
  balance    numeric(14,2) not null default 0,
  created_at timestamptz default now()
);

create table holdings (
  id         bigint generated always as identity primary key,
  account_id bigint references accounts(id) on delete cascade,
  symbol     text not null,
  qty        numeric(12,2) not null,
  avg_price  numeric(12,2) not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table transactions (
  id                  bigint generated always as identity primary key,
  account_id          bigint references accounts(id) on delete cascade,
  date                date not null,
  type                text not null check (type in ('buy','sell')),
  symbol              text not null,
  qty                 numeric(12,2) not null,
  price               numeric(12,2) not null,
  order_id            text,
  order_execution_time timestamptz,
  notes               text,
  created_at          timestamptz default now()
);

create unique index idx_transactions_order_id on transactions(order_id) where order_id is not null;

create table corporate_actions (
  id          bigint generated always as identity primary key,
  date        date not null,
  action      text not null check (action in ('bonus', 'split', 'merger', 'demerger')),
  symbol      text not null,
  new_symbol  text,                          -- for merger
  ratio_from  numeric(12,4) not null,        -- e.g. 1 for 1:1 bonus
  ratio_to    numeric(12,4) not null,         -- e.g. 1 for 1:1 bonus
  retained_ratio numeric(12,4),          -- for demerger: parent shares retained per ratio_from (0 = complete)
  cost_share    numeric(12,4),            -- for demerger: cost apportionment weight (omit for equal split)
  notes       text,
  created_at  timestamptz default now()
);

create table net_worth_snapshots (
  id          bigint generated always as identity primary key,
  date        date not null default current_date,
  net_worth   numeric(14,2) not null,
  assets      numeric(14,2) not null,
  liabilities numeric(14,2) not null,
  created_at  timestamptz default now(),
  unique (date)
);

create table fund_movements (
  id         bigint generated always as identity primary key,
  account_id bigint references accounts(id) on delete cascade,
  date       date not null,
  type       text not null check (type in ('deposit', 'withdrawal')),
  amount     numeric(14,2) not null,
  notes      text,
  created_at timestamptz default now()
);

create table portfolio_snapshots (
  id          bigint generated always as identity primary key,
  account_id  bigint references accounts(id) on delete cascade,
  date        date not null,
  total_value numeric(14,2) not null,
  method      text default 'manual',
  notes       text,
  created_at  timestamptz default now()
);
