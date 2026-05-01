# Деплой: Vercel + Railway

## Шаг 1 — Запушить репо на GitHub

```bash
git add .
git commit -m "ready for deploy"
git push
```

## Шаг 2 — Railway: сервис бэкенда (FastAPI)

1. Зайти на [railway.app](https://railway.app) → New Project → Deploy from GitHub repo
2. Выбрать репозиторий, **Root Directory:** `backend`
3. Railway автоматически использует `backend/railway.toml` → `Dockerfile`
4. В разделе **Variables** добавить:

```
ANTHROPIC_API_KEY=...
LIVEKIT_URL=...
LIVEKIT_API_KEY=...
LIVEKIT_API_SECRET=...
DEEPGRAM_API_KEY=...
CARTESIA_API_KEY=...
```

5. После деплоя скопировать публичный домен (например `medkit-backend.up.railway.app`)

## Шаг 3 — Railway: voice worker (отдельный сервис)

1. В том же Railway-проекте → New Service → GitHub repo (тот же репо)
2. **Root Directory:** `backend`
3. В настройках сервиса → **Build** → Custom Dockerfile: `Dockerfile.voice`  
   (или переименовать `railway.voice.toml` в `railway.toml` для этого сервиса)
4. Добавить те же **Variables** что и в шаге 2
5. Задеплоить

## Шаг 4 — Обновить vercel.json

В файле `vercel.json` заменить `RAILWAY_BACKEND_URL` на реальный домен из шага 2:

```json
"destination": "https://medkit-backend.up.railway.app/agent/:path*"
```

Запушить изменение:
```bash
git add vercel.json
git commit -m "set railway backend url"
git push
```

## Шаг 5 — Vercel: фронтенд

1. Зайти на [vercel.com](https://vercel.com) → New Project → Import GitHub repo
2. **Framework:** Vite (определится автоматически)
3. **Root Directory:** `.` (корень репо)
4. Build command: `npm run build`
5. Output directory: `dist`
6. Variables: ничего не нужно (ключи только на Railway)
7. Deploy

## Bootstrap Managed Agent (один раз)

После первого деплоя бэкенда:

```bash
curl -X POST https://RAILWAY_BACKEND_URL/agent/bootstrap
```

Скопировать `agent_id` и `environment_id` из ответа, добавить в Railway Variables:
```
MEDKIT_AGENT_ID=...
MEDKIT_ENV_ID=...
```

Перезапустить бэкенд-сервис.
