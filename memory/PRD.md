# FoodPlug — Admin Dashboard PRD

## Original problem statement
> "modify this app to have a beautiful dashboard for this app that shows customers statistics for the day/ selected month including money made, total users, also including all sales, and to be able to add customers and also to add sales representative"

## User personas
- **Admin** — owns the operation; adds customers & sales reps, watches revenue, meals served, top customers, all sales.
- **Sales Rep** — on-site cashier; searches customer by name/PIN, records soft/hard meals and one-off visitor sales.

## Architecture
- **Backend:** FastAPI + Motor (MongoDB). JWT (HS256, 7d) via `/api/auth/login`. bcrypt password hashing.
- **Frontend:** React 19, react-router v7, Tailwind, shadcn/ui, Recharts. Auth token stored in localStorage under `foodplug_token`; user under `foodplug_user`.
- **Design system:** Cabinet Grotesk (display) + Manrope (body). Palette: terracotta `#D95D39` / sage `#8A9A5B` / clay `#D4A373` on cream `#F9F8F6` background.

## What's been implemented (Feb 2026)
- JWT auth with role-based routing (`admin` → `/admin`, `sales` → `/sales`).
- Seeded users: `admin@foodplug.com / admin123`, `sales@foodplug.com / sales123`.
- Seeded 3 sample customers.
- **Admin Dashboard** (`/admin`):
  - KPI cards: Revenue, Total customers, Sales reps, Visitor sales.
  - Period toggle: Today / Month / All time; month dropdown for last 12 months.
  - Revenue area chart (Recharts).
  - Top 5 customers by spend.
  - Recent sales table.
- **Customers** (`/admin/customers`): list, search, add (auto 4-digit PIN), delete, per-customer meals/spend.
- **Sales Reps** (`/admin/agents`): list, add (name/email/contact/password), delete.
- **All Sales** (`/admin/sales`): full ledger, agent filter, search, filtered revenue total.
- **Sales Agent POS** (`/sales`): search by name, PIN pad, visitor sale form, soft/hard food registration, per-customer history.
- Testing: 29/29 backend pytest passing; end-to-end Playwright flow passing.

## Prioritized backlog
- **P1** — Site/contractor management (currently free-text). Grouping stats by contractor.
- **P1** — Export sales to CSV/Excel; monthly PDF report.
- **P2** — Fingerprint SDK integration for hardware devices.
- **P2** — Multi-currency support beyond ₦.
- **P2** — Refund / void a sale.
- **P3** — Split `SalesAgentPage.jsx` into smaller subcomponents (518 lines).
