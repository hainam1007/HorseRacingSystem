import { useEffect, useMemo, useState } from "react";
import { CalendarDays, ChevronDown, CircleDollarSign, Filter, RefreshCw, Trophy, UsersRound } from "lucide-react";
import { useParams } from "react-router-dom";
import LoadingSkeleton from "../components/LoadingSkeleton";
import { adminApi } from "../api/adminApi";
import AdminLayout from "./AdminLayout";

const formatNumber = (value) => new Intl.NumberFormat("vi-VN").format(Number(value || 0));
const formatCurrency = (value) => new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND", maximumFractionDigits: 0 }).format(Number(value || 0));
const formatTokens = (value) => `${formatNumber(value)} tokens`;
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

function BettorStats({ record }) {
  return <div className="admin-bettor-stats">
    <div><span>Tokens deposited</span><strong>{formatTokens(record?.deposited)}</strong></div>
    <div><span>Tokens staked</span><strong>{formatTokens(record?.staked)}</strong></div>
    <div><span>Tokens received</span><strong>{formatTokens(record?.payout)}</strong></div>
  </div>;
}

function BettorBetDetails({ record }) {
  const details = record?.bet_details || [];
  const totalStaked = details.reduce((total, bet) => total + Number(bet.stake || 0), 0);
  const totalReceived = details.reduce((total, bet) => total + Number(bet.payout || 0), 0);
  return <div className="admin-bettor-bets">
    {details.length ? <table><colgroup><col className="admin-bettor-bets__race" /><col /><col /><col /></colgroup><thead><tr><th scope="col">Race</th><th scope="col">Stake / bet</th><th scope="col">Result</th><th scope="col">Received</th></tr></thead><tbody>{details.map((bet) => <tr key={bet.id}><th scope="row">{bet.race_name}</th><td>{formatTokens(bet.stake)}</td><td className={bet.status === "won" ? "is-won" : "is-lost"}>{bet.status === "won" ? "Won" : "Lost"}</td><td>{formatTokens(bet.payout)}</td></tr>)}</tbody><tfoot><tr><th scope="row">Total for period</th><td>{formatTokens(totalStaked)}</td><td>—</td><td>{formatTokens(totalReceived)}</td></tr></tfoot></table> : <div className="admin-dashboard-empty">No bets in this period.</div>}
  </div>;
}

function HorseRaceDetails({ record }) {
  const details = record?.race_details || [];
  return <div className="admin-horse-races">
    {details.length ? <table><colgroup><col /><col className="admin-horse-races__race" /><col /><col /></colgroup><thead><tr><th scope="col">Tournament</th><th scope="col">Race</th><th scope="col">Finish (field)</th><th scope="col">Outcome</th></tr></thead><tbody>{details.map((race) => <tr key={race.id}><th scope="row">{race.tournament_name}</th><td>{race.race_name}</td><td>{race.position ? `${race.position} / ${race.participants}` : "—"}</td><td>{race.position === 1 ? "Winner" : "Finished"}</td></tr>)}</tbody></table> : <div className="admin-dashboard-empty">No races in this period.</div>}
  </div>;
}

function JockeyRaceDetails({ record }) {
  const details = record?.race_details || [];
  return <div className="admin-jockey-races">
    {details.length ? <table><colgroup><col /><col className="admin-jockey-races__race" /><col /><col /></colgroup><thead><tr><th scope="col">Tournament</th><th scope="col">Race</th><th scope="col">Finish (field)</th><th scope="col">Outcome</th></tr></thead><tbody>{details.map((race) => <tr key={race.id}><th scope="row">{race.tournament_name}</th><td>{race.race_name}</td><td>{race.position ? `${race.position} / ${race.participants}` : "—"}</td><td>{race.position === 1 ? "Winner" : "Finished"}</td></tr>)}</tbody></table> : <div className="admin-dashboard-empty">No races in this period.</div>}
  </div>;
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
  const totals = rows.reduce((result, row) => ({ races: result.races + row.races, wins: result.wins + row.wins, value: result.value + row.value, deposited: result.deposited + (row.deposited || 0), staked: result.staked + (row.staked || 0), payout: result.payout + (row.payout || 0) }), { races: 0, wins: 0, value: 0, deposited: 0, staked: 0, payout: 0 });
  const isBettor = entity === "bettor";

  return <AdminLayout title={config.title} eyebrow={`${config.label} analytics`} description={config.description} actions={<button className="admin-header__button admin-header__button--ghost" disabled={isLoading} type="button" onClick={load}><RefreshCw size={16} className={isLoading ? "admin-competition__spin" : ""} /> Refresh</button>}>
    <section className="admin-entity-toolbar">
      <div className="admin-entity-toolbar__period"><CalendarDays size={16} /><label>From<input type="date" value={from} max={to} onChange={(event) => setFrom(event.target.value)} /></label><span>to</span><label>To<input type="date" value={to} min={from} onChange={(event) => setTo(event.target.value)} /></label><button type="button" onClick={load} disabled={isLoading}>Apply period</button></div>
      <span className="admin-entity-toolbar__source"><Icon size={15} /> Live race records</span>
    </section>
    {isLoading && <LoadingSkeleton ariaLabel={`Loading ${config.label} analytics`} rows={7} variant="table" />}
    {error && <section className="admin-live-state admin-live-state--warning">{error}</section>}
    {!isLoading && !error && <>
      <section className="admin-entity-summary" aria-label={`${config.label} summary`}><Stat label="Records in period" value={formatNumber(rows.length)} /><Stat label="Completed races" value={formatNumber(totals.races)} /><Stat label={config.winLabel} value={formatNumber(totals.wins)} accent /><Stat label={config.valueLabel} value={isBettor ? formatTokens(totals.payout) : formatCurrency(totals.value)} /></section>
      <section className={`admin-entity-workspace${isBettor ? " is-bettor" : ""}${entity === "horse" ? " is-horse" : ""}${entity === "jockey" ? " is-jockey" : ""}`}>
        <article className="admin-entity-ranking"><header><div><p>Ranked directory</p><h2>{config.label}</h2></div><label className="admin-entity-sort"><span>Sort by</span><select value={sort} onChange={(event) => setSort(event.target.value)}><option value="wins">Wins: highest first</option><option value="races">Races: highest first</option><option value="revenue">Revenue: highest first</option></select></label></header>{sortedRows.length ? <div className={`admin-entity-ranking__table${isBettor ? " is-bettor" : ""}${entity === "horse" ? " is-horse" : ""}${entity === "jockey" ? " is-jockey" : ""}`}><div className="admin-entity-ranking__head"><span>#</span><span>{config.singular}</span>{entity === "horse" && <><span>Breed</span><span>Weight</span></>}{entity === "jockey" && <><span>Weight</span><span>Experience</span><span>License</span></>}<span>Races</span><span>Wins</span>{isBettor ? <><span>Deposited</span><span>Total staked</span><span>Total received</span></> : <span>Revenue</span>}</div>{sortedRows.map((row, index) => <button type="button" className="admin-entity-ranking__row" key={row.id} onClick={() => setSelectedId(row.id)}><span>{String(index + 1).padStart(2, "0")}</span><strong>{row.name}</strong>{entity === "horse" && <><span>{row.breed || "—"}</span><span>{row.weight ? `${row.weight} kg` : "—"}</span></>}{entity === "jockey" && <><span>{row.weight_kg ? `${row.weight_kg} kg` : "—"}</span><span>{row.experience_years ?? "—"} yrs</span><span>{row.license_number || "—"}</span></>}<span>{formatNumber(row.races)}</span><b>{formatNumber(row.wins)}</b>{isBettor ? <><em>{formatTokens(row.deposited)}</em><em>{formatTokens(row.staked)}</em><em>{formatTokens(row.payout)}</em></> : <em>{formatCurrency(row.value)}</em>}</button>)}</div> : <div className="admin-dashboard-empty">No completed records in this period.</div>}</article>
        <aside className="admin-entity-detail"><p>Selected {config.singular.toLowerCase()}</p><h2>{selected?.name || `No ${config.singular.toLowerCase()} selected`}</h2><div className="admin-entity-detail__hero"><Icon size={22} /><span>Period<br /><strong>{from} — {to}</strong></span></div>{isBettor ? <BettorBetDetails record={selected} /> : entity === "horse" ? <HorseRaceDetails record={selected} /> : entity === "jockey" ? <JockeyRaceDetails record={selected} /> : <dl><div><dt>Completed races</dt><dd>{formatNumber(selected?.races)}</dd></div><div><dt>{config.winLabel}</dt><dd className="is-accent">{formatNumber(selected?.wins)}</dd></div><div><dt>{config.valueLabel}</dt><dd>{formatCurrency(selected?.value)}</dd></div><div><dt>Win rate</dt><dd>{selected?.races ? `${Math.round((selected.wins / selected.races) * 100)}%` : "0%"}</dd></div></dl>}</aside>
      </section>
    </>}
  </AdminLayout>;
}

export default AdminEntityDashboard;
