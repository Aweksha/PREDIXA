import os
import re
import json
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta
from email.utils import parsedate_to_datetime

import pandas as pd
import requests
import yfinance as yf
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

load_dotenv()

app = FastAPI(title="Predixa AI Service", version="6.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent"

# Simple in-memory cache
_cache: dict = {}

def _cache_get(key: str, ttl_seconds: int):
    entry = _cache.get(key)
    if entry and (datetime.now().timestamp() - entry["ts"]) < ttl_seconds:
        return entry["data"]
    return None

def _cache_set(key: str, data):
    _cache[key] = {"data": data, "ts": datetime.now().timestamp()}


def _gemini_sentiment(titles_and_summaries: list[str]) -> list[str] | None:
    """Send a batch of article snippets to Gemini and get sentiment labels back, or None on failure."""
    if not GEMINI_API_KEY:
        return None

    numbered = "\n".join(f"{i+1}. {t}" for i, t in enumerate(titles_and_summaries))
    prompt = (
        f"Classify the stock market sentiment of each headline below as exactly "
        f"'bullish', 'bearish', or 'neutral' for the company's stock.\n"
        f"Reply with ONLY a JSON array of strings in the same order, e.g. [\"bullish\",\"neutral\",\"bearish\"]. "
        f"No other text.\n\n{numbered}"
    )

    payload = json.dumps({
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {"temperature": 0.0, "maxOutputTokens": 128},
    }).encode()

    req = urllib.request.Request(
        f"{GEMINI_URL}?key={GEMINI_API_KEY}",
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            body = json.loads(resp.read())
        text = body["candidates"][0]["content"]["parts"][0]["text"].strip()
        # Strip markdown code blocks if present
        text = text.replace("```json", "").replace("```", "").strip()
        labels = json.loads(text)
        if isinstance(labels, list) and len(labels) == len(titles_and_summaries):
            return [l if l in ("bullish", "bearish", "neutral") else "neutral" for l in labels]
    except Exception as e:
        print(f"Gemini sentiment error: {e}")
    return None


@app.get("/")
def root():
    return {
        "message": "Predixa AI service is running",
        "endpoints": ["/health", "/predict/{ticker}", "/backtest/{ticker}", "/fundamentals/{ticker}", "/news/{ticker}"],
    }


@app.get("/health")
def health():
    return {"ok": True}


@app.get("/predict/{ticker}")
def predict_ticker(ticker: str, limit: int = 1200):
    try:
        from predict_combined_model import predict_symbol as run_combined_prediction
        return run_combined_prediction(ticker, limit=limit)
    except ImportError:
        raise HTTPException(status_code=503, detail="AI prediction model not available (missing dependencies)")
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@app.get("/model-report")
def model_report():
    from model_core import load_models
    return load_models()["report"]


@app.get("/backtest/{ticker}")
def backtest_ticker(ticker: str):
    symbol = ticker.upper().strip()
    cached = _cache_get(f"backtest_{symbol}", 1800)  # 30-min cache
    if cached:
        return cached
    try:
        from backtest_endpoint import run_backtest
        result = run_backtest(symbol)
        _cache_set(f"backtest_{symbol}", result)
        return result
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@app.get("/fundamentals/{ticker}")
def get_fundamentals(ticker: str):
    symbol = ticker.upper().strip()
    cached = _cache_get(f"fund_{symbol}", 1800)  # 30-min cache
    if cached:
        return cached

    try:
        t = yf.Ticker(symbol)
        i = t.info

        def pct(v):
            if v is None:
                return None
            return round(v * 100, 2)

        def fmt2(v):
            if v is None:
                return None
            return round(float(v), 2)

        def large(v):
            if v is None:
                return None
            sign = "-" if v < 0 else ""
            v = abs(v)
            if v >= 1e12:
                return f"{sign}${v/1e12:.2f}T"
            if v >= 1e9:
                return f"{sign}${v/1e9:.2f}B"
            if v >= 1e6:
                return f"{sign}${v/1e6:.2f}M"
            return f"{sign}${v:,.0f}"

        data = {
            "symbol": symbol,
            "name": i.get("longName") or i.get("shortName"),
            "sector": i.get("sector"),
            "industry": i.get("industry"),
            "currentPrice": fmt2(i.get("currentPrice") or i.get("regularMarketPrice")),
            "previousClose": fmt2(i.get("previousClose")),
            "change": fmt2((i.get("currentPrice") or 0) - (i.get("previousClose") or 0)) if i.get("currentPrice") and i.get("previousClose") else None,
            "changePercent": fmt2(((i.get("currentPrice", 0) - i.get("previousClose", 0)) / i.get("previousClose", 1) * 100)) if i.get("currentPrice") and i.get("previousClose") else None,
            "marketCap": large(i.get("marketCap")),
            "volume": i.get("volume") or i.get("regularMarketVolume"),
            "avgVolume": i.get("averageVolume"),
            # Valuation
            "pe": fmt2(i.get("trailingPE")),
            "forwardPE": fmt2(i.get("forwardPE")),
            "peg": fmt2(i.get("pegRatio")),
            "ps": fmt2(i.get("priceToSalesTrailing12Months")),
            "pb": fmt2(i.get("priceToBook")),
            "evEbitda": fmt2(i.get("enterpriseToEbitda")),
            "evRevenue": fmt2(i.get("enterpriseToRevenue")),
            "enterpriseValue": large(i.get("enterpriseValue")),
            # Quality
            "roe": pct(i.get("returnOnEquity")),
            "roa": pct(i.get("returnOnAssets")),
            "operatingMargin": pct(i.get("operatingMargins")),
            "profitMargin": pct(i.get("profitMargins")),
            "grossMargin": pct(i.get("grossMargins")),
            # Health
            "debtToEquity": fmt2(i.get("debtToEquity")),
            "currentRatio": fmt2(i.get("currentRatio")),
            "quickRatio": fmt2(i.get("quickRatio")),
            "totalCash": large(i.get("totalCash")),
            "totalDebt": large(i.get("totalDebt")),
            "freeCashflow": large(i.get("freeCashflow")),
            # Growth
            "revenueGrowth": pct(i.get("revenueGrowth")),
            "earningsGrowth": pct(i.get("earningsGrowth")),
            "totalRevenue": large(i.get("totalRevenue")),
            # Risk
            "beta": fmt2(i.get("beta")),
            "fiftyTwoWeekHigh": fmt2(i.get("fiftyTwoWeekHigh")),
            "fiftyTwoWeekLow": fmt2(i.get("fiftyTwoWeekLow")),
            "fiftyDayAvg": fmt2(i.get("fiftyDayAverage")),
            "twoHundredDayAvg": fmt2(i.get("twoHundredDayAverage")),
            # Dividends
            "dividendRate": fmt2(i.get("dividendRate")),
            "dividendYield": fmt2(i.get("dividendYield")),  # yfinance already returns a percentage
            "payoutRatio": pct(i.get("payoutRatio")),
        }

        _cache_set(f"fund_{symbol}", data)
        return data
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@app.get("/news/{ticker}")
def get_news(ticker: str):
    symbol = ticker.upper().strip()
    cached = _cache_get(f"news_{symbol}", 900)  # 15-min cache
    if cached:
        return cached

    try:
        # yfinance's Ticker.news comes back empty, so read Yahoo's per-symbol feed directly
        response = requests.get(
            "https://feeds.finance.yahoo.com/rss/2.0/headline",
            params={"s": symbol, "region": "US", "lang": "en-US"},
            headers={"User-Agent": "Mozilla/5.0"},
            timeout=15,
        )
        response.raise_for_status()

        articles = []
        for item in ET.fromstring(response.content).iter("item"):
            title = (item.findtext("title") or "").strip()
            if not title:
                continue
            summary = re.sub(r"<[^>]+>", "", item.findtext("description") or "").strip()

            pub = item.findtext("pubDate") or ""
            try:
                date_str = parsedate_to_datetime(pub).strftime("%b %d, %Y")
            except Exception:
                date_str = pub[:16]

            articles.append({
                "title": title,
                "source": "Yahoo Finance",
                "date": date_str,
                "summary": summary[:300],
                "url": (item.findtext("link") or "").strip(),
                "sentiment": None,  # filled below when Gemini responds
            })
            if len(articles) == 5:
                break

        # Batch sentiment via Gemini
        labels = None
        if articles:
            snippets = [f"{a['title']}. {a['summary'][:120]}" for a in articles]
            labels = _gemini_sentiment(snippets)
            for a, label in zip(articles, labels or []):
                a["sentiment"] = label

        result = {"symbol": symbol, "articles": articles}
        # Don't hold on to unlabelled headlines, so sentiment recovers on the next request
        if labels:
            _cache_set(f"news_{symbol}", result)
        return result
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@app.get("/history/{ticker}")
def get_history(
    ticker: str,
    start: str = Query(None),
    end: str = Query(None),
    limit: int = Query(750),
):
    symbol = ticker.upper().strip()
    cache_key = f"hist_{symbol}_{start}_{end}_{limit}"
    cached = _cache_get(cache_key, 3600)  # 1-hour cache
    if cached:
        return cached

    try:
        t = yf.Ticker(symbol)
        if start and end:
            hist = t.history(start=start, end=end, interval="1d", auto_adjust=True)
        else:
            # Default: 2 years
            end_dt = datetime.today()
            start_dt = end_dt - timedelta(days=730)
            hist = t.history(
                start=start_dt.strftime("%Y-%m-%d"),
                end=end_dt.strftime("%Y-%m-%d"),
                interval="1d",
                auto_adjust=True,
            )

        if hist.empty:
            raise HTTPException(status_code=404, detail=f"No history for {symbol}")

        hist = hist.reset_index()
        hist.columns = [c.lower() for c in hist.columns]
        date_col = "date" if "date" in hist.columns else "datetime"
        hist = hist.rename(columns={date_col: "date"})
        hist["date"] = pd.to_datetime(hist["date"]).dt.tz_localize(None).dt.normalize()
        hist = hist.sort_values("date").reset_index(drop=True)

        points = []
        for _, row in hist.iterrows():
            points.append({
                "date": str(row["date"].date()),
                "open": round(float(row["open"]), 4) if pd.notna(row.get("open")) else None,
                "high": round(float(row["high"]), 4) if pd.notna(row.get("high")) else None,
                "low": round(float(row["low"]), 4) if pd.notna(row.get("low")) else None,
                "close": round(float(row["close"]), 4) if pd.notna(row.get("close")) else None,
                "volume": int(row["volume"]) if pd.notna(row.get("volume")) else None,
            })

        if limit and len(points) > limit:
            points = points[-limit:]

        result = {"symbol": symbol, "points": points, "count": len(points)}
        _cache_set(cache_key, result)
        return result
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@app.get("/esg/{ticker}")
def get_esg(ticker: str):
    symbol = ticker.upper().strip()
    cached = _cache_get(f"esg_{symbol}", 86400)  # 24-hour cache
    if cached:
        return cached

    try:
        t = yf.Ticker(symbol)
        sus = t.sustainability

        if sus is None or (hasattr(sus, "empty") and sus.empty):
            result = {
                "symbol": symbol,
                "available": False,
                "totalEsg": None,
                "environmentScore": None,
                "socialScore": None,
                "governanceScore": None,
                "esgPerformance": None,
            }
        else:
            def _get(key):
                try:
                    if hasattr(sus, "loc") and key in sus.index:
                        val = sus.loc[key]
                        if hasattr(val, "iloc"):
                            val = val.iloc[0]
                        return round(float(val), 2) if pd.notna(val) else None
                    # dict-style
                    if isinstance(sus, dict):
                        val = sus.get(key)
                        return round(float(val), 2) if val is not None else None
                    return None
                except Exception:
                    return None

            result = {
                "symbol": symbol,
                "available": True,
                "totalEsg": _get("totalEsg"),
                "environmentScore": _get("environmentScore"),
                "socialScore": _get("socialScore"),
                "governanceScore": _get("governanceScore"),
                "esgPerformance": _get("esgPerformance"),
                "peerEsgScorePerformance": _get("peerEsgScorePerformance"),
            }

        _cache_set(f"esg_{symbol}", result)
        return result
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))