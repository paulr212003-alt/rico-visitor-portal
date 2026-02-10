# RICO Visitor Portal: External URL Hosting (Render + MongoDB Atlas)

This project is prepared so anyone with the final external URL can open it.

## What is already done in code
1. `Frontend/script.js` uses same-origin API calls (`/api`) so it works correctly on cloud URL.
2. `Backend/server.js` reads environment variables via `dotenv`.
3. `Backend/server.js` exposes a health endpoint at `/health`.
4. `package.json` now enforces Node `>=20.19.0` (required by `mongoose@9`).
5. `render.yaml` was added for one-click Render blueprint deployment.

## Steps you must do manually
1. In MongoDB Atlas, open `Database Access` and create or update a database user.
2. In MongoDB Atlas, open `Network Access` and add `0.0.0.0/0` so Render can connect.
3. Build your connection string with DB name `visitorDB`.
4. Push this project to your GitHub repo.
5. In Render, click `New` -> `Blueprint`, then select your GitHub repo.
6. Render will read `render.yaml` automatically.
7. In Render environment variables, set:
`MONGO_URI=<your Atlas URI with /visitorDB>`
`ADMIN_PASSWORD=<strong password>`
`CORS_ORIGINS=https://<your-render-service>.onrender.com`
8. Deploy.
9. Open:
`https://<your-render-service>.onrender.com/health`
`https://<your-render-service>.onrender.com/`
10. Share this external URL with users.

## Atlas URI format
Use this exact format:
`mongodb+srv://<db_username>:<db_password>@<cluster-host>/visitorDB?retryWrites=true&w=majority&appName=<cluster-name>`

## Verification checklist after deploy
1. `/health` returns JSON with `"status":"ok"`.
2. Home page loads without console errors.
3. Creating a pass saves data to Atlas `visitorDB`.
4. Validate pass and mark exit both work.

## Common issues
1. `MongooseServerSelectionError`: Atlas IP access list is missing `0.0.0.0/0`.
2. `Authentication failed`: wrong Atlas username/password in `MONGO_URI`.
3. Blank page with API failures: `CORS_ORIGINS` not matching Render domain.
4. Build/runtime version errors: ensure Render uses Node `20.19.0` or higher.
