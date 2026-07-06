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
