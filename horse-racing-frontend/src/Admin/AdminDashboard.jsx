import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, ArrowUpRight, CalendarDays, Check, CheckCircle2, ChevronDown, CircleDollarSign, RefreshCw, TrendingDown, TrendingUp, Trophy, UsersRound, WalletCards } from "lucide-react";
import LoadingSkeleton from "../components/LoadingSkeleton";
import { adminApi } from "../api/adminApi";
import AdminLayout from "./AdminLayout";
import AdminRoleMatrixTable from "./AdminRoleMatrixTable";
import AdminCashflowMatrixTable from "./AdminCashflowMatrixTable";
import AdminEquineJockeyTable from "./AdminEquineJockeyTable";

const number = (value) => new Intl.NumberFormat("en-US").format(Number(value || 0));
const vnd = (value) => new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND", maximumFractionDigits: 0 }).format(Number(value || 0));
const dateLabel = (value) => value ? new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short" }).format(new Date(`${value}T00:00:00`)) : "—";

function changeLabel(change) {
  if (change === null || change === undefined) return "No prior period";
  return `${change > 0 ? "+" : ""}${change}% vs prior period`;
}

const PERIOD_OPTIONS = [
  { value: "7", label: "Last 7 days", meta: "Short-term pulse" },
  { value: "30", label: "Last 30 days", meta: "Monthly operating view" },
  { value: "90", label: "Last 90 days", meta: "Quarterly performance" }
];

function PeriodPicker({ value, onChange, disabled }) {
  const [isOpen, setIsOpen] = useState(false);
  const pickerRef = useRef(null);
  const selected = PERIOD_OPTIONS.find((option) => option.value === value) || PERIOD_OPTIONS[1];

  useEffect(() => {
    const closeOnOutsideClick = (event) => {
      if (!pickerRef.current?.contains(event.target)) setIsOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutsideClick);
    return () => document.removeEventListener("pointerdown", closeOnOutsideClick);
  }, []);

  return <div className={`admin-analytics-range${isOpen ? " is-open" : ""}`} ref={pickerRef}>
    <span className="admin-analytics-range__label">Period</span>
    <div className="admin-analytics-picker">
      <button
        className="admin-analytics-picker__trigger"
        type="button"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        disabled={disabled}
        onClick={() => setIsOpen((open) => !open)}
      >
        <span className="admin-analytics-picker__indicator" aria-hidden="true"><CalendarDays size={14} /></span>
        <span className="admin-analytics-picker__value"><strong>{selected.label}</strong><small>{selected.meta}</small></span>
        <ChevronDown size={16} aria-hidden="true" />
      </button>
      {isOpen && <div className="admin-analytics-picker__menu" role="listbox" aria-label="Reporting period">
        <div className="admin-analytics-picker__menu-heading">Reporting window</div>
        {PERIOD_OPTIONS.map((option) => <button
          key={option.value}
          className={`admin-analytics-picker__option${option.value === value ? " is-selected" : ""}`}
          type="button"
          role="option"
          aria-selected={option.value === value}
          onClick={() => { onChange(option.value); setIsOpen(false); }}
        >
          <span><strong>{option.label}</strong><small>{option.meta}</small></span>
          {option.value === value && <Check size={16} aria-hidden="true" />}
        </button>)}
      </div>}
    </div>
  </div>;
}

function Metric({ icon: Icon, label, data, format = number, tone = "neutral" }) {
  const value = typeof data === "object" ? data?.value : data;
  const change = typeof data === "object" ? data?.change : null;
  return <article className={`admin-analytics-metric admin-analytics-metric--${tone}`}>
    <span className="admin-analytics-metric__icon"><Icon size={18} aria-hidden="true" /></span>
    <span className="admin-analytics-metric__label">{label}</span>
    <strong>{format(value)}</strong>
    <small className={change < 0 ? "is-down" : ""}>{change < 0 ? <TrendingDown size={13} /> : <TrendingUp size={13} />}{changeLabel(change)}</small>
  </article>;
}

function chartAxisLabel(value) {
  const absolute = Math.abs(value);
  if (absolute >= 1000000) return `${(value / 1000000).toFixed(absolute >= 10000000 ? 0 : 1).replace(/\.0$/, "")}M`;
  if (absolute >= 1000) return `${(value / 1000).toFixed(absolute >= 10000 ? 0 : 1).replace(/\.0$/, "")}K`;
  return number(value);
}

function niceAxisMaximum(value) {
  if (value <= 1) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const normalized = value / magnitude;
  const step = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return step * magnitude;
}

function smoothLine(points) {
  if (!points.length) return "";
  if (points.length === 1) return `M${points[0].x},${points[0].y}`;

  const controlPoint = (current, previous, next, reverse = false) => {
    const before = previous || current;
    const after = next || current;
    const length = Math.hypot(after.x - before.x, after.y - before.y) * 0.16;
    const angle = Math.atan2(after.y - before.y, after.x - before.x) + (reverse ? Math.PI : 0);
    return { x: current.x + Math.cos(angle) * length, y: current.y + Math.sin(angle) * length };
  };

  return points.slice(1).reduce((path, current, index) => {
    const previous = points[index];
    const previousControl = controlPoint(previous, points[index - 1], current);
    const currentControl = controlPoint(current, previous, points[index + 2], true);
    const minimumY = Math.min(previous.y, current.y);
    const maximumY = Math.max(previous.y, current.y);
    previousControl.y = Math.max(minimumY, Math.min(maximumY, previousControl.y));
    currentControl.y = Math.max(minimumY, Math.min(maximumY, currentControl.y));
    return `${path} C${previousControl.x.toFixed(1)},${previousControl.y.toFixed(1)} ${currentControl.x.toFixed(1)},${currentControl.y.toFixed(1)} ${current.x.toFixed(1)},${current.y.toFixed(1)}`;
  }, `M${points[0].x.toFixed(1)},${points[0].y.toFixed(1)}`);
}

function LineChart({ points, dataKey, color, valueFormatter, title, unit }) {
  const [activeIndex, setActiveIndex] = useState(null);
  const values = points.map((point) => Number(point[dataKey] || 0));
  const width = 720;
  const height = 278;
  const bounds = { top: 16, right: 18, bottom: 52, left: 68 };
  const plotWidth = width - bounds.left - bounds.right;
  const plotHeight = height - bounds.top - bounds.bottom;
  const axisMaximum = niceAxisMaximum(Math.max(...values, 0));
  const chartPoints = values.map((value, index) => ({
    x: bounds.left + (index * plotWidth) / Math.max(values.length - 1, 1),
    y: bounds.top + plotHeight - (value / axisMaximum) * plotHeight,
    value
  }));
  const linePath = smoothLine(chartPoints);
  const baseline = bounds.top + plotHeight;
  const areaPath = chartPoints.length ? `${linePath} L${chartPoints.at(-1).x.toFixed(1)},${baseline} L${chartPoints[0].x.toFixed(1)},${baseline} Z` : "";
  const last = values.at(-1) || 0;
  const activePoint = activeIndex === null ? null : chartPoints[activeIndex];
  const yTicks = Array.from({ length: 5 }, (_, index) => axisMaximum - (axisMaximum * index) / 4);
  const maxVisibleDates = values.length <= 8 ? values.length : 6;
  const xTickIndexes = Array.from({ length: maxVisibleDates }, (_, index) => Math.round((index * Math.max(values.length - 1, 0)) / Math.max(maxVisibleDates - 1, 1)));

  const setActivePointFromEvent = (event) => {
    if (!chartPoints.length) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const cursorX = ((event.clientX - rect.left) / rect.width) * width;
    const index = Math.round(((cursorX - bounds.left) / plotWidth) * Math.max(values.length - 1, 0));
    setActiveIndex((current) => Math.max(0, Math.min(values.length - 1, index)) === current ? current : Math.max(0, Math.min(values.length - 1, index)));
  };

  const moveActivePoint = (direction) => {
    setActiveIndex((current) => Math.max(0, Math.min(values.length - 1, (current ?? values.length - 1) + direction)));
  };

  return <article className="admin-analytics-chart">
    <header><div><p>Trend by day</p><h2>{title}</h2></div><strong>{valueFormatter(values.reduce((sum, value) => sum + value, 0))}</strong></header>
    <div
      className="admin-analytics-chart__plot"
      role="group"
      tabIndex="0"
      aria-label={`${title}. Vertical axis: ${unit}. Horizontal axis: date. Move the pointer across the chart or use left and right arrow keys to inspect a day.`}
      onPointerMove={setActivePointFromEvent}
      onPointerDown={setActivePointFromEvent}
      onPointerLeave={() => setActiveIndex(null)}
      onFocus={() => setActiveIndex((current) => current ?? Math.max(values.length - 1, 0))}
      onBlur={() => setActiveIndex(null)}
      onKeyDown={(event) => {
        if (event.key === "ArrowLeft") { event.preventDefault(); moveActivePoint(-1); }
        if (event.key === "ArrowRight") { event.preventDefault(); moveActivePoint(1); }
        if (event.key === "Escape") { setActiveIndex(null); event.currentTarget.blur(); }
      }}
    >
      <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" aria-hidden="true">
        <g className="admin-analytics-chart__grid">
          {yTicks.map((tick) => {
            const y = bounds.top + plotHeight - (tick / axisMaximum) * plotHeight;
            return <g key={tick}><line x1={bounds.left} x2={width - bounds.right} y1={y} y2={y} /><text x={bounds.left - 10} y={y + 3.5} textAnchor="end">{chartAxisLabel(tick)}</text></g>;
          })}
          {xTickIndexes.map((index) => <g key={index}><line className="admin-analytics-chart__grid-line--vertical" x1={chartPoints[index]?.x} x2={chartPoints[index]?.x} y1={bounds.top} y2={baseline} /><text x={chartPoints[index]?.x} y={baseline + 19} textAnchor={index === 0 ? "start" : index === values.length - 1 ? "end" : "middle"}>{dateLabel(points[index]?.date)}</text></g>)}
        </g>
        <line className="admin-analytics-chart__axis" x1={bounds.left} x2={width - bounds.right} y1={baseline} y2={baseline} />
        <line className="admin-analytics-chart__axis" x1={bounds.left} x2={bounds.left} y1={bounds.top} y2={baseline} />
        <text className="admin-analytics-chart__axis-title" x={bounds.left + plotWidth / 2} y={height - 6} textAnchor="middle">Time</text>
        <text className="admin-analytics-chart__axis-title" x="14" y={bounds.top + plotHeight / 2} textAnchor="middle" transform={`rotate(-90 14 ${bounds.top + plotHeight / 2})`}>Unit ({unit})</text>
        {areaPath && <path className="admin-analytics-chart__area" d={areaPath} style={{ "--chart-color": color }} />}
        {linePath && <path className="admin-analytics-chart__line" d={linePath} style={{ "--chart-color": color }} />}
        {activePoint && <line className="admin-analytics-chart__cursor" x1={activePoint.x} x2={activePoint.x} y1={bounds.top} y2={baseline} />}
        {chartPoints.map((point, index) => <circle key={points[index]?.date || index} className={`admin-analytics-chart__point${activeIndex === index ? " is-active" : ""}`} cx={point.x} cy={point.y} r={activeIndex === index ? 5 : 3} style={{ "--chart-color": color }} />)}
      </svg>
      {activePoint && <div className={`admin-analytics-chart__tooltip${activeIndex === 0 ? " is-left" : activeIndex === values.length - 1 ? " is-right" : ""}`} style={{ left: `${(activePoint.x / width) * 100}%` }} role="status"><span>{dateLabel(points[activeIndex]?.date)}</span><strong>{valueFormatter(activePoint.value)}</strong><small>{unit}</small></div>}
    </div>
    <div className="admin-analytics-chart__legend"><span><i style={{ "--chart-color": color }} />Daily value</span><span>Hover or use ← → to inspect</span></div>
  </article>;
}

function AdminDashboard() {
  const [dashboard, setDashboard] = useState(null);
  const [range, setRange] = useState("30");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  const load = async (days = range) => {
    setIsLoading(true); setError(""); setDashboard(null);
    try {
      const to = new Date();
      const from = new Date(Date.now() - (Number(days) - 1) * 86400000);
      const toString = (date) => date.toLocaleDateString("en-CA", { timeZone: "Asia/Ho_Chi_Minh" });
      const params = { from: toString(from), to: toString(to) };
      const response = await adminApi.getDashboard(params);
      if (!response?.period || !response?.metrics || !Array.isArray(response?.charts?.daily)) {
        throw new Error("Dashboard API is running an outdated contract. Restart the backend service and refresh this page.");
      }
      setDashboard(response);
    } catch (apiError) { setError(apiError.message || "Unable to load live dashboard data."); }
    finally { setIsLoading(false); }
  };

  useEffect(() => { load(); }, []);
  const metrics = dashboard?.metrics || {};
  const daily = dashboard?.charts?.daily || [];
  const statuses = useMemo(() => dashboard?.charts?.race_statuses || [], [dashboard]);
  const alerts = dashboard?.alerts || [];
  const topRaces = dashboard?.operations?.top_races || [];
  const roleMatrix = dashboard?.role_matrix || null;
  const maxStatus = Math.max(...statuses.map((item) => item.value), 1);

  return <AdminLayout title="Betting & race operations" eyebrow="Live business intelligence" description="Monitor acquisition, cash flow, wagering exposure, race delivery, and operational risk from verified platform records." actions={<>
    <PeriodPicker value={range} onChange={(value) => { setRange(value); load(value); }} disabled={isLoading} />
    <button className="admin-header__button admin-header__button--ghost" disabled={isLoading} type="button" onClick={() => load()}><RefreshCw size={16} className={isLoading ? "admin-competition__spin" : ""} /> Refresh</button>
  </>}>
    <section className="admin-command-strip" aria-label="Dashboard context"><div><CheckCircle2 size={16} /><span>Data source</span><strong>Live database aggregate</strong></div><div><CalendarDays size={16} /><span>Reporting period</span><strong>{dashboard?.period ? `${dateLabel(dashboard.period.from)} — ${dateLabel(dashboard.period.to)}` : "Loading"}</strong></div><div><span>Comparison</span><strong>Previous matching period</strong></div></section>
    {isLoading && <LoadingSkeleton ariaLabel="Loading business dashboard" rows={6} variant="table" />}
    {error && <section className="admin-live-state admin-live-state--warning" aria-live="assertive"><AlertTriangle size={17} />{error}</section>}
    {!isLoading && dashboard && <>
      <section className="admin-analytics-metrics" aria-label="Commercial KPIs">
        <Metric icon={UsersRound} label="New users" data={metrics.new_users} />
        <Metric icon={WalletCards} label="Successful deposits" data={metrics.deposits_vnd} format={vnd} tone="money" />
        <Metric icon={CircleDollarSign} label="Wagered (tokens)" data={metrics.stakes_tokens} tone="money" />
        <Metric icon={TrendingUp} label="Gross gaming margin (tokens)" data={metrics.gross_gaming_margin_tokens} tone="money" />
        <Metric icon={Trophy} label="Races held" data={metrics.races_held} />
        <Metric icon={CalendarDays} label="Active tournaments" data={metrics.tournaments_in_period} />
      </section>

      {/* 1. ROLE-BASED OPERATIONS & PERFORMANCE MATRIX */}
      <AdminRoleMatrixTable roleMatrix={roleMatrix} isLoading={isLoading} />

      {/* 2. DEPOSIT PACKAGES & LIQUIDITY MATRIX */}
      <AdminCashflowMatrixTable
        cashflowMatrix={dashboard?.cashflow_matrix}
        isLoading={isLoading}
      />

      {/* 3. EQUINE & JOCKEY PERFORMANCE DIRECTORY */}
      <AdminEquineJockeyTable
        equineDirectory={dashboard?.equine_directory}
        isLoading={isLoading}
      />

      <section className="admin-analytics-layout">
        <div className="admin-analytics-charts">
          <LineChart points={daily} dataKey="deposits_vnd" color="#ef933d" valueFormatter={vnd} title="Successful deposits (VND)" unit="VND" />
          <LineChart points={daily} dataKey="stakes_tokens" color="#67d49f" valueFormatter={number} title="Wagering volume (tokens)" unit="tokens" />
          <LineChart points={daily} dataKey="new_users" color="#77a8f5" valueFormatter={number} title="New user acquisition" unit="users" />
          <LineChart points={daily} dataKey="races_held" color="#d6b566" valueFormatter={number} title="Completed races" unit="races" />
        </div>
        <aside className="admin-analytics-alerts"><header><p>Attention queue</p><h2>Operational signals</h2></header>{alerts.length ? alerts.map((alert) => <Link key={alert.key} to={alert.href}><span className={alert.attention ? "is-alert" : ""}>{number(alert.value)}</span><div><strong>{alert.label}</strong><small>{alert.attention ? "Needs review" : (alert.value ? "Planned" : "All clear")}</small></div><ArrowUpRight size={16} /></Link>) : <div className="admin-dashboard-empty"><CheckCircle2 size={18} />No operational alerts returned.</div>}</aside>
      </section>
      <section className="admin-analytics-bottom">
        <article className="admin-analytics-table"><header><div><p>Betting concentration</p><h2>Top races by stake</h2></div><Link to="/admin/schedule">Race schedule <ArrowUpRight size={15} /></Link></header>{topRaces.length ? topRaces.map((race) => <div className="admin-analytics-table__row" key={race.race_id}><div><strong>{race.name || "Race removed"}</strong><small>{race.status || "Unknown status"} · {number(race.bets)} bets</small></div><span>{number(race.stakes)} tokens</span><em>{number(race.gross_gaming_margin)} GGR</em></div>) : <div className="admin-dashboard-empty"><CheckCircle2 size={18} />No bets placed in this reporting period.</div>}</article>
        <article className="admin-analytics-status"><header><p>Race programme</p><h2>Race status mix</h2></header>{statuses.length ? statuses.map((status) => <div key={status.status}><span><strong>{status.status}</strong><small>{number(status.value)} races</small></span><i><b style={{ width: `${(status.value / maxStatus) * 100}%` }} /></i></div>) : <div className="admin-dashboard-empty"><CheckCircle2 size={18} />No race records yet.</div>}</article>
      </section>
      <section className="admin-live-state" aria-live="polite"><CheckCircle2 size={17} />All dashboard values are generated from current users, deposits, bets, races, results, and incident records. No mock data is shown.</section>
    </>}
  </AdminLayout>;
}

export default AdminDashboard;
