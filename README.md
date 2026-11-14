# Dristhi AI: Event Guardian 🛡️

**Dristhi AI** is an AI-powered situational-awareness platform for crowd safety at large events.
CCTV feeds are analysed in real time with **YOLOv8** person detection, and a **Next.js** command
center lets security teams watch crowd density, receive alerts, manage attendee grievances, and
let a **Gemini**-powered agent propose guard, ambulance and medical-staff deployments.

![Dristhi AI](https://res.cloudinary.com/dams0r5uk/image/upload/v1753526208/Picture1_wlf2zp.jpg)

---

## Contents

- [Features](#features)
- [Architecture](#architecture)
- [Project structure](#project-structure)
- [Quick start (local)](#quick-start-local)
- [Configuration](#configuration)
- [Backend API](#backend-api)
- [Deployment](#deployment)
- [Screenshots](#screenshots)
- [Security notes](#security-notes)

---

## Features

### Operator / Admin
| Page | What it does |
|------|--------------|
| **Dashboard** (`/dashboard`) | Live counters (guards, alerts, grievances), crowd analytics charts, guard roster management, live camera snapshots, **AI event summary** and the **Autonomous Command Agent** |
| **Live Feed** (`/live-feed`) | MJPEG camera streams with automatic reconnection and status indicators |
| **Alerts** (`/alerts`) | Critical / warning / predicted congestion alerts with recommendations |
| **Map View** (`/map-view`) | Google Maps view with live crowd density per camera location |
| **Grievances** (`/grievances`) | Resolve medical-emergency and missing-person reports submitted by attendees |

**Autonomous Command Agent** – Gemini analyses alerts, guards, grievances, ambulances and medical
staff, then proposes actions (reassign guard, deploy ambulance, assign medical staff) that the
operator can approve. Works offline with a rule-based fallback plan if no AI key is configured.

### Attendee / User (`/user/dashboard`)
- **AI chatbot** that triages messages (medical emergency, missing person, directions) and opens the right form automatically
- **Medical-emergency** and **missing-person** report forms (with photo upload)
- Track the status of your own reports and receive notifications

### Platform
- Role-based login (Operator vs Attendee) with Firebase Auth (email/password + Google)
- Light / dark theme
- Fully static frontend build (Firebase Hosting) + containerised Python backend (Cloud Run / VM)

---

## Architecture

```
 ┌────────────────────────────┐        ┌───────────────────────────────┐
 │  Next.js static frontend   │  /api  │  FastAPI backend (backend/)   │
 │  (Firebase Hosting)        ├───────►│  • YOLOv8n person detection   │
 │  • Firebase Auth/Firestore │ proxy  │  • 1 thread per CCTV feed     │
 │  • Gemini REST (browser)   │  (CF)  │  • analytics, alerts, MJPEG   │
 └─────────────┬──────────────┘        └───────────────┬───────────────┘
               │                                       │
        Firebase Firestore                     CCTV sources (feeds.json)
  users · admin · guards · grievances          HTTP(S) / RTSP / local .mp4
  ambulances · medical_staff · notifications
```

- In production, Firebase Hosting rewrites `/api/**` to a Cloud Function (`frontend/functions`)
  that transparently proxies to the backend, so the browser never needs mixed-content HTTP.
- AI features call the Gemini REST API directly from the browser (no server runtime required).

---

## Project structure

```
.
├── backend/
│   ├── app.py              # FastAPI app: detection threads + REST API
│   ├── feeds.json          # CCTV feed definitions (edit this to add cameras)
│   ├── yolov8n.pt          # YOLOv8 nano weights (auto-downloaded if missing)
│   ├── requirements.txt
│   ├── Dockerfile          # CPU-only image, listens on $PORT (8080)
│   └── deploy.sh / deploy.ps1   # One-command Cloud Run deployment
└── frontend/
    ├── src/
    │   ├── app/            # Next.js App Router pages
    │   │   ├── (app)/      # Operator pages: dashboard, live-feed, alerts, map-view, grievances
    │   │   ├── user/       # Attendee dashboard
    │   │   └── login, signup
    │   ├── ai/             # Gemini client + chatbot / autonomous agent / summary flows
    │   ├── components/     # UI (shadcn/ui), map, chatbot, report forms
    │   ├── contexts/ hooks/ lib/ services/ types/
    │   └── scripts/        # Firestore seed + create-admin scripts
    ├── functions/          # Cloud Function: /api/** → backend proxy
    ├── firebase.json       # Hosting, rewrites, cache headers
    ├── firestore.rules
    └── .env.example
```

---

## Quick start (local)

### Prerequisites
- **Python 3.10+**
- **Node.js 20+**
- A **Firebase project** with Authentication (Email/Password + Google) and Firestore enabled
- Optional: Google Maps JavaScript API key, Gemini API key ([Google AI Studio](https://aistudio.google.com/apikey))

### 1. Backend

```bash
cd backend
python -m venv .venv
# Windows: .venv\Scripts\activate    macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
python app.py                     # → http://localhost:5000  (Swagger UI: /docs)
```

> **Video sources:** edit `backend/feeds.json` so each feed's `url` points to a video you can
> access – a local file (e.g. `videos/gate.mp4`, relative to `backend/`), an HTTP(S) URL or an
> RTSP camera. The sample Cloudinary URLs from the original project currently return **HTTP 401**,
> so replace them with your own footage.

### 2. Frontend

```bash
cd frontend
npm install
cp .env.example .env              # then fill in your Firebase / Maps / Gemini keys
npm run db:seed                   # optional: demo guards, ambulances, medical staff, grievances
npm run create-admin -- --email ops@example.com --password "ChangeMe123" --username ops --employee-id D001
npm run dev                       # → http://localhost:9002
```

Log in as **Operator** with the email, password, username and employee ID you just created, or
**Sign up** as an attendee.

### Useful scripts (frontend)

| Command | Description |
|---------|-------------|
| `npm run dev` | Dev server with Turbopack on port 9002 |
| `npm run build` | Static production build into `out/` |
| `npm start` | Serve the built `out/` folder locally |
| `npm run typecheck` | TypeScript check |
| `npm run db:seed` | Seed guards, ambulances, medical staff and grievances |
| `npm run db:seed:medical` / `db:seed:ambulances` | Seed a single collection |
| `npm run create-admin -- …` | Create an Operator account (Auth user + `admin` doc) |
| `npm run deploy` | Build and deploy hosting, functions and Firestore rules |

---

## Configuration

### Frontend – `frontend/.env`

| Variable | Required | Description |
|----------|----------|-------------|
| `NEXT_PUBLIC_FIREBASE_*` | ✅ | Firebase web-app config (Console → Project settings) |
| `NEXT_PUBLIC_BACKEND_URL` | | Backend origin. Unset → `http://127.0.0.1:5000`. **Empty** → same-origin `/api` (use this on Firebase Hosting) |
| `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` | | Enables the Map View page |
| `NEXT_PUBLIC_GEMINI_API_KEY` | | Gemini key for chatbot, agent and AI summary. Falls back to the Firebase API key; with no key, offline fallbacks are used |
| `NEXT_PUBLIC_GEMINI_MODEL` | | Gemini model id (default `gemini-2.5-flash`) |

### Backend – environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `5000` (`8080` in Docker) | HTTP port |
| `ENV` | – | `production` disables auto-reload |
| `FEEDS_FILE` | `backend/feeds.json` | Alternative feed definition file |

Alert thresholds can be changed at runtime via `POST /api/config/thresholds`.

### Cloud Function – `frontend/functions/.env`

| Variable | Description |
|----------|-------------|
| `BACKEND_URL` | Public origin of the FastAPI backend that `/api/**` is proxied to |

---

## Backend API

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/health` | API, model and feed status |
| GET | `/api/feeds` · `/api/feeds/{id}` | Current counts / per-feed details and history |
| GET | `/api/video/stream/{id}` | Live MJPEG video stream |
| GET | `/api/video/snapshot/{id}` | Single JPEG frame |
| GET | `/api/video/health/{id}` · `/api/video/info` | Source accessibility and metadata |
| GET | `/api/analytics/summary` | Aggregate density and trend analytics |
| GET | `/api/alerts` · `/api/predictions` | Current alerts and short-term congestion predictions |
| GET | `/api/heatmap` | Geo-tagged density for the map |
| GET | `/api/export/csv` | Download analytics history as CSV |
| GET / POST | `/api/config/thresholds` | Read / update alert and congestion thresholds |
| POST | `/api/controls/start` · `/api/controls/stop` | Start / stop feed processing |
| GET | `/api/stream/updates` | Server-Sent Events with live feed data |

Interactive docs are available at `/docs` when the backend is running.

---

## Deployment

### Backend → Google Cloud Run

```bash
cd backend
./deploy.sh -p <gcp-project-id> [-r us-central1]        # macOS / Linux
./deploy.ps1 -ProjectId <gcp-project-id>                # Windows PowerShell
```

The script enables the required APIs, builds the image with Cloud Build and deploys it with
2 vCPU / 4 GiB and one always-on instance (feed processing runs continuously).
Any Docker host works too: `docker build -t dristhi-backend backend && docker run -p 8080:8080 dristhi-backend`.

### Frontend → Firebase Hosting

```bash
cd frontend
npx firebase login
npx firebase use <your-firebase-project-id>
cp functions/.env.example functions/.env    # set BACKEND_URL
# In .env set NEXT_PUBLIC_BACKEND_URL= (empty) so the app uses the /api proxy
npm run deploy
```

Add your hosting domain to **Firebase Auth → Settings → Authorized domains**. Cloud Functions
require the Blaze (pay-as-you-go) plan.

---

## Screenshots

| Admin dashboard | Camera feeds |
|---|---|
| ![Dashboard](https://res.cloudinary.com/dams0r5uk/image/upload/v1755239920/e0596e3ca77b7bdadbf4e6a58e4f4b4221dbe2807421542949fae856a4d157f8_z2rcvo.png) | ![Live feed](https://res.cloudinary.com/dams0r5uk/image/upload/v1755241466/cf22522010502412d556b0e81cca94e7561f01df0d76c2da2fdb069e78466251_a63gvu.png) |
| **Map view** | **Grievance management** |
| ![Map view](https://res.cloudinary.com/dams0r5uk/image/upload/v1755241475/4c08102057ea1a595d956b83eb21ccf4680d4dee0a2a2906fbca86cdac6c4edb_jzvefm.png) | ![Grievances](https://res.cloudinary.com/dams0r5uk/image/upload/v1755241443/a0806a643b0b8c0b319efe925fa3bce46206f5597101ffb48e1d33ad47c57d1e_iu7uyj.png) |
| **User dashboard** | |
| ![User dashboard](https://res.cloudinary.com/dams0r5uk/image/upload/v1755241455/2974e53bf8a571b18c20c4b02cd01bed833a3963c79495a7c07800af1cbd8c93_xeaukf.png) | |

---

## Security notes

- **Firestore rules** (`frontend/firestore.rules`) currently allow any client to read/write until
  2028-01-01 so that the seed scripts work. Tighten them (e.g. `request.auth != null`, per-collection
  rules) before a real deployment.
- `NEXT_PUBLIC_*` values are embedded in the browser bundle. Restrict your Firebase, Maps and Gemini
  API keys by HTTP referrer and API in the Google Cloud console.
- The backend has open CORS and no authentication; keep it behind the Cloud Function proxy or a firewall.
- Never commit `.env` files or service-account keys (they are git-ignored).

---

## Tech stack

**Frontend:** Next.js 15 (App Router, static export) · TypeScript · Tailwind CSS · shadcn/ui (Radix) ·
Recharts · Google Maps · Firebase Auth & Firestore · Gemini API

**Backend:** FastAPI · Uvicorn · Ultralytics YOLOv8 · OpenCV · PyTorch (CPU) · pandas / NumPy

**Infra:** Firebase Hosting + Cloud Functions · Google Cloud Run / Compute Engine · Docker
