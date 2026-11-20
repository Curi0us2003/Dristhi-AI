# 02 — Deploy to Cloud Run and Firebase Hosting

**Branch:** `chore/deploy-cloud-run` · **Depends on:** 01 · **Size:** small code, several HUMAN steps

## Prompt

```
Read CLAUDE.md, docs/architecture.md and docs/tasks/02-deploy-cloud-run.md, then do task 02.
Give me the HUMAN steps as a numbered checklist with the exact commands at the end.
```

## Goal

Run the backend on Cloud Run in `asia-south1` and let the frontend on Firebase Hosting call it
directly over HTTPS, removing the Cloud Function proxy.

## Steps (code)

1. `backend/deploy.sh` and `backend/deploy.ps1`:
   - take an image tag argument (`-t v3`), default to the short git commit hash, never `latest`;
   - deploy with `--region asia-south1 --cpu 1 --memory 2Gi --min-instances 1 --max-instances 1
     --no-cpu-throttling --timeout 3600 --port 8080 --allow-unauthenticated
     --set-env-vars ENV=production,CORS_ORIGINS=<value>`;
   - print the service URL at the end.
2. `backend/app.py`: read allowed origins from `CORS_ORIGINS` (comma-separated); default to
   `http://localhost:9002,http://127.0.0.1:9002` when unset. Do not use `*`.
3. Frontend:
   - `.env.example`: `NEXT_PUBLIC_BACKEND_URL` documented as the Cloud Run URL in production.
   - `firebase.json`: remove the `/api/**` rewrite and the `functions` block.
   - `package.json`: `deploy` becomes `npm run build && firebase deploy --only hosting,firestore`.
   - Delete `frontend/functions/` (the proxy) after confirming nothing else imports it.
4. Add `backend/scripts/scale.sh` and `scale.ps1` with two commands, `up` (min 1) and `down`
   (min 0), for switching the service on before and off after events.
5. Update `README.md` (Deployment section) to match.

## Scope

In: scripts, CORS, Firebase config, docs. Out: database, Secret Manager (task 03).

## Acceptance criteria

- `deploy.sh -p <project>` deploys a versioned image and prints the URL.
- The deployed frontend loads the dashboard and the live video works for more than 5 minutes.
- No request from the deployed frontend goes to `/api/**` on the Firebase domain.

## Verify

```
bash -n backend/deploy.sh && bash -n backend/scripts/scale.sh
cd frontend && npm run build
```

## HUMAN (owner of the GCP project)

1. Billing → Budgets & alerts: budget with alerts at 50%, 90% and 100%.
2. `gcloud auth login` · `gcloud config set project <id>` · `gcloud config set run/region asia-south1`
3. `gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com secretmanager.googleapis.com`
4. `gcloud artifacts repositories create crowd-monitoring --repository-format=docker --location=asia-south1`
   and add a cleanup policy keeping the last 5 images.
5. Run the deploy script; open `<URL>/api/health`.
6. Set `NEXT_PUBLIC_BACKEND_URL` in `frontend/.env`, run `npm run deploy`.
7. Firebase Auth → Settings → Authorized domains: add the hosting domain.
8. Between events: `scale down`; before events: `scale up`.
