# Auth Backend

This backend handles production-safe authentication flows that should not run directly in the browser.

## Endpoints

- POST /api/auth/register-organization
- POST /api/auth/login
- GET /health

## Setup

1. Copy `.env.example` to `.env` in this folder.
2. Set Appwrite variables, especially `APPWRITE_API_KEY`.
3. Set `FRONTEND_ORIGIN` to your frontend URL.
   - Multiple origins are supported as comma-separated values.
   - Example: `FRONTEND_ORIGIN=http://localhost:3000,https://your-app.vercel.app`
4. Install deps from repo root and backend:
   - `npm install`
   - `npm --prefix foodplug-mobile/backend install`
5. Start both frontend and backend from root:
   - `npm run dev`

## Security note

Keep `APPWRITE_API_KEY` only in backend `.env`. Never expose it in frontend env files.
