# Run Dristhi AI on your own computer

The admin console and the attendee app (frontend) and the API (backend) run on your laptop. They use
the team's **shared Cloud SQL database**, so you see the same events, staff and reports as the live
site. Sign-in runs locally in the Firebase Auth emulator, so no Firebase account is needed.

```
browser ──► frontend  http://127.0.0.1:9002   (npm run dev)
               │  sign-in ──► Auth emulator   http://127.0.0.1:9099  (npm run emulators)
               ▼
            backend   http://127.0.0.1:5000   (python app.py)
               ▼
     Cloud SQL proxy  127.0.0.1:5433 ──► Cloud SQL dristhi-fdc (asia-south1)
```

Part A is done once per computer. Part B is what you run every time.

---

## Part A — one-time setup

### A1. Install the tools

| Tool | Version | Check |
| --- | --- | --- |
| Git | any | `git --version` |
| Python | 3.10 or newer | `python3 --version` (Windows: `python --version`) |
| Node.js | 20 or newer | `node -v` |
| Google Cloud CLI | latest | `gcloud --version` ([install guide](https://cloud.google.com/sdk/docs/install)) |

Then add the Cloud SQL Auth Proxy to the Google Cloud CLI:

```bash
gcloud components install cloud-sql-proxy
```

### A2. Get access (ask the project owner)

The project owner does these for each teammate, once:

1. **Google Cloud access.** Cloud Console → IAM & Admin → IAM → *Grant access* → the teammate's
   Google account → role **Cloud SQL Client**. Nothing more is needed to run locally.
2. **A database login for the teammate.** One user per person, so access can be removed later
   without breaking anyone else. The password is typed at a hidden prompt (macOS / Linux):

   ```bash
   read -s "PW?Password for the new database user: " && echo && gcloud sql users create dristhi_<name> --instance=dristhi-fdc --project=dhristi-ai-buildathon --password="$PW"; unset PW
   ```

   (In bash, use `read -s -p "Password: " PW` instead of the zsh form above.) Give the teammate the
   username and password in person or through a password manager, never in chat or email.
3. **The Maps key, Map ID and Gemini key** for `frontend/.env` (also through a password manager).
   The Maps key only works on `localhost:9002` and `127.0.0.1:9002` and the two live sites.
   Without these the venue map does not load and the assistant uses its simple offline replies;
   everything else works.

### A3. Sign in to Google Cloud on this computer

```bash
gcloud auth login
```

```bash
gcloud auth application-default login
```

```bash
gcloud config set project dhristi-ai-buildathon
```

On the consent page of the second command, tick every box (including "See, edit, configure and
delete your Google Cloud data"), or the proxy cannot connect.

### A4. Get the code and install the backend

```bash
git clone https://github.com/Curi0us2003/Dristhi-AI.git && cd Dristhi-AI
```

macOS / Linux:

```bash
cd backend && python3 -m venv .venv && .venv/bin/pip install -r requirements-dev.txt
```

Windows (PowerShell):

```powershell
cd backend; python -m venv .venv; .venv\Scripts\pip install -r requirements-dev.txt
```

The first backend start downloads the crowd-counting model (about 86 MB) from Hugging Face.

### A5. Create `backend/.env`

```bash
cp .env.example .env
```

(Windows: `copy .env.example .env`.) Open `backend/.env` and change only the two `<password>`
lines: put **your** database username and password in place of `dristhi_app:<password>`:

```
DATABASE_URL=postgresql+psycopg://dristhi_<name>:<your password>@127.0.0.1:5433/dristhi
TEST_DATABASE_URL=postgresql+psycopg://dristhi_<name>:<your password>@127.0.0.1:5433/dristhi_test
```

If the password contains `@ # / : %`, write them as `%40 %23 %2F %3A %25`. Leave the rest of the
file as it is: it is already set up for local sign-in (`FIREBASE_PROJECT_ID=demo-dristhi` and
`FIREBASE_AUTH_EMULATOR_HOST`). This file is git-ignored; never commit it.

### A6. Install the frontend and create `frontend/.env`

```bash
cd ../frontend && npm install
```

```bash
cp .env.example .env
```

Open `frontend/.env` and set these lines (leave the `NEXT_PUBLIC_FIREBASE_*` lines empty):

```
NEXT_PUBLIC_USE_EMULATORS=true
NEXT_PUBLIC_BACKEND_URL=http://127.0.0.1:5000
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=<from the project owner>
NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID=<from the project owner>
NEXT_PUBLIC_GEMINI_API_KEY=<from the project owner, optional>
NEXT_PUBLIC_ATTENDEE_URL=
NEXT_PUBLIC_EVENT_SLUG=demo
NEXT_PUBLIC_ATTENDEE_LOCAL_JOIN=0
```

This `frontend/.env` is a **local** one. Never run `npm run deploy` from a computer set up like this:
it would point both live sites at `127.0.0.1`. Deploying is done from the project owner's computer,
whose `frontend/.env` holds the production values.

---

## Part B — every time: start the app

Open **five terminal tabs** in the `Dristhi-AI` folder and run one command in each, in this order.
Leave them running.

**1. Database proxy**

```bash
cloud-sql-proxy dhristi-ai-buildathon:asia-south1:dristhi-fdc --port 5433
```

Wait for "ready for new connections".

**2. Backend** (http://127.0.0.1:5000)

macOS / Linux:

```bash
cd backend && ENV=production DB_POOL_SIZE=2 DB_MAX_OVERFLOW=2 .venv/bin/python app.py
```

Windows (PowerShell):

```powershell
cd backend; $env:ENV="production"; $env:DB_POOL_SIZE="2"; $env:DB_MAX_OVERFLOW="2"; .venv\Scripts\python app.py
```

`DB_POOL_SIZE=2 DB_MAX_OVERFLOW=2` keeps your backend to at most 4 database connections. The
database allows only about 14 for everyone together (live site, every teammate, tests), so please
keep this. `ENV=production` turns off auto-reload, which can hang while video is playing.

**3. Sign-in emulator**

```bash
cd frontend && npm run emulators
```

**4. Demo admin login** (once each time the emulator starts; safe to repeat)

```bash
cd frontend && npm run seed:emulator
```

**5. Frontend** (http://127.0.0.1:9002)

```bash
cd frontend && npm run dev
```

### Open it

- **Admin console:** http://127.0.0.1:9002/login — username `control`, employee ID `EMP001`, email
  `admin@dristhi.test`, password in `frontend/scripts/seed-emulator.mjs`. (Accounts on the live site
  do not work locally: local sign-in uses the emulator.)
- **Attendee app:** http://127.0.0.1:9002/join?e=demo
- **Backend check:** http://127.0.0.1:5000/api/health should show `"status":"healthy"` and
  `"active_feeds":8`. Camera counts and the 15/30-minute forecast fill in over the first few minutes.

Use one address all the time (`127.0.0.1:9002` *or* `localhost:9002`): the browser keeps a separate
sign-in and saved data for each.

### Stop it

Press **Ctrl + C** in each tab. If the backend does not stop (macOS / Linux):

```bash
lsof -t -iTCP:5000 -sTCP:LISTEN | xargs kill -9
```

Windows: close its PowerShell window, or find the process with `netstat -ano | findstr :5000` and end
it in Task Manager.

---

## If something goes wrong

| What you see | Cause and fix |
| --- | --- |
| Proxy: "could not find default credentials" or 403 | Run `gcloud auth application-default login` again (tick every box), and check you have the **Cloud SQL Client** role. |
| Backend: `password authentication failed` | Username or password in `backend/.env` is wrong, or a special character is not encoded (`@` → `%40`). |
| Backend: `remaining connection slots are reserved` | The shared database is full. Make sure your backend runs with `DB_POOL_SIZE=2 DB_MAX_OVERFLOW=2`, stop backends or test runs you no longer need, then retry. Tell the project owner if it persists. |
| Login says the account is not an admin | Run step 4 again (the emulator forgets accounts when it restarts). |
| Venue map stays blank | No Maps key in `frontend/.env`, or you opened a different address than `127.0.0.1:9002` / `localhost:9002`. |
| `Address already in use` (port 5000, 9002, 9099 or 5433) | That piece is already running in another tab; use it or stop it first. |
| Testing from a phone on the same Wi-Fi | Phones cannot reach `127.0.0.1`. Ask the project owner; it needs `CORS_ORIGINS` in `backend/.env` and a rebuild for your Wi-Fi address. |

## What not to do on the shared database

- Do not run `alembic upgrade`, `scripts/seed_demo.py --reset-venue` or `scripts/create_admin.py`
  unless the project owner asks you to: they change data everyone uses.
- Backend tests (`pytest`) use the separate `dristhi_test` database and are safe; skip the
  concurrency test while a backend is running: `cd backend && .venv/bin/pytest -q -k "not concurrent"`.
