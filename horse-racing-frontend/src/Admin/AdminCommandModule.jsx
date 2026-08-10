import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  Check,
  CheckCircle2,
  ClipboardCheck,
  FileCheck2,
  RefreshCw,
  Search,
  ShieldCheck,
  UserRoundCog,
  UsersRound,
  X,
} from "lucide-react";
import LoadingSkeleton from "../components/LoadingSkeleton";
import AdminLayout from "./AdminLayout";
import { useAdminModuleApi } from "./useAdminModuleApi";

const moduleConfig = {
  users: {
    title: "Users & roles",
    eyebrow: "Access command",
    description: "Manage account status and role access.",
    tableLabel: "Account ledger",
    search: "Search name, role, status or verification...",
    emptyTitle: "No accounts match this view",
    emptyText: "Adjust the search or status filter to return account records.",
    sortHint: "Pending verification first, newest first",
    icon: UsersRound,
  },
  registrations: {
    title: "Race entries",
    eyebrow: "Entry control",
    description: "Inspect confirmed horse entries, payment snapshots, and race capacity records.",
    tableLabel: "Entry ledger",
    search: "Search horse, race, tournament or status...",
    emptyTitle: "No race entries found",
    emptyText: "No registration records match the active filters.",
    sortHint: "Newest entries first",
    icon: ClipboardCheck,
  },
  results: {
    title: "Official results",
    eyebrow: "Publication desk",
    description: "Review, confirm, and publish official race outcomes.",
    tableLabel: "Result ledger",
    search: "Search race, tournament, leader or status...",
    emptyTitle: "No result records found",
    emptyText: "Result drafts will appear after a referee finalizes an eligible race.",
    sortHint: "Drafts first, newest first",
    icon: FileCheck2,
  },
};

const roleOptions = ["admin", "horse_owner", "jockey", "race_referee", "spectator"];
const PAGE_SIZE = 20;

function toneFor(value) {
  const status = String(value || "").toLowerCase();
  if (["active", "approved", "published", "verified"].includes(status)) return "green";
  if (["pending", "draft", "unverified"].includes(status)) return "amber";
  if (["suspended", "rejected", "blocked", "disabled"].includes(status)) return "red";
  if (status === "confirmed") return "blue";
  return "gray";
}

function StatusBadge({ value }) {
  return <span className={`admin-status-badge admin-status-badge--${toneFor(value)}`}>{value || "Unknown"}</span>;
}

function DetailFields({ fields }) {
  if (!fields?.length) return null;
  return <div className="admin-command-detail__fields">{fields.map(([label, value]) => <div key={label}><span>{label}</span><strong>{value}</strong></div>)}</div>;
}

function DetailTable({ table }) {
  if (!table) return null;

  return (
    <section className="admin-command-detail__table">
      <h3>{table.title}</h3>
      {table.rows?.length ? (
        <div className="admin-data-table__wrap">
          <table className="admin-data-table">
            <thead><tr>{table.columns.map((column) => <th key={column}>{column}</th>)}</tr></thead>
            <tbody>{table.rows.map((row, rowIndex) => <tr key={`${table.title}-${rowIndex}`}>{row.map((cell, index) => <td key={`${table.title}-${rowIndex}-${table.columns[index]}`}>{cell}</td>)}</tr>)}</tbody>
          </table>
        </div>
      ) : (
        <p>{table.emptyText || "No data available."}</p>
      )}
    </section>
  );
}

function actionsFor(moduleName, status, detail) {
  if (moduleName === "users") return status === "Active" ? ["Suspend"] : ["Activate"];
  if (moduleName === "registrations") return [];
  if (moduleName === "results") {
    if (status === "Published") return [];
    if (detail?.correctionRequested) return ["Mark Correction Resolved"];
    if (status === "Draft") return ["Publish Result", "Request Correction"];
    if (status === "Confirmed") return ["Publish Result", "Request Correction"];
  }
  return [];
}

function AdminCommandModule({ moduleName }) {
  const config = moduleConfig[moduleName];
  const api = useAdminModuleApi(moduleName);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("All");
  const [selected, setSelected] = useState(null);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");
  const [decisionNote, setDecisionNote] = useState("");
  const [actionLoading, setActionLoading] = useState("");
  const [roleSelection, setRoleSelection] = useState("spectator");
  const [roleLoading, setRoleLoading] = useState("");
  const [notice, setNotice] = useState("");
  const [page, setPage] = useState(1);

  const table = api.liveData?.tables?.[0] || { columns: [], rows: [] };
  const statusIndex = table.columns.findIndex((column) => column.toLowerCase() === "status");
  const statuses = useMemo(() => ["All", ...new Set(table.rows.map((row) => row[statusIndex]).filter(Boolean))], [statusIndex, table.rows]);
  const filteredRows = useMemo(() => table.rows.filter((row) => {
    const matchesQuery = !query.trim() || row.join(" ").toLowerCase().includes(query.trim().toLowerCase());
    const matchesStatus = status === "All" || row[statusIndex] === status;
    return matchesQuery && matchesStatus;
  }), [query, status, statusIndex, table.rows]);
  const totalPages = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE));
  const pagedRows = useMemo(() => filteredRows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE), [filteredRows, page]);

  useEffect(() => {
    setSelected(null);
    setDetail(null);
    setDecisionNote("");
    setQuery("");
    setStatus("All");
    setPage(1);
  }, [moduleName]);

  useEffect(() => { setPage(1); }, [query, status]);
  useEffect(() => { setPage((current) => Math.min(current, totalPages)); }, [totalPages]);

  useEffect(() => {
    if (!notice) return undefined;
    const timer = window.setTimeout(() => setNotice(""), 4200);
    return () => window.clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    if (!selected) return undefined;
    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event) => {
      if (event.key === "Escape") {
        setSelected(null);
        setDetail(null);
      }
    };

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", closeOnEscape);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [selected]);

  const openDetail = async (row) => {
    setSelected(row);
    setDetail(null);
    setDetailError("");
    setDecisionNote("");
    setDetailLoading(true);
    try {
      setDetail(await api.getRowDetail(row[0]));
    } catch (error) {
      setDetailError(error.message || "We couldn't load this record.");
    } finally {
      setDetailLoading(false);
    }
  };

  const runAction = async (action) => {
    if (!selected) return;
    if (action === "Request Correction" && !decisionNote.trim()) {
      setDetailError("Correction reason is required.");
      return;
    }
    setActionLoading(action);
    setDetailError("");
    try {
      await api.applyRowAction({ actionLabel: action, id: selected[0], note: decisionNote, status: selectedStatus });
      setNotice(`${action} completed for ${selected[1] || selected[0]}.`);
      setSelected(null);
      setDetail(null);
      setDecisionNote("");
    } catch (error) {
      setDetailError(error.message || `We couldn't ${action.toLowerCase()} this record.`);
    } finally {
      setActionLoading("");
    }
  };

  const mutateRole = async (mode, role) => {
    if (!detail?.id) return;
    setRoleLoading(`${mode}:${role}`);
    setDetailError("");
    try {
      const next = mode === "assign" ? await api.assignRole(detail.id, role) : await api.removeRole(detail.id, role);
      setDetail(next);
      setNotice(`${role.replaceAll("_", " ")} role ${mode === "assign" ? "assigned" : "removed"}.`);
    } catch (error) {
      setDetailError(error.message || `We couldn't ${mode} this role.`);
    } finally {
      setRoleLoading("");
    }
  };

  const selectedStatus = selected?.[statusIndex];
  const availableActions = actionsFor(moduleName, selectedStatus, detail);
  const Icon = config.icon;

  if (api.isLoading && !api.liveData) {
    return <AdminLayout title={config.title} eyebrow={config.eyebrow} description={config.description}><LoadingSkeleton ariaLabel={`Loading ${config.title}`} rows={7} variant="table" /></AdminLayout>;
  }

  return (
    <AdminLayout
      title={config.title}
      eyebrow={config.eyebrow}
      description={config.description}
      actions={<button className="admin-header__button admin-header__button--ghost" disabled={api.isLoading} type="button" onClick={api.reload}><RefreshCw size={16} className={api.isLoading ? "admin-competition__spin" : ""} aria-hidden="true" /> Refresh data</button>}
    >
      <section className="admin-command-metrics" aria-label={`${config.title} summary`}>
        {(api.liveData?.summary || []).map((item, index) => (
          <article key={item.label}><span>{String(index + 1).padStart(2, "0")}</span><div><strong>{item.value}</strong><small>{item.label}</small></div></article>
        ))}
        <article className="admin-command-metrics__source"><ShieldCheck size={18} aria-hidden="true" /><div><strong>{table.rows.length}</strong><small>Total records</small></div></article>
      </section>

      {notice && <section className="admin-live-state admin-command-notice" aria-live="polite"><CheckCircle2 size={17} aria-hidden="true" />{notice}</section>}
      {api.error && <section className="admin-live-state admin-live-state--warning" aria-live="assertive">{api.error}</section>}

      <section className="admin-command-toolbar" aria-label="Ledger filters">
        <label><Search size={17} aria-hidden="true" /><span className="sr-only">Search records</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={config.search} /></label>
        <div className="admin-command-filters" role="group" aria-label="Filter by status">
          {statuses.map((item) => <button key={item} className={status === item ? "active" : ""} type="button" onClick={() => setStatus(item)}>{item}</button>)}
        </div>
        {(query || status !== "All") && <button className="admin-command-reset" type="button" onClick={() => { setQuery(""); setStatus("All"); }}><X size={15} aria-hidden="true" /> Clear</button>}
      </section>

      <section className="admin-command-workspace">
        <article className="admin-command-ledger">
          <header><div><Icon size={19} aria-hidden="true" /><span><strong>{config.tableLabel}</strong><small>{filteredRows.length} records</small></span></div><span>{config.sortHint} - 20 rows per page</span></header>
          {filteredRows.length ? (
            <div className="admin-data-table__wrap" role="region" aria-label={config.tableLabel} tabIndex="0">
              <table className="admin-data-table">
                <thead><tr>{table.columns.map((column) => <th key={column}>{column}</th>)}<th><span className="sr-only">Review</span></th></tr></thead>
                <tbody>{pagedRows.map((row) => (
                  <tr className={selected?.[0] === row[0] ? "admin-command-row--selected" : ""} key={row[0]}>
                    {row.map((cell, index) => <td key={`${row[0]}-${table.columns[index]}`}>{index === statusIndex || table.columns[index]?.toLowerCase() === "verification" ? <StatusBadge value={cell} /> : index === 0 ? <span className="admin-command-id">{cell}</span> : cell}</td>)}
                    <td><button className="admin-command-review" type="button" onClick={() => openDetail(row)} aria-label={`Inspect ${row[1] || row[0]}`}>Inspect <ArrowRight size={15} aria-hidden="true" /></button></td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          ) : (
            <div className="admin-command-empty"><Icon size={28} aria-hidden="true" /><div><h3>{config.emptyTitle}</h3><p>{config.emptyText}</p></div></div>
          )}
          {filteredRows.length > PAGE_SIZE && <nav className="admin-command-pagination" aria-label={`${config.tableLabel} pages`}><span>Page {page} of {totalPages}</span><div><button disabled={page === 1} type="button" onClick={() => setPage((current) => current - 1)}>Previous</button>{Array.from({ length: totalPages }, (_, index) => index + 1).map((number) => <button key={number} className={page === number ? "active" : ""} type="button" onClick={() => setPage(number)} aria-label={`Page ${number}`} aria-current={page === number ? "page" : undefined}>{number}</button>)}<button disabled={page === totalPages} type="button" onClick={() => setPage((current) => current + 1)}>Next</button></div></nav>}
        </article>

        {selected && (
          <div className="admin-command-modal" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) { setSelected(null); setDetail(null); } }}>
          <aside className="admin-command-detail" aria-label="Selected record detail" aria-modal="true" role="dialog">
            <header><div><p>Record inspection</p><h2>{selected[1] || selected[0]}</h2><span className="admin-command-id">{selected[0]}</span></div><button type="button" onClick={() => { setSelected(null); setDetail(null); }} aria-label="Close record detail"><X size={18} aria-hidden="true" /></button></header>
            <div className="admin-command-detail__status"><span>Current state</span><StatusBadge value={selectedStatus} /></div>

            {detailLoading && <LoadingSkeleton ariaLabel="Loading record detail" variant="inline" />}
            {detailError && <div className="admin-live-state admin-live-state--warning">{detailError}</div>}
            {detail?.warnings?.map((warning) => <div className="admin-live-state admin-live-state--warning" key={warning}>{warning}</div>)}
            {detail && <DetailFields fields={detail.fields} />}
            {detail?.sections?.map((section) => (
              <section className="admin-command-detail__section" key={section.title}>
                <h3>{section.title}</h3>
                <DetailFields fields={section.fields} />
              </section>
            ))}
            {detail?.tables?.map((table) => <DetailTable key={table.title} table={table} />)}

            {detail?.type === "user" && (
              <section className="admin-command-role-editor">
                <div><p>Access roles</p><span>{detail.roles.length} assigned</span></div>
                <div className="admin-command-role-editor__assign"><select value={roleSelection} onChange={(event) => setRoleSelection(event.target.value)}>{roleOptions.map((role) => <option key={role} value={role}>{role.replaceAll("_", " ")}</option>)}</select><button disabled={Boolean(roleLoading) || detail.roles.includes(roleSelection)} type="button" onClick={() => mutateRole("assign", roleSelection)}><UserRoundCog size={15} aria-hidden="true" /> Assign</button></div>
                <div className="admin-command-role-list">{detail.roles.map((role) => <div key={role}><span>{role.replaceAll("_", " ")}</span><button disabled={Boolean(roleLoading) || detail.roles.length === 1} type="button" onClick={() => mutateRole("remove", role)}>{roleLoading === `remove:${role}` ? "Removing" : "Remove"}</button></div>)}</div>
              </section>
            )}

            {moduleName === "results" && availableActions.includes("Request Correction") && <label className="admin-command-note"><span>Correction reason</span><textarea value={decisionNote} onChange={(event) => setDecisionNote(event.target.value)} placeholder="Explain what must be corrected before this race can be confirmed or published..." /></label>}

            <footer>
              {availableActions.map((action) => <button key={action} className={["Reject", "Suspend", "Request Correction"].includes(action) ? "admin-command-action admin-command-action--danger" : "admin-command-action"} disabled={Boolean(actionLoading)} type="button" onClick={() => runAction(action)}>{actionLoading === action ? "Processing..." : action}<Check size={15} aria-hidden="true" /></button>)}
              {!availableActions.length && <div className="admin-command-locked"><CheckCircle2 size={17} aria-hidden="true" /><span><strong>{moduleName === "registrations" ? "Auto-confirmed entry" : "No actions available"}</strong><small>{moduleName === "registrations" ? "Eligibility is decided later by jockey assignment and pre-race inspection." : "This record is complete."}</small></span></div>}
            </footer>
          </aside>
          </div>
        )}
      </section>
    </AdminLayout>
  );
}

export default AdminCommandModule;
