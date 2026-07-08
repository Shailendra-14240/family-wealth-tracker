# Family Wealth Tracker

A PWA web app for tracking family investments, accounts, and net worth. Shared between two users (Shailendra and father), no separate logins — everyone sees the same data.

## Tech Stack

- **Frontend**: React + Vite + Tailwind CSS + React Router v7
- **Backend**: Supabase (PostgreSQL, free tier)
- **Deployment**: Vercel (auto-deploys from GitHub main branch)
- **PWA**: Works offline, installable to home screen on iOS/Android

## Live URL

https://family-wealth-tracker-psi.vercel.app/

## GitHub

https://github.com/Shailendra-14240/family-wealth-tracker

## Supabase

- Project URL: https://qcrffbsralnzlqqpzsri.supabase.co
- Tables: accounts, holdings, transactions, net_worth_snapshots
- No RLS (public access — shared data)
- Anon key is set as VITE_SUPABASE_ANON_KEY in Vercel env vars

## Architecture Decisions

- **No auth** — single shared data store for both users
- **"brokerage" renamed to "demat"** in account types
- **CSV upload** for trade history (format: date,type,symbol,qty,price)
- **Fixed bottom nav** with z-10 and pb-28 padding for mobile

## Project Structure

```
├── index.html
├── vite.config.js              # Vite + PWA config, server.host: true
├── tailwind.config.js
├── .env.example
├── .gitignore
├── supabase/schema.sql         # DB schema (no auth version)
├── public/icons/               # PWA icons (192, 512)
└── src/
    ├── main.jsx                # React entry
    ├── App.jsx                 # Router (/, /accounts, /holdings, /transactions)
    ├── index.css               # Tailwind imports
    ├── lib/supabase.js         # Supabase client (null if no env vars)
    ├── components/
    │   └── Layout.jsx          # App shell with bottom nav
    └── pages/
        ├── Dashboard.jsx       # Net worth, summary cards, accounts list
        ├── Accounts.jsx        # CRUD accounts
        ├── Holdings.jsx        # Stock holdings list
        └── Transactions.jsx    # Manual entry + CSV upload
```

## To Run Locally

```bash
cd family-wealth-tracker
npm install
npm run dev        # http://localhost:5173
npm run build      # Production build → dist/
```

## CSV Parser Details

### Column mapping (Zerodha format)
| CSV column | Mapped to | Purpose |
|---|---|---|
| `trade_date` | `date` | |
| `symbol` / `tradingsymbol` | `symbol` | Strips trailing `#`, digits |
| `trade_type` / `transaction_type` | `type` | buy/sell |
| `quantity` | `qty` | |
| `price` / `average_price` | `price` | |
| `trade_id` | `order_id` (DB) | **Used for dedup** (unique per fill) |
| `order_id` | `_raw_order_id` (internal) | Raw CSV order_id, stripped before insert; stored in `notes` as `source: filename` |
| `order_execution_time` / `trade_time` | `order_execution_time` | |

### Sentinel values
`DISCREPANT` in `trade_id` or `order_id` → treated as null (skips order_id dedup). Only fingerprint dedup `(date,symbol,type,qty,price,account_id)` applies.

### Upload dedup order
1. **Order ID**: Skip if `order_id` exists in DB (non-null, non-sentinel only)
2. **Fingerprint**: Skip if exact `(date,symbol,type,qty,price,account_id)` matches existing

### Source file tracking
Filename stored in `notes` as `source: filename.csv`. A dedicated `source_file` column exists in `schema.sql` but needs migration.

## Known DB Issues & Fixes

### VBL (Varun Beverages) — Account 1
Two stock splits:
- 2023-06-15: 1:2 (qty×2, price÷2)
- 2024-09-12: 1:2.5 (qty×2.5, price÷2.5)

**Fixes applied** (2026-07-06):
- Inserted 7 missing sell rows for 2024-06-06 (was dedup bug — 11 qty missing)
- Deleted phantom `2026-04-15 buy 377@445.35` (id=88, wrong account)
- Deleted fake `TRANSFEROUT sell 1096@504.45` (id=825, wrong account)
- Set `order_id=null` on 12 rows with sentinel `DISCREPANT` (ids: 827-838)

**Post-fix counts**: Buys=1,168 | Sells=92 | Remaining=1,076 (raw, before corp actions)

### Pending migration
Run in Supabase SQL editor:
```sql
-- Add missing columns
alter table transactions add column if not exists source_order_id text;
alter table transactions add column if not exists source_file text;
create index if not exists idx_transactions_source_file on transactions(source_file);

-- Fix unique index (non-unique to allow same order_id across fills)
drop index if exists idx_transactions_order_id;
create index if not exists idx_transactions_order_id on transactions(order_id) where order_id is not null;
```

## Features Still to Build

- [ ] **Net worth trend chart** (using recharts + net_worth_snapshots table)
- [ ] **Holdings auto-calculation** from transactions (not manual entry)
- [ ] **Current LTP prices** — integrate with an API (e.g., Yahoo Finance, Kite)
- [ ] **Edit/delete accounts and transactions**
- [ ] **Export data to CSV**
- [ ] **Net worth history** — auto-snapshot daily
- [ ] **Categories for transactions** (dividend, interest, etc.)
- [ ] **Better mobile experience** (keyboard handling, pull-to-refresh)
- [ ] **Add father as a separate "owner" tag** per account/transaction (optional)
