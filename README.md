# animanal

## Animal - Animal Trivia (embed edition)

Self-contained fork of the game that **only loads pictures from Wikimedia URLs** in your SQLite database. There is **no `images/` folder** and the API **never serves `/api/images/...`**.

- App display name: **Animal - Animal Trivia** (Expo `app.json`).
- Backend flag: `config.Settings.embed_only` defaults to **`True`** (override with env `EMBED_ONLY=false` only if you know you need it).

## Repo layout

```
animal-trivia-embed/
  README.md          ← you are here
  animals.db         ← game data (commit or replace with your own)
  backend/           ← FastAPI
  mobile/            ← Expo (React Native + web)
```

## Run locally (development)

### 1. API (terminal 1)

```powershell
cd path\to\animal-trivia-embed\backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
py -m uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

Health check: [http://127.0.0.1:8000/health](http://127.0.0.1:8000/health)  
Probe: [http://127.0.0.1:8000/AK-MGMT-PROBE](http://127.0.0.1:8000/AK-MGMT-PROBE)

`animals.db` must sit next to `backend/` (same folder as this README).

### 2. App (terminal 2)

```powershell
cd path\to\animal-trivia-embed\mobile
copy .env.example .env
# Edit .env: set EXPO_PUBLIC_API_URL to your PC's API (e.g. http://192.168.x.x:8000) for a phone on Wi‑Fi
npm install
npx expo start --web
```

- **Web:** opens in the browser (often port 8081 or 8086 depending on Expo).
- **Phone:** `npx expo start`, scan QR; use `EXPO_PUBLIC_API_FOLLOW_METRO=1` so the app follows the same LAN IP as Metro.

## Live site (GitHub Pages)

The game is served at **[https://roime99.github.io/animanal/](https://roime99.github.io/animanal/)** as static `index.html` (Expo web export), not the README.

### One-time GitHub setup

1. **Repo → Settings → Pages → Build and deployment**
   - **Source:** GitHub **Actions** (not “Deploy from a branch” with README).
2. **Repo → Settings → Secrets and variables → Actions → New repository secret**
   - Name: `EXPO_PUBLIC_API_URL`
   - Value: your **public** API base URL, e.g. `https://your-service.onrender.com` (no trailing slash). The workflow bakes this into the web build so the browser can reach FastAPI (GitHub Pages does not run Python).
3. Push to **`main`** (or run workflow **Deploy GitHub Pages** manually). After the workflow finishes, refresh the Pages URL.

The workflow adds **`.nojekyll`** so GitHub does not strip Expo’s `_expo/` folder, and **`404.html`** as a copy of **`index.html`** for SPA routing.

### Backend

Host `backend/` on Render, Railway, Fly.io, etc. (`uvicorn main:app --host 0.0.0.0 --port $PORT`). Use the same origin you put in `EXPO_PUBLIC_API_URL`. Redeploy **or** re-run the Pages workflow after changing the API URL.

### Local static build (optional)

```powershell
cd mobile
$env:EXPO_PUBLIC_API_URL="https://your-api.example.com"
npm run export:web
# output: mobile/dist/index.html
```

## Naming

The product string is **Animal - Animal Trivia**. If you prefer a different brand line (e.g. **Animanal**), change:

- `mobile/app.json` → `expo.name`
- `mobile/screens/HomeScreen.tsx` → title text
- `backend/main.py` → `FastAPI(title=...)`

## Syncing from the parent monorepo

This folder was **copied** from the main `animals_kingdom` project. To pull in upstream fixes, merge or cherry-pick into this tree manually; there is no automatic sync.
