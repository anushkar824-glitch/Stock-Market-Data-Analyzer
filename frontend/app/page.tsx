
"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Activity, BarChart3, Bell, BriefcaseBusiness, ChartNoAxesCombined,
  ChevronDown, CircleDollarSign, Clock3, Download, Eye, LayoutDashboard,
  LineChart as LineIcon, Menu, Plus, RefreshCw, Search, Settings,
  ShieldCheck, Sparkles, TrendingDown, TrendingUp, Wallet, X
} from "lucide-react";

import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Legend,
  Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis
} from "recharts";

const API = "http://127.0.0.1:8000";

const navigation = [
  { name: "Overview", icon: LayoutDashboard },
  { name: "Stock Explorer", icon: Search },
  { name: "Watchlist", icon: Eye },
  { name: "Portfolio", icon: Wallet },
  { name: "Backtesting", icon: ChartNoAxesCombined },
  { name: "Alerts", icon: Bell },
  { name: "Reports", icon: BarChart3 },
];

const periods = ["1mo", "3mo", "6mo", "1y", "2y", "5y"];

const money = (value: number | null | undefined) =>
  value == null ? "—" : `$${value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const percent = (value: number | null | undefined) =>
  value == null ? "—" : `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;

export default function Home() {
  const [section, setSection] = useState("Overview");
  const [ticker, setTicker] = useState("AAPL");
  const [searchInput, setSearchInput] = useState("AAPL");
  const [period, setPeriod] = useState("1y");

  const [stock, setStock] = useState<any>(null);
  const [market, setMarket] = useState<any[]>([]);
  const [watchlist, setWatchlist] = useState<string[]>([]);
  const [portfolio, setPortfolio] = useState<any>(null);
  const [dashboard, setDashboard] = useState<any>(null);
  const [backtest, setBacktest] = useState<any>(null);
  const [alerts, setAlerts] = useState<any[]>([]);
  const [report, setReport] = useState("");

  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const [quantity, setQuantity] = useState("1");
  const [price, setPrice] = useState("");
  const [side, setSide] = useState("BUY");

  const [alertRule, setAlertRule] = useState("RSI_BELOW");
  const [threshold, setThreshold] = useState("30");

  const [fee, setFee] = useState("5");
  const [mobileMenu, setMobileMenu] = useState(false);

  async function request(url: string, options?: RequestInit) {
    const response = await fetch(`${API}${url}`, options);
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.detail || "Something went wrong.");
    }

    return data;
  }

  async function loadStock(symbol = ticker, selectedPeriod = period) {
    setLoading(true);
    setError("");

    try {
      const data = await request(
        `/api/stock/${encodeURIComponent(symbol)}?period=${selectedPeriod}`
      );

      setStock(data);
      setTicker(symbol);
      setSearchInput(symbol);
      setPrice(String(data.current_price ?? ""));
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function loadAll() {
    try {
      const [markets, watch, port, dash, alertData] = await Promise.all([
        request("/api/market/summary"),
        request("/api/watchlist"),
        request("/api/portfolio"),
        request("/api/dashboard"),
        request("/api/alerts"),
      ]);

      setMarket(markets);
      setWatchlist(watch);
      setPortfolio(port);
      setDashboard(dash);
      setAlerts(alertData);
    } catch (e: any) {
      setError(e.message);
    }
  }

  useEffect(() => {
    loadStock("AAPL", "1y");
    loadAll();
  }, []);

  async function refreshAll() {
    setMessage("");
    await loadStock(ticker, period);
    await loadAll();
  }

  async function addWatchlist(symbol: string) {
    try {
      await request("/api/watchlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticker: symbol }),
      });

      setMessage(`${symbol} added to watchlist.`);
      await loadAll();
    } catch (e: any) {
      setError(e.message);
    }
  }

  async function removeWatchlist(symbol: string) {
    try {
      await request(`/api/watchlist/${symbol}`, { method: "DELETE" });
      setMessage(`${symbol} removed.`);
      await loadAll();
    } catch (e: any) {
      setError(e.message);
    }
  }

  async function runBacktest() {
    setLoading(true);
    setError("");

    try {
      const result = await request("/api/backtest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ticker,
          fee_bps: Number(fee),
        }),
      });

      setBacktest(result);
      setMessage("Backtest completed successfully.");
      await loadAll();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function addTransaction() {
    try {
      await request("/api/portfolio/transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ticker,
          side,
          quantity: Number(quantity),
          price: Number(price),
        }),
      });

      setMessage("Portfolio transaction recorded.");
      await loadAll();
    } catch (e: any) {
      setError(e.message);
    }
  }

  async function createAlert() {
    try {
      await request("/api/alerts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ticker,
          rule: alertRule,
          threshold: Number(threshold),
        }),
      });

      setMessage("New alert created.");
      await loadAll();
    } catch (e: any) {
      setError(e.message);
    }
  }

  async function evaluateAlerts() {
    try {
      const result = await request("/api/alerts/evaluate", {
        method: "POST",
      });

      setMessage(
        `${result.triggered_count} alert(s) triggered.`
      );

      await loadAll();
    } catch (e: any) {
      setError(e.message);
    }
  }

  async function generateReport() {
    try {
      const result = await request(
        `/api/report/${ticker}?period=${period}`
      );

      setReport(result.report);
      setMessage("Analysis report generated.");
    } catch (e: any) {
      setError(e.message);
    }
  }

  const chartData = useMemo(
    () => stock?.history || [],
    [stock]
  );

  const up = (stock?.change_percent ?? 0) >= 0;

  function MetricCard({
    label,
    value,
    change,
    icon: Icon,
    color = "blue",
  }: any) {
    const colors: any = {
      blue: "bg-blue-50 text-blue-600",
      green: "bg-emerald-50 text-emerald-600",
      purple: "bg-violet-50 text-violet-600",
      orange: "bg-orange-50 text-orange-600",
    };

    return (
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:shadow-md">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium text-slate-500">{label}</p>
          <div className={`rounded-lg p-2.5 ${colors[color]}`}>
            <Icon size={19} />
          </div>
        </div>
        <p className="mt-4 text-2xl font-bold tracking-tight text-slate-900">
          {value ?? "—"}
        </p>
        {change && (
          <p className="mt-2 text-xs text-slate-500">{change}</p>
        )}
      </div>
    );
  }

  function Panel({
    title,
    subtitle,
    children,
    action,
  }: any) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="font-semibold text-slate-900">{title}</h3>
            {subtitle && (
              <p className="mt-1 text-xs text-slate-500">{subtitle}</p>
            )}
          </div>
          {action}
        </div>
        {children}
      </div>
    );
  }

  function SectionTitle({
    title,
    subtitle,
  }: {
    title: string;
    subtitle: string;
  }) {
    return (
      <div className="mb-6">
        <h2 className="text-2xl font-bold tracking-tight text-slate-900">
          {title}
        </h2>
        <p className="mt-1 text-sm text-slate-500">{subtitle}</p>
      </div>
    );
  }

  function StockTable({ rows }: { rows: any[] }) {
    return (
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-xs text-slate-400">
              <th className="pb-3 font-medium">STOCK</th>
              <th className="pb-3 font-medium">PRICE</th>
              <th className="pb-3 font-medium">CHANGE</th>
              <th className="pb-3 font-medium">TREND</th>
              <th className="pb-3 font-medium">ACTION</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((item) => (
              <tr key={item.ticker} className="border-b border-slate-50 last:border-0">
                <td className="py-4 font-semibold text-slate-800">
                  {item.ticker}
                </td>
                <td className="py-4 text-slate-700">
                  {money(item.price ?? item.current_price)}
                </td>
                <td className={`py-4 font-medium ${
                  (item.change ?? item.change_percent ?? 0) >= 0
                    ? "text-emerald-600" : "text-rose-600"
                }`}>
                  {percent(item.change ?? item.change_percent)}
                </td>
                <td className="py-4">
                  <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-600">
                    {item.trend}
                  </span>
                </td>
                <td className="py-4">
                  <button
                    onClick={() => loadStock(item.ticker)}
                    className="font-medium text-blue-600 hover:text-blue-800"
                  >
                    View
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  function renderOverview() {
    return (
      <>
        <SectionTitle
          title="Market Overview"
          subtitle="Your financial market activity at a glance."
        />

        <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            label="Selected Stock Price"
            value={money(stock?.current_price)}
            change={stock ? `${percent(stock.change_percent)} today` : "Loading data"}
            icon={CircleDollarSign}
            color="blue"
          />
          <MetricCard
            label="Portfolio Value"
            value={money(portfolio?.total_value)}
            change="Based on available market prices"
            icon={Wallet}
            color="green"
          />
          <MetricCard
            label="Watchlist Stocks"
            value={dashboard?.watchlist_count ?? 0}
            change="Stocks being monitored"
            icon={Eye}
            color="purple"
          />
          <MetricCard
            label="Active Alerts"
            value={dashboard?.active_alerts ?? 0}
            change="Configured alert rules"
            icon={Bell}
            color="orange"
          />
        </div>

        <div className="mb-6 grid grid-cols-1 gap-5 xl:grid-cols-3">
          <div className="xl:col-span-2">
            <Panel
              title={`${ticker} Price Performance`}
              subtitle="Historical closing price and moving averages"
              action={
                <div className="flex gap-1 rounded-lg bg-slate-100 p-1">
                  {periods.map((p) => (
                    <button
                      key={p}
                      onClick={() => {
                        setPeriod(p);
                        loadStock(ticker, p);
                      }}
                      className={`rounded-md px-2 py-1 text-xs font-medium ${
                        period === p
                          ? "bg-white text-blue-600 shadow-sm"
                          : "text-slate-500"
                      }`}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              }
            >
              <div className="mb-4 flex flex-wrap gap-4 text-xs text-slate-500">
                <span className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-blue-600" />
                  Closing Price
                </span>
                <span className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-emerald-500" />
                  SMA 20
                </span>
                <span className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-orange-400" />
                  SMA 50
                </span>
              </div>

              <div className="h-[300px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData}>
                    <CartesianGrid stroke="#edf0f5" strokeDasharray="4 4" />
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: 10, fill: "#94a3b8" }}
                      tickLine={false}
                      axisLine={false}
                      minTickGap={35}
                    />
                    <YAxis
                      domain={["auto", "auto"]}
                      tick={{ fontSize: 10, fill: "#94a3b8" }}
                      tickLine={false}
                      axisLine={false}
                    />
                    <Tooltip />
                    <Line
                      dataKey="close"
                      stroke="#2563eb"
                      strokeWidth={2.5}
                      dot={false}
                      name="Close"
                    />
                    <Line
                      dataKey="sma20"
                      stroke="#10b981"
                      strokeWidth={1.8}
                      dot={false}
                      connectNulls
                      name="SMA 20"
                    />
                    <Line
                      dataKey="sma50"
                      stroke="#f59e0b"
                      strokeWidth={1.8}
                      dot={false}
                      connectNulls
                      name="SMA 50"
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </Panel>
          </div>

          <Panel
            title="Stock Insights"
            subtitle={`Technical summary for ${ticker}`}
          >
            <div className="space-y-5">
              {[
                ["Market Trend", stock?.trend],
                ["RSI Status", stock?.rsi_status],
                ["Latest Signal", stock?.signal],
                ["RSI Value", stock?.rsi?.toFixed(2)],
                ["SMA 20", money(stock?.sma20)],
                ["SMA 50", money(stock?.sma50)],
              ].map(([label, value]) => (
                <div key={label} className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <span className="text-sm text-slate-500">{label}</span>
                  <span className="text-sm font-semibold text-slate-800">
                    {value ?? "—"}
                  </span>
                </div>
              ))}
              <div className="rounded-lg bg-blue-50 p-3 text-xs leading-5 text-blue-700">
                Indicators are calculated from historical price data and should not be treated as trading instructions.
              </div>
            </div>
          </Panel>
        </div>

        <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
          <Panel
            title="Daily Returns"
            subtitle="Percentage movement in daily closing prices"
          >
            <div className="h-[230px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData.slice(-60)}>
                  <CartesianGrid stroke="#edf0f5" strokeDasharray="4 4" />
                  <XAxis dataKey="date" hide />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip />
                  <Bar dataKey="daily_return" fill="#647eea" name="Daily Return %" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Panel>

          <Panel
            title="Market Watch"
            subtitle="Popular stocks and their recent performance"
            action={
              <button
                onClick={loadAll}
                className="text-xs font-semibold text-blue-600"
              >
                Refresh
              </button>
            }
          >
            <StockTable rows={market} />
          </Panel>
        </div>
      </>
    );
  }

  function renderExplorer() {
    return (
      <>
        <SectionTitle
          title="Stock Explorer"
          subtitle="Search and analyze historical stock market data."
        />

        <Panel title="Find a Stock" subtitle="Enter a valid Yahoo Finance ticker symbol">
          <form
            className="flex flex-col gap-3 sm:flex-row"
            onSubmit={(e) => {
              e.preventDefault();
              loadStock(searchInput.toUpperCase());
            }}
          >
            <div className="flex flex-1 items-center gap-3 rounded-lg border border-slate-200 px-4">
              <Search size={18} className="text-slate-400" />
              <input
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value.toUpperCase())}
                placeholder="Enter ticker e.g. AAPL"
                className="w-full py-3 text-sm outline-none"
              />
            </div>
            <button className="rounded-lg bg-blue-600 px-6 py-3 text-sm font-semibold text-white hover:bg-blue-700">
              Analyze Stock
            </button>
          </form>

          <div className="mt-4 flex flex-wrap gap-2">
            {["AAPL", "MSFT", "GOOGL", "AMZN", "NVDA", "TSLA"].map((symbol) => (
              <button
                key={symbol}
                onClick={() => {
                  setSearchInput(symbol);
                  loadStock(symbol);
                }}
                className="rounded-md border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:border-blue-300 hover:text-blue-600"
              >
                {symbol}
              </button>
            ))}
          </div>
        </Panel>

        {stock && (
          <>
            <div className="my-5 grid grid-cols-2 gap-4 lg:grid-cols-4">
              <MetricCard label="Current Price" value={money(stock.current_price)} icon={CircleDollarSign} />
              <MetricCard label="Price Change" value={percent(stock.change_percent)} icon={stock.change_percent >= 0 ? TrendingUp : TrendingDown} color={up ? "green" : "orange"} />
              <MetricCard label="Highest Price" value={money(stock.highest_price)} icon={TrendingUp} color="purple" />
              <MetricCard label="Lowest Price" value={money(stock.lowest_price)} icon={TrendingDown} color="orange" />
            </div>

            <div className="mb-5">
              <Panel title={`${ticker} Historical Analysis`} subtitle="Price, SMA20 and SMA50">
                <div className="h-[350px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData}>
                      <CartesianGrid stroke="#edf0f5" strokeDasharray="4 4" />
                      <XAxis dataKey="date" tick={{ fontSize: 10 }} minTickGap={35} />
                      <YAxis domain={["auto", "auto"]} tick={{ fontSize: 10 }} />
                      <Tooltip />
                      <Legend />
                      <Line dataKey="close" stroke="#2563eb" dot={false} strokeWidth={2.5} />
                      <Line dataKey="sma20" stroke="#10b981" dot={false} connectNulls />
                      <Line dataKey="sma50" stroke="#f59e0b" dot={false} connectNulls />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </Panel>
            </div>

            <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
              <Panel title="Technical Indicators" subtitle="Latest calculated indicator values">
                <div className="space-y-4">
                  {[
                    ["RSI (14)", stock.rsi],
                    ["MACD", stock.macd],
                    ["SMA 20", stock.sma20],
                    ["SMA 50", stock.sma50],
                  ].map(([name, value]) => (
                    <div key={name} className="flex justify-between border-b border-slate-100 pb-3 text-sm">
                      <span className="text-slate-500">{name}</span>
                      <strong className="text-slate-800">
                        {value == null ? "—" : typeof value === "number" ? value.toFixed(2) : value}
                      </strong>
                    </div>
                  ))}
                </div>
              </Panel>

              <Panel title="Risk Analysis" subtitle="Historical risk measurements">
                <div className="space-y-4">
                  {[
                    ["Annualized Volatility", `${stock.volatility ?? "—"}%`],
                    ["Maximum Drawdown", `${stock.max_drawdown ?? "—"}%`],
                    ["Average Volume", stock.average_volume?.toLocaleString() ?? "—"],
                    ["Trend", stock.trend],
                    ["RSI Condition", stock.rsi_status],
                  ].map(([name, value]) => (
                    <div key={name} className="flex justify-between border-b border-slate-100 pb-3 text-sm">
                      <span className="text-slate-500">{name}</span>
                      <strong className="text-slate-800">{value}</strong>
                    </div>
                  ))}
                </div>
              </Panel>
            </div>

            <button
              onClick={() => addWatchlist(ticker)}
              className="mt-5 flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-3 text-sm font-semibold text-white"
            >
              <Plus size={17} /> Add to Watchlist
            </button>
          </>
        )}
      </>
    );
  }

  function renderWatchlist() {
    return (
      <>
        <SectionTitle
          title="My Watchlist"
          subtitle="Keep track of stocks you're interested in."
        />
        <Panel
          title="Saved Stocks"
          subtitle={`${watchlist.length} stocks in your watchlist`}
          action={
            <button onClick={loadAll} className="text-sm font-semibold text-blue-600">
              <RefreshCw size={15} className="inline mr-1" /> Refresh
            </button>
          }
        >
          {watchlist.length === 0 ? (
            <div className="py-12 text-center text-sm text-slate-400">
              Your watchlist is empty. Add stocks from Stock Explorer.
            </div>
          ) : (
            <div className="space-y-3">
              {watchlist.map((symbol) => (
                <div key={symbol} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-100 p-4">
                  <div>
                    <p className="font-bold text-slate-800">{symbol}</p>
                    <p className="mt-1 text-xs text-slate-400">Saved stock</p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => loadStock(symbol)}
                      className="rounded-lg bg-blue-50 px-4 py-2 text-xs font-semibold text-blue-600"
                    >
                      Analyze
                    </button>
                    <button
                      onClick={() => removeWatchlist(symbol)}
                      className="rounded-lg bg-rose-50 px-4 py-2 text-xs font-semibold text-rose-600"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Panel>
      </>
    );
  }

  function renderPortfolio() {
    return (
      <>
        <SectionTitle
          title="Portfolio Tracker"
          subtitle="Manage simulated stock purchases and sales."
        />

        <div className="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <MetricCard label="Portfolio Value" value={money(portfolio?.total_value)} icon={Wallet} color="blue" />
          <MetricCard label="Invested Cost" value={money(portfolio?.total_cost)} icon={BriefcaseBusiness} color="purple" />
          <MetricCard label="Unrealized P&L" value={money(portfolio?.total_profit_loss)} icon={Activity} color="green" />
        </div>

        <div className="mb-5">
          <Panel title="Record a Transaction" subtitle="Use the currently selected stock ticker and price">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <label className="mb-2 block text-xs font-medium text-slate-500">Ticker</label>
                <input value={ticker} readOnly className="w-full rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm" />
              </div>
              <div>
                <label className="mb-2 block text-xs font-medium text-slate-500">Transaction Type</label>
                <select value={side} onChange={(e) => setSide(e.target.value)} className="w-full rounded-lg border border-slate-200 p-3 text-sm">
                  <option value="BUY">Buy</option>
                  <option value="SELL">Sell</option>
                </select>
              </div>
              <div>
                <label className="mb-2 block text-xs font-medium text-slate-500">Quantity</label>
                <input type="number" min="0.01" step="any" value={quantity} onChange={(e) => setQuantity(e.target.value)} className="w-full rounded-lg border border-slate-200 p-3 text-sm" />
              </div>
              <div>
                <label className="mb-2 block text-xs font-medium text-slate-500">Price (USD)</label>
                <input type="number" min="0.01" step="any" value={price} onChange={(e) => setPrice(e.target.value)} className="w-full rounded-lg border border-slate-200 p-3 text-sm" />
              </div>
            </div>
            <button
              onClick={addTransaction}
              className="mt-4 rounded-lg bg-blue-600 px-5 py-3 text-sm font-semibold text-white"
            >
              Record Transaction
            </button>
          </Panel>
        </div>

        <Panel title="Current Holdings" subtitle="Your simulated portfolio positions">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b text-xs text-slate-400">
                  {["STOCK", "QUANTITY", "AVERAGE COST", "MARKET PRICE", "MARKET VALUE", "P&L"].map(x => <th key={x} className="pb-3 pr-5">{x}</th>)}
                </tr>
              </thead>
              <tbody>
                {(portfolio?.positions || []).map((item: any) => (
                  <tr key={item.ticker} className="border-b border-slate-50">
                    <td className="py-4 font-bold">{item.ticker}</td>
                    <td>{item.quantity}</td>
                    <td>{money(item.average_cost)}</td>
                    <td>{money(item.current_price)}</td>
                    <td>{money(item.market_value)}</td>
                    <td className={item.profit_loss >= 0 ? "text-emerald-600" : "text-rose-600"}>{money(item.profit_loss)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {(!portfolio?.positions || portfolio.positions.length === 0) && (
              <p className="py-8 text-center text-sm text-slate-400">No holdings yet. Record your first simulated purchase.</p>
            )}
          </div>
        </Panel>
      </>
    );
  }

  function renderBacktesting() {
    return (
      <>
        <SectionTitle
          title="Strategy Backtesting"
          subtitle="Evaluate a moving-average strategy using historical market data."
        />

        <div className="mb-5">
          <Panel title="SMA Crossover Strategy" subtitle="Buy when SMA20 is above SMA50; exit when it falls below.">
            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <label className="mb-2 block text-xs text-slate-500">Selected Stock</label>
                <input value={ticker} readOnly className="w-full rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm" />
              </div>
              <div>
                <label className="mb-2 block text-xs text-slate-500">Transaction Fee (basis points)</label>
                <input type="number" min="0" value={fee} onChange={(e) => setFee(e.target.value)} className="w-full rounded-lg border border-slate-200 p-3 text-sm" />
              </div>
              <div className="flex items-end">
                <button
                  onClick={runBacktest}
                  disabled={loading}
                  className="w-full rounded-lg bg-blue-600 p-3 text-sm font-semibold text-white disabled:opacity-50"
                >
                  Run Backtest
                </button>
              </div>
            </div>
          </Panel>
        </div>

        {backtest ? (
          <>
            <div className="mb-5 grid grid-cols-2 gap-4 xl:grid-cols-4">
              <MetricCard label="Total Return" value={percent(backtest.total_return)} icon={TrendingUp} color="green" />
              <MetricCard label="Maximum Drawdown" value={percent(backtest.max_drawdown)} icon={TrendingDown} color="orange" />
              <MetricCard label="Sharpe Ratio" value={backtest.sharpe_ratio?.toFixed(2)} icon={Activity} color="purple" />
              <MetricCard label="Number of Trades" value={backtest.trades} icon={BarChart3} />
            </div>

            <Panel title="Strategy Equity Curve" subtitle="Growth of a hypothetical starting investment of 1 unit">
              <div className="h-[320px]">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={backtest.equity_curve}>
                    <defs>
                      <linearGradient id="equityFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#2563eb" stopOpacity={0.25} />
                        <stop offset="100%" stopColor="#2563eb" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke="#edf0f5" strokeDasharray="4 4" />
                    <XAxis dataKey="date" tick={{ fontSize: 10 }} minTickGap={35} />
                    <YAxis tick={{ fontSize: 10 }} />
                    <Tooltip />
                    <Area dataKey="value" stroke="#2563eb" fill="url(#equityFill)" strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </Panel>
            <p className="mt-4 text-xs leading-5 text-slate-500">
              Win rate: {percent(backtest.win_rate)}. This is a simplified historical simulation and does not guarantee future returns. Its execution assumptions and trade counting are educational approximations.
            </p>
          </>
        ) : (
          <Panel title="Backtest Results" subtitle="Your results will appear here">
            <div className="py-12 text-center text-sm text-slate-400">
              Select a stock and run your first strategy backtest.
            </div>
          </Panel>
        )}
      </>
    );
  }

  function renderAlerts() {
    return (
      <>
        <SectionTitle
          title="Market Alerts"
          subtitle="Create rules to monitor historical price and technical indicator conditions."
        />

        <div className="mb-5">
          <Panel title="Create New Alert" subtitle={`Monitoring ticker: ${ticker}`}>
            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <label className="mb-2 block text-xs text-slate-500">Rule</label>
                <select value={alertRule} onChange={(e) => setAlertRule(e.target.value)} className="w-full rounded-lg border border-slate-200 p-3 text-sm">
                  <option value="RSI_BELOW">RSI Below</option>
                  <option value="RSI_ABOVE">RSI Above</option>
                  <option value="PRICE_ABOVE">Price Above</option>
                  <option value="PRICE_BELOW">Price Below</option>
                </select>
              </div>
              <div>
                <label className="mb-2 block text-xs text-slate-500">Threshold</label>
                <input type="number" value={threshold} onChange={(e) => setThreshold(e.target.value)} className="w-full rounded-lg border border-slate-200 p-3 text-sm" />
              </div>
              <div className="flex items-end">
                <button onClick={createAlert} className="w-full rounded-lg bg-blue-600 p-3 text-sm font-semibold text-white">
                  <Plus size={15} className="mr-1 inline" /> Create Alert
                </button>
              </div>
            </div>
          </Panel>
        </div>

        <Panel
          title="Configured Alerts"
          subtitle={`${alerts.length} alert rules`}
          action={
            <button onClick={evaluateAlerts} className="rounded-lg bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-600">
              Evaluate Alerts
            </button>
          }
        >
          {alerts.length === 0 ? (
            <p className="py-10 text-center text-sm text-slate-400">No alerts created yet.</p>
          ) : (
            <div className="space-y-3">
              {alerts.map((alert) => (
                <div key={alert.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-100 p-4">
                  <div>
                    <p className="font-semibold text-slate-800">{alert.ticker} · {alert.rule}</p>
                    <p className="mt-1 text-xs text-slate-400">Threshold: {alert.threshold} · {alert.active ? "Active" : "Inactive"}</p>
                  </div>
                  <button
                    onClick={async () => {
                      await request(`/api/alerts/${alert.id}`, { method: "DELETE" });
                      await loadAll();
                    }}
                    className="text-xs font-semibold text-rose-600"
                  >
                    Delete
                  </button>
                </div>
              ))}
            </div>
          )}
          <p className="mt-4 text-xs text-slate-400">
            Alerts are evaluated manually using the latest available daily historical data. They do not send automatic notifications.
          </p>
        </Panel>
      </>
    );
  }

  function renderReports() {
    return (
      <>
        <SectionTitle
          title="Analysis Reports"
          subtitle="Generate and download stock performance reports."
        />

        <Panel title="Generate Stock Report" subtitle={`Create a report for ${ticker}`}>
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={generateReport}
              className="rounded-lg bg-blue-600 px-5 py-3 text-sm font-semibold text-white"
            >
              <BarChart3 size={16} className="mr-2 inline" />
              Generate Report
            </button>
            <a
              href={`${API}/api/report/${ticker}/download?period=${period}`}
              className="rounded-lg border border-slate-200 px-5 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              <Download size={16} className="mr-2 inline" />
              Download TXT
            </a>
          </div>
          {report && (
            <pre className="mt-5 max-h-[500px] overflow-auto whitespace-pre-wrap rounded-lg bg-slate-950 p-5 text-xs leading-6 text-emerald-300">
              {report}
            </pre>
          )}
        </Panel>
      </>
    );
  }

  const pages: Record<string, () => React.ReactNode> = {
    Overview: renderOverview,
    "Stock Explorer": renderExplorer,
    Watchlist: renderWatchlist,
    Portfolio: renderPortfolio,
    Backtesting: renderBacktesting,
    Alerts: renderAlerts,
    Reports: renderReports,
  };

  return (
    <div className="min-h-screen bg-[#f5f7fb] text-slate-900">

      {/* SIDEBAR */}

      <aside className={`fixed inset-y-0 left-0 z-50 flex w-[255px] flex-col bg-[#111b32] text-white transition-transform lg:translate-x-0 ${
        mobileMenu ? "translate-x-0" : "-translate-x-full"
      }`}>
        <div className="flex h-[76px] items-center gap-3 border-b border-white/10 px-6">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600">
            <ChartNoAxesCombined size={23} />
          </div>
          <div>
            <p className="text-sm font-bold tracking-wide">MarketScope</p>
            <p className="text-[10px] tracking-widest text-slate-400">ANALYTICS PLATFORM</p>
          </div>
          <button onClick={() => setMobileMenu(false)} className="ml-auto lg:hidden">
            <X size={20} />
          </button>
        </div>

        <div className="px-5 pt-7">
          <p className="mb-3 px-3 text-[10px] font-semibold tracking-[2px] text-slate-500">
            WORKSPACE
          </p>

          <nav className="space-y-1">
            {navigation.map(({ name, icon: Icon }) => (
              <button
                key={name}
                onClick={() => {
                  setSection(name);
                  setMobileMenu(false);
                }}
                className={`flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left text-sm transition ${
                  section === name
                    ? "bg-blue-600 text-white shadow-lg shadow-blue-950/20"
                    : "text-slate-400 hover:bg-white/5 hover:text-white"
                }`}
              >
                <Icon size={18} />
                {name}
                {name === "Alerts" && alerts.length > 0 && (
                  <span className="ml-auto rounded-full bg-rose-500 px-2 py-0.5 text-[10px] text-white">
                    {alerts.length}
                  </span>
                )}
              </button>
            ))}
          </nav>
        </div>

        <div className="mt-auto p-5">
          <div className="rounded-xl border border-white/10 bg-white/5 p-4">
            <div className="mb-3 flex items-center gap-2 text-blue-300">
              <Sparkles size={16} />
              <span className="text-xs font-semibold">Market Insights</span>
            </div>
            <p className="text-xs leading-5 text-slate-400">
              Analyze price trends, indicators and historical performance in one place.
            </p>
          </div>
          <div className="mt-5 border-t border-white/10 pt-4 text-center text-[10px] text-slate-500">
            STOCK MARKET DATA ANALYZER
            <br /> EDUCATIONAL PROJECT · v1.0
          </div>
        </div>
      </aside>

      {/* MAIN CONTENT */}

      <div className="min-h-screen lg:ml-[255px]">

        {/* TOP BAR */}

        <header className="sticky top-0 z-30 flex h-[76px] items-center justify-between border-b border-slate-200 bg-white/95 px-5 backdrop-blur md:px-8">
          <div className="flex items-center gap-3">
            <button onClick={() => setMobileMenu(true)} className="text-slate-600 lg:hidden">
              <Menu size={22} />
            </button>
            <div>
              <p className="text-xs text-slate-400">Workspace / {section}</p>
              <p className="text-sm font-semibold text-slate-800">{section}</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 sm:flex">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              <span className="text-xs font-medium text-emerald-700">Analytics Workspace</span>
            </div>
            <button
              onClick={refreshAll}
              className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
            >
              <RefreshCw size={14} />
              <span className="hidden sm:inline">Refresh</span>
            </button>
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-100 text-xs font-bold text-blue-700">
              SA
            </div>
          </div>
        </header>

        {/* CONTENT AREA */}

        <main className="mx-auto max-w-[1500px] p-5 md:p-8">

          <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-blue-600">
                Financial Intelligence
              </p>
              <h1 className="mt-1 text-xl font-bold text-slate-900 md:text-2xl">
                {section === "Overview" ? "Welcome to MarketScope" : section}
              </h1>
            </div>
            <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-500">
              <Clock3 size={14} />
              Historical market data
            </div>
          </div>

          {error && (
            <div className="mb-5 flex items-center justify-between rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
              <span>{error}</span>
              <button onClick={() => setError("")}><X size={16} /></button>
            </div>
          )}

          {message && (
            <div className="mb-5 flex items-center justify-between rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
              <span>{message}</span>
              <button onClick={() => setMessage("")}><X size={16} /></button>
            </div>
          )}

          {loading && (
            <div className="mb-4 text-xs font-medium text-blue-600">
              Loading market data...
            </div>
          )}

          {pages[section]()}
          
          <footer className="mt-10 border-t border-slate-200 pt-5 text-center text-xs leading-6 text-slate-400">
            MarketScope · Stock Market Data Analyzer
            <br />
            Educational project only. Not financial advice or a recommendation to buy or sell securities.
          </footer>

        </main>
      </div>
    </div>
  );
}
