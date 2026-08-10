import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowRight, RefreshCw, Search, ShieldCheck, UserRoundCheck, X } from "lucide-react";
import { Link } from "react-router-dom";
import { adminApi } from "../api/adminApi";
import LoadingSkeleton from "../components/LoadingSkeleton";
import AdminLayout from "./AdminLayout";

const PAGE_SIZE = 20;

const directoryConfig = {
  jockeys: {
    title: "Jockey directory",
    eyebrow: "Participant directory",
    description: "Review jockey accounts, licences, experience, and race records.",
    role: "jockey",
    profileKey: "jockey",
    icon: UserRoundCheck,
  },
  referees: {
    title: "Referee directory",
    eyebrow: "Official directory",
    description: "Review referee accounts, licences, experience, and availability.",
    role: "race_referee",
    profileKey: "race_referee",
    icon: ShieldCheck,
  },
};

function getUser(item) {
  return item?.user || item || {};
}

function statusLabel(value) {
  const labels = { active: "Active", pending_verification: "Pending", blocked: "Suspended", disabled: "Disabled", clear: "Clear", suspended: "Suspended" };
  return labels[value] || value || "Not set";
}

function statusTone(value) {
  const normalized = String(value || "").toLowerCase();
  if (["active", "clear"].includes(normalized)) return "green";
  if (["blocked", "disabled", "suspended"].includes(normalized)) return "red";
  if (normalized.includes("pending")) return "amber";
  return "gray";
}

function StatusBadge({ value }) {
  return <span className={`admin-status-badge admin-status-badge--${statusTone(value)}`}>{statusLabel(value)}</span>;
}

function profileFields(moduleName, profile) {
  if (moduleName === "jockeys") return [
    ["Licence", profile.license_number || "Not set"],
    ["Experience", `${profile.experience_years || 0} years`],
    ["Weight", (profile.weight_kg ?? profile.weight) ? `${profile.weight_kg ?? profile.weight} kg` : "Not set"],
    ["Races", String(profile.total_races || 0)],
    ["Wins", String(profile.total_wins || 0)],
    ["Discipline", statusLabel(profile.disciplinary_status)],
    ["Suspended until", profile.suspended_until ? new Date(profile.suspended_until).toLocaleDateString() : "-"],
  ];
  return [
    ["Licence", profile.license_number || "Not set"],
    ["Experience", `${profile.experience_years || 0} years`],
    ["Profile status", statusLabel(profile.status)],
  ];
}

function AdminRegistryModule({ moduleName }) {
  const config = directoryConfig[moduleName];
  const [records, setRecords] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, total: 0, total_pages: 0 });
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const timer = window.setTimeout(() => setSearch(query.trim()), 320);
    return () => window.clearTimeout(timer);
  }, [query]);

  useEffect(() => { setPage(1); }, [search, status, moduleName]);
  useEffect(() => { setSelected(null); }, [page, search, status, moduleName]);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await adminApi.listUsers({ page, limit: PAGE_SIZE, role: config.role, email: search, status });
      setRecords(response.users || []);
      setPagination(response.pagination || { page, total: (response.users || []).length, total_pages: 1 });
    } catch (apiError) {
      setRecords([]);
      setError(apiError.message || `Unable to load ${config.title.toLowerCase()}.`);
    } finally {
      setLoading(false);
    }
  }, [config.role, config.title, page, search, status]);

  useEffect(() => { load(); }, [load]);

  const rows = useMemo(() => records.map((item) => {
    const user = getUser(item);
    const profile = item.profiles?.[config.profileKey] || {};
    return { id: user._id || user.id, user, profile };
  }), [config.profileKey, records]);

  const Icon = config.icon;
  const totalPages = Math.max(1, pagination.total_pages || 1);

  return (
    <AdminLayout title={config.title} eyebrow={config.eyebrow} description={config.description} actions={<button className="admin-header__button admin-header__button--ghost" disabled={loading} type="button" onClick={load}><RefreshCw size={16} className={loading ? "admin-competition__spin" : ""} aria-hidden="true" /> Refresh</button>}>
      <section className="admin-registry-summary" aria-label={`${config.title} summary`}><div><Icon size={19} aria-hidden="true" /><span><strong>{pagination.total || 0}</strong><small>Total profiles</small></span></div><div><span><strong>{page}</strong><small>Current page</small></span></div><div><span><strong>20</strong><small>Rows per page</small></span></div></section>

      <section className="admin-command-toolbar" aria-label="Directory filters">
        <label><Search size={17} aria-hidden="true" /><span className="sr-only">Search email</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search by email..." /></label>
        <div className="admin-command-filters" role="group" aria-label="Account status"><button className={status === "" ? "active" : ""} type="button" onClick={() => setStatus("")}>All</button><button className={status === "active" ? "active" : ""} type="button" onClick={() => setStatus("active")}>Active</button><button className={status === "pending_verification" ? "active" : ""} type="button" onClick={() => setStatus("pending_verification")}>Pending</button><button className={status === "blocked" ? "active" : ""} type="button" onClick={() => setStatus("blocked")}>Suspended</button></div>
        {(query || status) && <button className="admin-command-reset" type="button" onClick={() => { setQuery(""); setStatus(""); }}><X size={15} aria-hidden="true" /> Clear</button>}
      </section>

      {error && <section className="admin-live-state admin-live-state--warning" aria-live="assertive">{error}</section>}
      {loading ? <LoadingSkeleton ariaLabel={`Loading ${config.title}`} rows={7} variant="table" /> : (
        <section className={`admin-registry-workspace${selected ? " admin-registry-workspace--detail" : ""}`}>
          <article className="admin-registry-ledger">
            <header><div><Icon size={19} aria-hidden="true" /><span><strong>{config.title}</strong><small>{pagination.total || 0} records</small></span></div><span>Pending first - 20 rows per page</span></header>
            {rows.length ? <div className="admin-data-table__wrap"><table className="admin-data-table"><thead><tr><th>Name</th><th>Email</th><th>Licence</th><th>Experience</th><th>Status</th><th><span className="sr-only">Review</span></th></tr></thead><tbody>{rows.map((row) => <tr className={selected?.id === row.id ? "admin-command-row--selected" : ""} key={row.id}><td><strong>{row.user.full_name || "Unnamed user"}</strong><small className="admin-competition__id">{row.id}</small></td><td>{row.user.email || "Not set"}</td><td>{row.profile.license_number || "Not set"}</td><td>{row.profile.experience_years || 0} years</td><td><StatusBadge value={row.user.status} /></td><td><button className="admin-command-review" type="button" onClick={() => setSelected(row)}>Review<ArrowRight size={15} aria-hidden="true" /></button></td></tr>)}</tbody></table></div> : <div className="admin-command-empty"><Icon size={28} aria-hidden="true" /><div><h3>No profiles found</h3><p>Change the filters to view more records.</p></div></div>}
            {totalPages > 1 && <nav className="admin-command-pagination" aria-label={`${config.title} pages`}><span>Page {page} of {totalPages}</span><div><button disabled={page === 1} type="button" onClick={() => setPage(page - 1)}>Previous</button>{Array.from({ length: totalPages }, (_, index) => index + 1).map((number) => <button key={number} className={number === page ? "active" : ""} aria-current={number === page ? "page" : undefined} type="button" onClick={() => setPage(number)}>{number}</button>)}<button disabled={page === totalPages} type="button" onClick={() => setPage(page + 1)}>Next</button></div></nav>}
          </article>
          {selected && <aside className="admin-registry-detail"><header><div><p>Profile</p><h2>{selected.user.full_name || "Unnamed user"}</h2><span>{selected.user.email || "Not set"}</span></div><button type="button" aria-label="Close profile" onClick={() => setSelected(null)}><X size={18} aria-hidden="true" /></button></header><div className="admin-command-detail__status"><span>Account status</span><StatusBadge value={selected.user.status} /></div><div className="admin-command-detail__fields">{profileFields(moduleName, selected.profile).map(([label, value]) => <div key={label}><span>{label}</span><strong>{value}</strong></div>)}</div><footer><Link className="admin-header__button admin-header__button--ghost" to="/admin/users">Manage account<ArrowRight size={15} aria-hidden="true" /></Link></footer></aside>}
        </section>
      )}
    </AdminLayout>
  );
}

export default AdminRegistryModule;
