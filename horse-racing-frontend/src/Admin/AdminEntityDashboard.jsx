import { useEffect, useMemo, useState } from "react";
import { CalendarDays, ChevronDown, CircleDollarSign, Filter, RefreshCw, Trophy, UsersRound } from "lucide-react";
import { useParams } from "react-router-dom";
import LoadingSkeleton from "../components/LoadingSkeleton";
import { adminApi } from "../api/adminApi";
import AdminLayout from "./AdminLayout";

const formatNumber = (value) => new Intl.NumberFormat("vi-VN").format(Number(value || 0));
const formatCurrency = (value) => new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND", maximumFractionDigits: 0 }).format(Number(value || 0));
const formatDate = (value) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(value);

const DASHBOARDS = {
  horseowner: { label: "Horse owners", singular: "Horse owner", title: "Owner performance", description: "Track stable performance, prize earnings, and race participation by owner.", icon: UsersRound, valueLabel: "Owner prize earnings", winLabel: "Winning races" },
  jockey: { label: "Jockeys", singular: "Jockey", title: "Jockey performance", description: "Compare jockey wins, race volume, and prize earnings over the selected period.", icon: Trophy, valueLabel: "Jockey earnings", winLabel: "Winning rides" },
  referee: { label: "Referees", singular: "Referee", title: "Referee workload", description: "Review completed race assignments and workload distribution for every referee.", icon: Filter, valueLabel: "Recorded earnings", winLabel: "Winning races" },
  horse: { label: "Horses", singular: "Horse", title: "Horse performance", description: "Find the strongest horses by wins, starts, and prize earnings in any period.", icon: Trophy, valueLabel: "Prize earnings", winLabel: "Wins" },
  bettor: { label: "Bettors", singular: "Bettor", title: "Bettor performance", description: "Review betting activity, wins, and payouts for each bettor.", icon: CircleDollarSign, valueLabel: "Payouts", winLabel: "Winning bets" }
};

function dateInput(value) {
  return value ? value.toISOString().slice(0, 10) : "";
}

function Stat({ label, value, accent = false }) {
  return <div className={`admin-entity-stat${accent ? " is-accent" : ""}`}><span>{label}</span><strong>{value}</strong></div>;
}

function AdminEntityDashboard() {
  const { entity = "horse" } = useParams();
  const config = DASHBOARDS[entity] || DASHBOARDS.horse;
  const [from, setFrom] = useState(() => dateInput(new Date(Date.now() - 29 * 86400000)));
  const [to, setTo] = useState(() => dateInput(new Date()));
  const [rows, setRows] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [sort, setSort] = useState("wins");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const Icon = config.icon;

  const load = async () => {
    setIsLoading(true); setError("");
    try {
      const response = await adminApi.getEntityAnalytics({ from, to });
      setRows(response?.entities?.[entity] || []);
    } catch (loadError) {
      setError(loadError.message || "Unable to load entity analytics.");
    } finally { setIsLoading(false); }
  };

  useEffect(() => { load(); }, [entity]);

  const sortedRows = useMemo(() => [...rows].sort((left, right) => {
    if (sort === "races") return right.races - left.races || right.wins - left.wins;
    if (sort === "revenue") return right.value - left.value || right.wins - left.wins;
    return right.wins - left.wins || right.races - left.races;
  }), [rows, sort]);
  const selected = sortedRows.find((row) => row.id === selectedId) || sortedRows[0];
  const totals = rows.reduce((result, row) => ({ races: result.races + row.races, wins: result.wins + row.wins, value: result.value + row.value }), { races: 0, wins: 0, value: 0 });

  return <AdminLayout title={config.title} eyebrow={`${config.label} analytics`} description={config.description} actions={<button className="admin-header__button admin-header__button--ghost" disabled={isLoading} type="button" onClick={load}><RefreshCw size={16} className={isLoading ? "admin-competition__spin" : ""} /> Refresh</button>}>
    <section className="admin-entity-toolbar">
      <div className="admin-entity-toolbar__period"><CalendarDays size={16} /><label>From<input type="date" value={from} max={to} onChange={(event) => setFrom(event.target.value)} /></label><span>to</span><label>To<input type="date" value={to} min={from} onChange={(event) => setTo(event.target.value)} /></label><button type="button" onClick={load} disabled={isLoading}>Apply period</button></div>
      <span className="admin-entity-toolbar__source"><Icon size={15} /> Live race records</span>
    </section>
    {isLoading && <LoadingSkeleton ariaLabel={`Loading ${config.label} analytics`} rows={7} variant="table" />}
    {error && <section className="admin-live-state admin-live-state--warning">{error}</section>}
    {!isLoading && !error && <>
      <section className="admin-entity-summary" aria-label={`${config.label} summary`}><Stat label="Records in period" value={formatNumber(rows.length)} /><Stat label="Completed races" value={formatNumber(totals.races)} /><Stat label={config.winLabel} value={formatNumber(totals.wins)} accent /><Stat label={config.valueLabel} value={formatCurrency(totals.value)} /></section>
      <section className="admin-entity-workspace">
        <article className="admin-entity-ranking"><header><div><p>Ranked directory</p><h2>{config.label}</h2></div><label className="admin-entity-sort"><span>Sort by</span><select value={sort} onChange={(event) => setSort(event.target.value)}><option value="wins">Wins: highest first</option><option value="races">Races: highest first</option><option value="revenue">Revenue: highest first</option></select></label></header>{sortedRows.length ? <div className="admin-entity-ranking__table"><div className="admin-entity-ranking__head"><span>#</span><span>{config.singular}</span><span>Races</span><span>Wins</span><span>Revenue</span></div>{sortedRows.map((row, index) => <button type="button" className={`admin-entity-ranking__row${selected?.id === row.id ? " is-selected" : ""}`} key={row.id} onClick={() => setSelectedId(row.id)}><span>{String(index + 1).padStart(2, "0")}</span><strong>{row.name}</strong><span>{formatNumber(row.races)}</span><b>{formatNumber(row.wins)}</b><em>{formatCurrency(row.value)}</em></button>)}</div> : <div className="admin-dashboard-empty">No completed records in this period.</div>}</article>
        <aside className="admin-entity-detail"><p>Selected {config.singular.toLowerCase()}</p><h2>{selected?.name || `No ${config.singular.toLowerCase()} selected`}</h2><div className="admin-entity-detail__hero"><Icon size={22} /><span>Period<br /><strong>{from} — {to}</strong></span></div><dl><div><dt>Completed races</dt><dd>{formatNumber(selected?.races)}</dd></div><div><dt>{config.winLabel}</dt><dd className="is-accent">{formatNumber(selected?.wins)}</dd></div><div><dt>{config.valueLabel}</dt><dd>{formatCurrency(selected?.value)}</dd></div><div><dt>Win rate</dt><dd>{selected?.races ? `${Math.round((selected.wins / selected.races) * 100)}%` : "0%"}</dd></div></dl></aside>
      </section>
    </>}
  </AdminLayout>;
}

export default AdminEntityDashboard;
