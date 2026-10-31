# PREDIXA Local Run Guide

This repo is split into three local services:

- `apps/web`: React + Vite frontend on `http://localhost:5173`
- `services/api`: Express API on `http://localhost:5050`
- `services/ai`: FastAPI AI service on `http://localhost:8000`

The frontend talks to the API, and the API talks to the AI service for prediction, news, fundamentals, and backtest endpoints.

## Prerequisites

- Node.js 20+
- npm 10+
- Python 3.11+
- PostgreSQL 14+ running locally or a remote `DATABASE_URL`

## 1. Clone And Enter The Repo

```bash
git clone <your-repo-url>
cd PREDIXA
```

## 2. Install Dependencies

Frontend:

```bash
cd apps/web
npm install
cd ../..
```

API:

```bash
cd services/api
npm install
cd ../..
```

AI service:

```bash
cd services/ai
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
pip install yfinance
cd ../..
```

`yfinance` is currently imported by the AI service and data helpers, so install it even though it is not yet listed in `requirements.txt`.

## 3. Create Env Files

Copy the examples into the service folders:

```bash
cp apps/web/.env.example apps/web/.env.local
cp services/api/.env.example services/api/.env
cp services/ai/.env.example services/ai/.env
```

Minimum values to check:

- `apps/web/.env.local`
  - `VITE_API_BASE_URL=http://localhost:5050`
- `services/api/.env`
  - `PORT=5050`
  - `AI_SERVICE_URL=http://localhost:8000`
  - `DATABASE_URL=postgresql://postgres:postgres@localhost:5432/predixa`
- `services/ai/.env`
  - `PREDIXA_API_BASE_URL=http://localhost:5050`

Optional keys:

- `FMP_API_KEY` for quote/trend endpoints backed by Financial Modeling Prep
- `GEMINI_API_KEY` for AI sentiment classification
- `ALPHA_VANTAGE_API_KEY` for indicator enrichment

## 4. Start Postgres

If you already have Postgres running, create a database named `predixa` and update `services/api/.env` if needed.

Example with `psql`:

```bash
createdb predixa
```

Apply the schema:

```bash
cd services/api
npm run db:schema
cd ../..
```

## 5. Start The Services

Open three terminals from the repo root.

Terminal 1, API:

```bash
cd services/api
npm run dev
```

Terminal 2, AI service:

```bash
cd services/ai
source .venv/bin/activate
uvicorn app:app --reload --host 0.0.0.0 --port 8000
```

Terminal 3, frontend:

```bash
cd apps/web
npm run dev
```

## 6. Verify Everything Is Up

Check these URLs:

- Frontend: `http://localhost:5173`
- API health: `http://localhost:5050/health`
- AI health: `http://localhost:8000/health`

Quick endpoint checks:

```bash
curl "http://localhost:5050/api/history/eod?symbol=AAPL&limit=30"
curl "http://localhost:8000/fundamentals/AAPL"
```

## Common Notes

- The API will fail on startup if `DATABASE_URL` is missing.
- The AI service is started with `uvicorn`, not `python app.py`.
- Some frontend screens call quote and trend-style endpoints that depend on database access and `FMP_API_KEY`.
- If you only want to work on the frontend layout, you still usually want the API running because stock pages fetch from it immediately.

## Troubleshooting

If `npm install` fails:

```bash
npm cache verify
```

If the AI service fails with missing modules:

```bash
cd services/ai
source .venv/bin/activate
pip install -r requirements.txt
pip install yfinance
```

If the API exits with `DATABASE_URL is missing`:

- make sure `services/api/.env` exists
- make sure the variable is named exactly `DATABASE_URL`
- restart the API after saving the file

If the schema command fails:

- confirm Postgres is running
- confirm the database in `DATABASE_URL` exists
- try connecting manually with `psql`
