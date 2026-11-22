
import os
import sqlite3
import uuid
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import pandas as pd
import yfinance as yf

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import PlainTextResponse
from pydantic import BaseModel, Field


# --------------------------------------------------
# 1. APPLICATION SETUP
# --------------------------------------------------

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"
OUTPUT_DIR = BASE_DIR / "outputs"
REPORT_DIR = BASE_DIR / "reports"

DATA_DIR.mkdir(exist_ok=True)
OUTPUT_DIR.mkdir(exist_ok=True)
REPORT_DIR.mkdir(exist_ok=True)

DB_PATH = DATA_DIR / "market.db"

app = FastAPI(
    title="Stock Market Data Analyzer",
    description="A Python-powered stock market analysis platform",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# --------------------------------------------------
# 2. DATABASE SETUP
# --------------------------------------------------

def get_db():
    return sqlite3.connect(DB_PATH)


def initialize_database():
    con = get_db()
    cur = con.cursor()

    cur.execute("""
        CREATE TABLE IF NOT EXISTS watchlist (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            ticker TEXT UNIQUE NOT NULL
        )
    """)

    cur.execute("""
        CREATE TABLE IF NOT EXISTS transactions (
            id TEXT PRIMARY KEY,
            ticker TEXT NOT NULL,
            side TEXT NOT NULL,
            quantity REAL NOT NULL,
            price REAL NOT NULL,
            created_at TEXT NOT NULL
        )
    """)

    cur.execute("""
        CREATE TABLE IF NOT EXISTS alerts (
            id TEXT PRIMARY KEY,
            ticker TEXT NOT NULL,
            rule TEXT NOT NULL,
            threshold REAL NOT NULL,
            active INTEGER DEFAULT 1,
            last_triggered TEXT
        )
    """)

    cur.execute("""
        CREATE TABLE IF NOT EXISTS backtests (
            id TEXT PRIMARY KEY,
            ticker TEXT NOT NULL,
            pnl REAL,
            max_drawdown REAL,
            sharpe REAL,
            trades INTEGER,
            win_rate REAL,
            created_at TEXT
        )
    """)

    con.commit()
    con.close()


initialize_database()


# --------------------------------------------------
# 3. REQUEST MODELS
# --------------------------------------------------

class WatchlistRequest(BaseModel):
    ticker: str


class TransactionRequest(BaseModel):
    ticker: str
    side: str
    quantity: float = Field(gt=0)
    price: float = Field(gt=0)


class AlertRequest(BaseModel):
    ticker: str
    rule: str
    threshold: float


class BacktestRequest(BaseModel):
    ticker: str
    fee_bps: float = 5


# --------------------------------------------------
# 4. STOCK DATA COLLECTION
# --------------------------------------------------

def fetch_stock_data(ticker, period="1y"):

    ticker = ticker.upper().strip()

    if not ticker:
        raise ValueError("Please enter a stock ticker.")

    allowed_periods = [
        "1mo", "3mo", "6mo", "1y",
        "2y", "5y", "10y", "max"
    ]

    if period not in allowed_periods:
        raise ValueError("Invalid date range.")

    try:
        df = yf.download(
            ticker,
            period=period,
            interval="1d",
            auto_adjust=True,
            progress=False
        )

        if df.empty:
            raise ValueError("No stock data found. Check the ticker.")

        # Handle Yahoo Finance MultiIndex columns
        if isinstance(df.columns, pd.MultiIndex):
            df.columns = df.columns.get_level_values(0)

        df.columns = [
            str(col).lower().replace(" ", "_")
            for col in df.columns
        ]

        df.index = pd.to_datetime(df.index)

        df = df.reset_index()

        if "date" not in df.columns:
            df.rename(columns={df.columns[0]: "date"}, inplace=True)

        required = [
            "open", "high", "low", "close", "volume"
        ]

        for col in required:
            if col not in df.columns:
                raise ValueError(f"Missing stock data column: {col}")

            df[col] = pd.to_numeric(df[col], errors="coerce")

        df = df.dropna(subset=["date", "close"])

        if df.empty:
            raise ValueError("Stock data contains no valid prices.")

        return df.sort_values("date").reset_index(drop=True)

    except Exception as e:
        raise ValueError(str(e))


# --------------------------------------------------
# 5. TECHNICAL INDICATORS
# --------------------------------------------------

def calculate_indicators(df):

    df = df.copy()

    close = df["close"]

    # Daily returns
    df["daily_return"] = close.pct_change() * 100

    # Moving averages
    df["sma20"] = close.rolling(20).mean()
    df["sma50"] = close.rolling(50).mean()

    # RSI
    delta = close.diff()

    gain = delta.clip(lower=0)
    loss = -delta.clip(upper=0)

    avg_gain = gain.rolling(14).mean()
    avg_loss = loss.rolling(14).mean()

    rs = avg_gain / avg_loss.replace(0, np.nan)

    df["rsi14"] = 100 - (100 / (1 + rs))

    df.loc[
        (avg_loss == 0) & (avg_gain > 0), "rsi14"
    ] = 100

    df.loc[
        (avg_gain == 0) & (avg_loss > 0), "rsi14"
    ] = 0

    df.loc[
        (avg_gain == 0) & (avg_loss == 0), "rsi14"
    ] = 50

    # MACD
    ema12 = close.ewm(span=12, adjust=False).mean()
    ema26 = close.ewm(span=26, adjust=False).mean()

    df["macd"] = ema12 - ema26
    df["macd_signal"] = df["macd"].ewm(
        span=9, adjust=False
    ).mean()

    df["macd_hist"] = df["macd"] - df["macd_signal"]

    # Bollinger Bands
    rolling_mean = close.rolling(20).mean()
    rolling_std = close.rolling(20).std()

    df["bb_mid"] = rolling_mean
    df["bb_upper"] = rolling_mean + (2 * rolling_std)
    df["bb_lower"] = rolling_mean - (2 * rolling_std)

    # Annualized volatility
    df["volatility"] = (
        df["daily_return"].rolling(20).std() * np.sqrt(252)
    )

    return df


# --------------------------------------------------
# 6. HELPER FUNCTIONS
# --------------------------------------------------

def safe_number(value, digits=2):

    if pd.isna(value) or not np.isfinite(value):
        return None

    return round(float(value), digits)


def get_analysis(ticker, period="1y"):

    df = fetch_stock_data(ticker, period)
    df = calculate_indicators(df)

    latest = df.iloc[-1]

    previous_close = (
        df.iloc[-2]["close"] if len(df) > 1 else latest["close"]
    )

    change = (
        (latest["close"] - previous_close)
        / previous_close * 100
        if previous_close else 0
    )

    daily_returns = df["daily_return"].dropna()

    volatility = (
        daily_returns.std() * np.sqrt(252)
        if len(daily_returns) > 1 else 0
    )

    cumulative = (1 + daily_returns / 100).cumprod()

    running_peak = cumulative.cummax()
    drawdown = cumulative / running_peak - 1

    max_drawdown = (
        drawdown.min() if not drawdown.empty else 0
    )

    if pd.notna(latest["sma20"]) and pd.notna(latest["sma50"]):
        if latest["sma20"] > latest["sma50"]:
            trend = "Bullish"
        elif latest["sma20"] < latest["sma50"]:
            trend = "Bearish"
        else:
            trend = "Neutral"
    else:
        trend = "Insufficient data"

    rsi = safe_number(latest["rsi14"])

    if rsi is None:
        rsi_status = "Insufficient data"
    elif rsi >= 70:
        rsi_status = "Overbought"
    elif rsi <= 30:
        rsi_status = "Oversold"
    else:
        rsi_status = "Neutral"

    latest_signal = "HOLD"

    if len(df) >= 51:
        previous = df.iloc[-2]

        if (
            previous["sma20"] < previous["sma50"]
            and latest["sma20"] >= latest["sma50"]
        ):
            latest_signal = "BUY"

        elif (
            previous["sma20"] > previous["sma50"]
            and latest["sma20"] <= latest["sma50"]
        ):
            latest_signal = "SELL"

    chart_data = []

    for _, row in df.tail(180).iterrows():

        chart_data.append({
            "date": row["date"].strftime("%Y-%m-%d"),
            "open": safe_number(row["open"]),
            "high": safe_number(row["high"]),
            "low": safe_number(row["low"]),
            "close": safe_number(row["close"]),
            "volume": safe_number(row["volume"], 0),
            "daily_return": safe_number(row["daily_return"]),
            "sma20": safe_number(row["sma20"]),
            "sma50": safe_number(row["sma50"]),
            "rsi14": safe_number(row["rsi14"]),
            "macd": safe_number(row["macd"]),
            "macd_signal": safe_number(row["macd_signal"]),
            "bb_upper": safe_number(row["bb_upper"]),
            "bb_lower": safe_number(row["bb_lower"])
        })

    return {
        "ticker": ticker.upper(),
        "current_price": safe_number(latest["close"]),
        "previous_close": safe_number(previous_close),
        "change_percent": safe_number(change),
        "highest_price": safe_number(df["high"].max()),
        "lowest_price": safe_number(df["low"].min()),
        "average_volume": safe_number(df["volume"].mean(), 0),
        "daily_return": safe_number(latest["daily_return"]),
        "volatility": safe_number(volatility * 100),
        "max_drawdown": safe_number(max_drawdown * 100),
        "sma20": safe_number(latest["sma20"]),
        "sma50": safe_number(latest["sma50"]),
        "rsi": rsi,
        "rsi_status": rsi_status,
        "macd": safe_number(latest["macd"]),
        "trend": trend,
        "signal": latest_signal,
        "history": chart_data
    }


# --------------------------------------------------
# 7. API HOME
# --------------------------------------------------

@app.get("/")
def home():

    return {
        "message": "Stock Market Data Analyzer API",
        "status": "Running",
        "version": "1.0.0"
    }


@app.get("/api/health")
def health():

    return {"status": "healthy"}


# --------------------------------------------------
# 8. STOCK ANALYSIS
# --------------------------------------------------

@app.get("/api/stock/{ticker}")
def stock_analysis(ticker: str, period: str = "1y"):

    try:
        return get_analysis(ticker, period)

    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.get("/api/market/summary")
def market_summary():

    symbols = ["AAPL", "MSFT", "GOOGL", "AMZN", "NVDA"]

    results = []

    for ticker in symbols:
        try:
            result = get_analysis(ticker, "1mo")

            results.append({
                "ticker": ticker,
                "price": result["current_price"],
                "change": result["change_percent"],
                "trend": result["trend"]
            })

        except Exception:
            continue

    return results


# --------------------------------------------------
# 9. WATCHLIST
# --------------------------------------------------

@app.get("/api/watchlist")
def get_watchlist():

    con = get_db()

    rows = con.execute(
        "SELECT ticker FROM watchlist ORDER BY ticker"
    ).fetchall()

    con.close()

    return [row[0] for row in rows]


@app.post("/api/watchlist")
def add_watchlist(item: WatchlistRequest):

    ticker = item.ticker.upper().strip()

    if not ticker:
        raise HTTPException(400, "Ticker is required.")

    con = get_db()

    try:
        con.execute(
            "INSERT INTO watchlist (ticker) VALUES (?)",
            (ticker,)
        )
        con.commit()

    except sqlite3.IntegrityError:
        raise HTTPException(409, "Stock already exists in watchlist.")

    finally:
        con.close()

    return {"message": f"{ticker} added to watchlist."}


@app.delete("/api/watchlist/{ticker}")
def remove_watchlist(ticker: str):

    con = get_db()

    con.execute(
        "DELETE FROM watchlist WHERE ticker=?",
        (ticker.upper(),)
    )

    con.commit()
    con.close()

    return {"message": "Stock removed from watchlist."}


# --------------------------------------------------
# 10. PORTFOLIO MANAGEMENT
# --------------------------------------------------

@app.post("/api/portfolio/transactions")
def add_transaction(item: TransactionRequest):

    ticker = item.ticker.upper().strip()
    side = item.side.upper()

    if side not in ["BUY", "SELL"]:
        raise HTTPException(400, "Side must be BUY or SELL.")

    con = get_db()

    if side == "SELL":

        row = con.execute("""
            SELECT
                COALESCE(SUM(
                    CASE WHEN side='BUY' THEN quantity
                         ELSE -quantity END
                ), 0)
            FROM transactions
            WHERE ticker=?
        """, (ticker,)).fetchone()

        if item.quantity > row[0]:
            con.close()
            raise HTTPException(400, "Insufficient shares to sell.")

    con.execute("""
        INSERT INTO transactions
        (id, ticker, side, quantity, price, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
    """, (
        str(uuid.uuid4()),
        ticker,
        side,
        item.quantity,
        item.price,
        datetime.now(timezone.utc).isoformat()
    ))

    con.commit()
    con.close()

    return {"message": "Transaction recorded successfully."}


@app.get("/api/portfolio")
def get_portfolio():

    con = get_db()

    rows = con.execute("""
        SELECT ticker,
               SUM(CASE WHEN side='BUY' THEN quantity
                        ELSE -quantity END) AS quantity,
               SUM(CASE WHEN side='BUY' THEN quantity * price
                        ELSE 0 END) AS buy_value,
               SUM(CASE WHEN side='BUY' THEN quantity
                        ELSE 0 END) AS buy_quantity
        FROM transactions
        GROUP BY ticker
    """).fetchall()

    con.close()

    positions = []
    total_value = 0
    total_cost = 0

    for ticker, quantity, buy_value, buy_quantity in rows:

        if quantity <= 0:
            continue

        avg_cost = buy_value / buy_quantity if buy_quantity else 0

        try:
            analysis = get_analysis(ticker, "1mo")
            current_price = analysis["current_price"]

        except Exception:
            current_price = None

        market_value = (
            quantity * current_price
            if current_price is not None else None
        )

        cost_value = quantity * avg_cost

        positions.append({
            "ticker": ticker,
            "quantity": safe_number(quantity),
            "average_cost": safe_number(avg_cost),
            "current_price": current_price,
            "market_value": safe_number(market_value),
            "profit_loss": (
                safe_number(market_value - cost_value)
                if market_value is not None else None
            )
        })

        if market_value is not None:
            total_value += market_value
            total_cost += cost_value

    return {
        "positions": positions,
        "total_value": safe_number(total_value),
        "total_cost": safe_number(total_cost),
        "total_profit_loss": safe_number(total_value - total_cost)
    }


# --------------------------------------------------
# 11. BACKTESTING
# --------------------------------------------------

@app.post("/api/backtest")
def run_backtest(item: BacktestRequest):

    if item.fee_bps < 0:
        raise HTTPException(400, "Fee cannot be negative.")

    try:
        df = fetch_stock_data(item.ticker, "5y")
        df = calculate_indicators(df)

        df = df.dropna(subset=["sma20", "sma50"]).reset_index(drop=True)

        if len(df) < 2:
            raise ValueError("Not enough data for backtesting.")

        signal = (df["sma20"] > df["sma50"]).astype(int)

        # Trade using the previous day's signal
        position = signal.shift(1).fillna(0)

        returns = df["close"].pct_change().fillna(0)

        gross_returns = position * returns

        turnover = position.diff().abs().fillna(0)

        transaction_cost = turnover * (item.fee_bps / 10000)

        net_returns = gross_returns - transaction_cost

        equity = (1 + net_returns).cumprod()

        pnl = float(equity.iloc[-1] - 1)

        peak = equity.cummax()

        max_drawdown = float(
            (equity / peak - 1).min()
        )

        sharpe = (
            float(
                np.sqrt(252)
                * net_returns.mean()
                / net_returns.std()
            )
            if net_returns.std() > 0 else 0
        )

        trades = int(turnover.sum())

        winning_trades = int(
            ((net_returns > 0) & (turnover > 0)).sum()
        )

        win_rate = (
            winning_trades / trades if trades else 0
        )

        result = {
            "ticker": item.ticker.upper(),
            "total_return": safe_number(pnl * 100),
            "max_drawdown": safe_number(max_drawdown * 100),
            "sharpe_ratio": safe_number(sharpe),
            "trades": trades,
            "win_rate": safe_number(win_rate * 100),
            "equity_curve": [
                {
                    "date": date.strftime("%Y-%m-%d"),
                    "value": safe_number(value)
                }
                for date, value in zip(df["date"], equity)
            ]
        }

        con = get_db()

        con.execute("""
            INSERT INTO backtests
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            str(uuid.uuid4()),
            item.ticker.upper(),
            pnl * 100,
            max_drawdown * 100,
            sharpe,
            trades,
            win_rate * 100,
            datetime.now(timezone.utc).isoformat()
        ))

        con.commit()
        con.close()

        return result

    except Exception as e:
        raise HTTPException(400, detail=str(e))


@app.get("/api/backtests")
def backtest_history():

    con = get_db()

    rows = con.execute("""
        SELECT * FROM backtests ORDER BY created_at DESC
    """).fetchall()

    con.close()

    columns = [
        "id", "ticker", "total_return", "max_drawdown",
        "sharpe_ratio", "trades", "win_rate", "created_at"
    ]

    return [dict(zip(columns, row)) for row in rows]


# --------------------------------------------------
# 12. ALERT MANAGEMENT
# --------------------------------------------------

@app.get("/api/alerts")
def get_alerts():

    con = get_db()

    rows = con.execute("""
        SELECT * FROM alerts ORDER BY rowid DESC
    """).fetchall()

    con.close()

    columns = [
        "id", "ticker", "rule", "threshold",
        "active", "last_triggered"
    ]

    return [dict(zip(columns, row)) for row in rows]


@app.post("/api/alerts")
def create_alert(item: AlertRequest):

    ticker = item.ticker.upper().strip()
    rule = item.rule.upper()

    allowed_rules = [
        "RSI_BELOW",
        "RSI_ABOVE",
        "PRICE_ABOVE",
        "PRICE_BELOW"
    ]

    if rule not in allowed_rules:
        raise HTTPException(400, "Invalid alert rule.")

    if rule in ["RSI_BELOW", "RSI_ABOVE"]:
        if not 0 <= item.threshold <= 100:
            raise HTTPException(400, "RSI threshold must be between 0 and 100.")

    con = get_db()

    alert_id = str(uuid.uuid4())

    con.execute("""
        INSERT INTO alerts
        (id, ticker, rule, threshold, active)
        VALUES (?, ?, ?, ?, 1)
    """, (alert_id, ticker, rule, item.threshold))

    con.commit()
    con.close()

    return {"message": "Alert created.", "id": alert_id}


@app.delete("/api/alerts/{alert_id}")
def delete_alert(alert_id: str):

    con = get_db()

    con.execute(
        "DELETE FROM alerts WHERE id=?",
        (alert_id,)
    )

    con.commit()
    con.close()

    return {"message": "Alert deleted."}


@app.post("/api/alerts/evaluate")
def evaluate_alerts():

    con = get_db()

    alerts = con.execute("""
        SELECT id, ticker, rule, threshold
        FROM alerts WHERE active=1
    """).fetchall()

    con.close()

    triggered = []

    for alert_id, ticker, rule, threshold in alerts:

        try:
            analysis = get_analysis(ticker, "1y")

            price = analysis["current_price"]
            rsi = analysis["rsi"]

            matched = False

            if rule == "RSI_BELOW" and rsi is not None:
                matched = rsi < threshold

            elif rule == "RSI_ABOVE" and rsi is not None:
                matched = rsi > threshold

            elif rule == "PRICE_ABOVE":
                matched = price > threshold

            elif rule == "PRICE_BELOW":
                matched = price < threshold

            if matched:

                triggered.append({
                    "ticker": ticker,
                    "rule": rule,
                    "threshold": threshold,
                    "current_price": price,
                    "rsi": rsi,
                    "message": f"{ticker}: {rule} condition triggered."
                })

                con = get_db()

                con.execute("""
                    UPDATE alerts SET last_triggered=?
                    WHERE id=?
                """, (
                    datetime.now(timezone.utc).isoformat(),
                    alert_id
                ))

                con.commit()
                con.close()

        except Exception:
            continue

    return {
        "triggered_count": len(triggered),
        "alerts": triggered
    }


# --------------------------------------------------
# 13. ANALYSIS REPORT
# --------------------------------------------------

@app.get("/api/report/{ticker}")
def generate_report(ticker: str, period: str = "1y"):

    try:
        analysis = get_analysis(ticker, period)

        report = f"""
STOCK MARKET DATA ANALYZER
=====================================

Stock: {analysis['ticker']}
Generated: {datetime.now().strftime('%Y-%m-%d %H:%M')}

PRICE SUMMARY
-------------------------------------
Current Price: {analysis['current_price']}
Previous Close: {analysis['previous_close']}
Price Change: {analysis['change_percent']}%

Highest Price: {analysis['highest_price']}
Lowest Price: {analysis['lowest_price']}

TECHNICAL ANALYSIS
-------------------------------------
SMA 20: {analysis['sma20']}
SMA 50: {analysis['sma50']}
RSI: {analysis['rsi']}
RSI Status: {analysis['rsi_status']}
MACD: {analysis['macd']}

Trend: {analysis['trend']}
Latest Crossover Signal: {analysis['signal']}

RISK ANALYSIS
-------------------------------------
Annualized Volatility: {analysis['volatility']}%
Maximum Historical Drawdown: {analysis['max_drawdown']}%

DISCLAIMER
-------------------------------------
This report is for educational purposes only.
It is not financial advice or a recommendation
to buy or sell any security.

=====================================
END OF REPORT
"""

        filename = f"{ticker.upper()}_analysis_report.txt"

        report_path = REPORT_DIR / filename
        report_path.write_text(report, encoding="utf-8")

        return {
            "message": "Report generated successfully.",
            "filename": filename,
            "report": report,
            "download_url": f"/api/report/{ticker}/download?period={period}"
        }

    except Exception as e:
        raise HTTPException(400, detail=str(e))


@app.get("/api/report/{ticker}/download")
def download_report(ticker: str, period: str = "1y"):

    try:
        analysis = get_analysis(ticker, period)

        lines = [
            "STOCK MARKET DATA ANALYZER",
            "=" * 40,
            f"Stock: {analysis['ticker']}",
            f"Generated: {datetime.now().isoformat()}",
            "",
            "PRICE SUMMARY",
            f"Current Price: {analysis['current_price']}",
            f"Price Change: {analysis['change_percent']}%",
            f"Highest Price: {analysis['highest_price']}",
            f"Lowest Price: {analysis['lowest_price']}",
            "",
            "TECHNICAL ANALYSIS",
            f"SMA20: {analysis['sma20']}",
            f"SMA50: {analysis['sma50']}",
            f"RSI: {analysis['rsi']}",
            f"MACD: {analysis['macd']}",
            f"Trend: {analysis['trend']}",
            "",
            "RISK ANALYSIS",
            f"Volatility: {analysis['volatility']}%",
            f"Maximum Drawdown: {analysis['max_drawdown']}%",
            "",
            "For educational purposes only. Not financial advice."
        ]

        content = "\n".join(lines)

        return PlainTextResponse(
            content,
            headers={
                "Content-Disposition":
                f'attachment; filename="{ticker.upper()}_report.txt"'
            }
        )

    except Exception as e:
        raise HTTPException(400, detail=str(e))


# --------------------------------------------------
# 14. APPLICATION INFORMATION
# --------------------------------------------------

@app.get("/api/dashboard")
def dashboard():

    con = get_db()

    watchlist_count = con.execute(
        "SELECT COUNT(*) FROM watchlist"
    ).fetchone()[0]

    transaction_count = con.execute(
        "SELECT COUNT(*) FROM transactions"
    ).fetchone()[0]

    backtest_count = con.execute(
        "SELECT COUNT(*) FROM backtests"
    ).fetchone()[0]

    alert_count = con.execute(
        "SELECT COUNT(*) FROM alerts WHERE active=1"
    ).fetchone()[0]

    con.close()

    return {
        "watchlist_count": watchlist_count,
        "transaction_count": transaction_count,
        "backtest_count": backtest_count,
        "active_alerts": alert_count
    }
