# Dristhi AI: Event Guardian 🛡️

**Dristhi AI** is an AI-powered situational-awareness platform for crowd safety at large events.
CCTV feeds are analysed in real time by a **DM-Count crowd-density model** (from Hugging Face),
which counts people accurately even in packed crowds, and a **Next.js** command
center lets security teams watch crowd density, receive alerts, manage attendee grievances, and
let a **Gemini**-powered agent propose guard, ambulance and medical-staff deployments.

![Dristhi AI](https://res.cloudinary.com/dams0r5uk/image/upload/v1753526208/Picture1_wlf2zp.jpg)

---

## Contents

- [Features](#features)
- [Architecture](#architecture)
- [Project structure](#project-structure)
- [Crowd counting model](#crowd-counting-model)
- [Quick start (local)](#quick-start-local)
- [Testing in the UI](#testing-in-the-ui)
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
| **Live Feed** (`/live-feed`) | Camera streams with live people count, density %, status, and a **Density Heatmap** toggle that marks every detected head |
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
 │  (Firebase Hosting)        ├───────►│  • DM-Count crowd density     │
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
│   ├── app.py              # FastAPI app: per-feed analysis threads + REST API
│   ├── crowd_counter.py    # DM-Count (Hugging Face, ONNX) + YOLO/OpenCV fallbacks, heatmap overlay
│   ├── feeds.json          # CCTV feed definitions (edit this to add cameras)
│   ├── tools/make_demo_videos.py  # builds demo CCTV clips with ground-truth counts
│   ├── requirements.txt
│   ├── Dockerfile          # CPU-only image (model baked in), listens on $PORT (8080)
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

## Crowd counting model

The backend uses **[DM-Count](https://github.com/cvlab-stonybrook/DM-Count)** (NeurIPS 2020,
UCF-QNRF weights, MIT licence), downloaded from Hugging Face
([`mlboydaisuke/DM-Count-Crowd-OpenVINO`](https://huggingface.co/mlboydaisuke/DM-Count-Crowd-OpenVINO),
`dmcount.onnx`) on first start and run on CPU with ONNX Runtime. Instead of drawing boxes around
people (which fails once people overlap), it predicts a **density map** whose sum is the number of
people, so it also tells you *where* the crowd is. That map drives the heatmap overlay.

Frames are split into overlapping 512×512 tiles (long side scaled to 1024 px) so small, distant
heads are still counted.

**Benchmark** on ShanghaiTech test images with ground-truth head counts (40 street scenes from
part B, 40 dense crowds from part A), CPU (Intel i5-13450HX):

| Model | Street scenes MAE | Street scenes error | Dense crowds MAE | Dense crowds error | Time / frame |
|-------|------:|------:|------:|------:|------:|
| YOLOv8n @ 320×240 *(previous setup)* | 84.5 | 66.6 % | 336.6 | 95.9 % | 40 ms |
| YOLOv8n @ 1280 px | 65.3 | 47.9 % | 316.2 | 85.0 % | 110 ms |
| P2PNet (ShanghaiTech A, ONNX) | 16.2 | 13.6 % | 109.7 | 34.0 % | 1.6 s |
| **DM-Count, tiled (current)** | **11.0** | **7.9 %** | **54.8** | **17.7 %** | ~1.2 s¹ |

¹ With all CPU cores. Set `DENSITY_MAX_SIDE=768` to roughly halve it (10.8 % street-scene error).
It returns 0 on empty frames and counts small groups correctly (3.9 for 4 people, 1.9 for 2).
CLIP-EBC (state of the art, ViT-based) was also considered but is too heavy to run 8 feeds on a CPU server.

Each feed is analysed every `ANALYSIS_INTERVAL` seconds (default 5). The model processes one frame
at a time, so with 8 feeds on a laptop CPU each camera refreshes roughly every 8–10 s.
To use YOLO instead: `pip install ultralytics` and set `CROWD_MODEL=yolo`.

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
python tools/make_demo_videos.py  # one-time: demo CCTV clips → backend/videos/ (~530 MB download)
python app.py                     # → http://localhost:5000  (Swagger UI: /docs)
```

The first start downloads the DM-Count model (~86 MB) from Hugging Face; later starts use the cache.
No Hugging Face account or token is needed, because the model is public.

> **Video sources:** `feeds.json` points each camera at `videos/<name>.mp4`. The demo script fills
> these with real crowd scenes from the ShanghaiTech dataset (research use only), ordered quiet → busy,
> and writes their true head counts to `videos/ground_truth.json`. For real cameras, set a feed's
> `url` to an RTSP/HTTP stream or another video file and adjust its `max_capacity`.

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

### Testing in the UI

1. Start the backend (`python app.py` in `backend/`) and wait for `✅ Crowd model ready: DM-Count`.
   `http://localhost:5000/api/health` should show `"model": "dm-count"` and `"active_feeds": 8`.
2. Start the frontend (`npm run dev` in `frontend/`) and open **http://localhost:9002**.
3. Log in on the **Operator** tab with the account from `npm run create-admin`.
4. **Live Feed**: every camera card shows `people / capacity` and density %. Press
   **Density Heatmap** to see the analysed frame with each detected head marked and the count
   stamped on it, and compare with `backend/videos/ground_truth.json`. The clips change scene every
   10 s, so counts and the Normal → Warning → Critical badges change as the crowd grows.
5. **Dashboard**: total people, overall density and the analytics chart fill up over a few minutes.
6. **Alerts**: cameras above 70 % of capacity show as *warning*, above 90 % as *critical*.
   Predictions appear after about 5 analyses per camera.
7. **Map View** (needs a Google Maps key): crowd density per camera location.

Quick API check without the UI:

```bash
curl http://localhost:5000/api/feeds                                              # live counts
curl -o heat.jpg "http://localhost:5000/api/video/snapshot/feed_6?overlay=true"   # heatmap image
```

### Useful scripts (frontend)

| Command | Description |
|---------|-------------|
| `npm run dev` | Dev server with Turbopack on port 9002 |
| `npm run build` | Static production build into `out/` |
| `npm start` | Serve the built `out/` folder locally |
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
| `CROWD_MODEL` | `dmcount` | `dmcount` or `yolo` (YOLO needs `pip install ultralytics`) |
| `HF_MODEL_REPO` / `HF_MODEL_FILE` | `mlboydaisuke/DM-Count-Crowd-OpenVINO` / `dmcount.onnx` | Hugging Face model to load |
| `DENSITY_MAX_SIDE` | `1024` | Frame size before tiling; `768` is about 2× faster and slightly less accurate |
| `ANALYSIS_INTERVAL` | `5` | Seconds between analyses of the same camera |
| `INFERENCE_THREADS` | all cores | ONNX Runtime threads |
| `ALERT_THRESHOLD` / `CONGESTION_THRESHOLD` | `90` / `70` | Critical / warning level, in % of a camera's `max_capacity` |

Thresholds can also be changed at runtime via `POST /api/config/thresholds`.

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
| GET | `/api/video/stream/{id}` | Live MJPEG video stream (`?overlay=true` adds heatmap + count) |
| GET | `/api/video/snapshot/{id}` | Current JPEG frame (`?overlay=true`: last analysed frame with density heatmap and count) |
| GET | `/api/video/health/{id}` · `/api/video/info` | Source accessibility and metadata |
| GET | `/api/analytics/summary` | Aggregate density and trend analytics |
| GET | `/api/alerts` · `/api/predictions` | Current alerts and short-term congestion predictions |
| GET | `/api/heatmap` | Geo-tagged density for the map |
| GET | `/api/export/csv` | Download analytics history as CSV |
| GET / POST | `/api/config/thresholds` | Read / update alert and congestion thresholds (% of capacity) |
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

**Frontend:** Next.js 15 (App Router, static export) · JavaScript (React) · Tailwind CSS · shadcn/ui (Radix) ·
Recharts · Google Maps · Firebase Auth & Firestore · Gemini API

**Backend:** FastAPI · Uvicorn · DM-Count via ONNX Runtime · Hugging Face Hub · OpenCV · pandas / NumPy

**Infra:** Firebase Hosting + Cloud Functions · Google Cloud Run / Compute Engine · Docker
