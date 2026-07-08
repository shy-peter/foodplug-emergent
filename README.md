# FoodPlug

This project now defaults to Appwrite-native mode (no separate Express backend required for normal app flows).

## Run

- `npm run dev` starts the frontend only.
- `npm run dev:full` starts frontend + legacy backend.

## Frontend env

Create `frontend/.env` from `frontend/.env.example`.

- `REACT_APP_USE_AUTH_API=false` keeps Appwrite-native mode (recommended).
- Set `REACT_APP_USE_AUTH_API=true` to use the legacy custom backend endpoints.

## Migration status

- Authentication/session and data flows run through Appwrite SDK by default.
- Legacy backend remains available for compatibility while you complete full function-based migration.

## AI handoff prompt

Use the prompt below when you want another AI to quickly understand this project and continue work safely.

```text
You are working on FoodPlug, a food-sales platform with a web admin dashboard and a mobile sales app.

Goal of the product:
- Track food sales for two buyer types: registered customers and visitors.
- Allow sales reps to record transactions.
- Let admins monitor revenue, outstanding balances, payments, customers, agents, and branches/locations.

High-level architecture:
- Frontend web app: React + Vite in frontend/
- Mobile app: Expo React Native in foodplug-mobile/
- Data/auth: Appwrite-native (primary mode)
- Legacy backend in backend/ exists for compatibility but is not required for normal Appwrite-native flows.

Core business rules:
- Outstanding balance belongs to registered customers based on customer sales.
- Total collected/revenue logic includes visitor sales plus cleared customer balance payments (based on selected period/filter).
- Payment entries should only reflect valid balance payments, and overpayment must be blocked.
- Dashboard outstanding balance represents total owed across registered users after credited payments.

Primary data entities (Appwrite collections):
- organizations
- users (admins and sales reps)
- customers
- sales
- payment_history
- branches

Key web modules:
- Dashboard: KPIs, charts, recent sales, balance-payment tab
- Customers: search/filter, balance view, branch/location filtering, export
- Sales reps: rep management with assigned branch
- Transactions: sales and payment history views
- Locations/Branch: create and manage branch/sub-branch pairs

App pipeline (end-to-end):
1. Organization and users are provisioned in Appwrite.
2. Admin creates branches (branch_name + sub_branch_name).
3. Admin creates sales reps and customers and assigns location/branch.
4. Sales reps record transactions (customer or visitor sale).
5. Sales documents are stored in Appwrite and reflected in dashboard/transactions.
6. For customers with debt, admin records balance payments.
7. Payment records update payment_history and reduce customer outstanding.
8. Dashboard aggregates totals by period and optional location filter.
9. Admin reviews customers, balances, transactions, and exports reports.

Routing/deployment notes:
- Web app uses React Router browser history mode.
- Production host must rewrite unknown routes to index.html to avoid refresh 404s on nested routes.

Environment expectations:
- Web uses VITE_APPWRITE_* variables in frontend/.env.
- Mobile uses EXPO_PUBLIC_APPWRITE_* variables in foodplug-mobile.
- Collection ID variables can be omitted when using default names shown above.

If you make changes:
- Preserve existing business rules unless explicitly asked to change them.
- Run a production build for affected app(s) after edits.
- Prefer minimal diffs and avoid unrelated refactors.
```
