import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, CircleDollarSign, Plus, RefreshCw, Save, Trash2 } from "lucide-react";
import { adminDepositApi } from "../api/depositApi";
import LoadingSkeleton from "../components/LoadingSkeleton";
import AdminLayout from "./AdminLayout";

const allowedVndPrices = [10000, 20000, 50000, 100000, 200000, 500000];

const emptyDraft = {
  package_id: "",
  label: "",
  vnd_price: 50000,
  token_received: 50,
  bonus_token: 0,
  is_active: true,
};

const defaultLedgerFilters = {
  status: "",
  from: "",
  to: "",
  page: 1,
  limit: 10,
};

function formatVnd(value) {
  return new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND", maximumFractionDigits: 0 }).format(Number(value || 0));
}

function formatDateTime(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(date);
}

function totalToken(pkg) {
  return Number(pkg?.total_token ?? Number(pkg?.token_received || 0) + Number(pkg?.bonus_token || 0));
}

function toDraft(pkg) {
  if (!pkg) return emptyDraft;
  return {
    package_id: pkg.package_id || "",
    label: pkg.label || "",
    vnd_price: Number(pkg.vnd_price || 50000),
    token_received: Number(pkg.token_received || 0),
    bonus_token: Number(pkg.bonus_token || 0),
    is_active: Boolean(pkg.is_active),
  };
}

function newestPackageSort(first, second) {
  const firstTime = new Date(first?.created_at || first?.updated_at || 0).getTime() || 0;
  const secondTime = new Date(second?.created_at || second?.updated_at || 0).getTime() || 0;
  return secondTime - firstTime || Number(second?.vnd_price || 0) - Number(first?.vnd_price || 0);
}

function StatusBadge({ active }) {
  return <span className={`admin-status-badge admin-status-badge--${active ? "green" : "gray"}`}>{active ? "Active" : "Inactive"}</span>;
}

function RequestStatusBadge({ status }) {
  const value = String(status || "pending").toLowerCase();
  const tone = value === "success" ? "green" : value === "failed" ? "red" : "amber";
  return <span className={`admin-status-badge admin-status-badge--${tone}`}>{value}</span>;
}

export default function AdminDepositModule() {
  const [packages, setPackages] = useState([]);
  const [ledger, setLedger] = useState({ list: [], summary: {}, page: 1, limit: 10, total: 0, total_pages: 0, has_next_page: false, has_prev_page: false });
  const [ledgerFilters, setLedgerFilters] = useState(defaultLedgerFilters);
  const [selectedId, setSelectedId] = useState(null);
  const [draft, setDraft] = useState(emptyDraft);
  const [isCreating, setIsCreating] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [isLedgerLoading, setIsLedgerLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [ledgerError, setLedgerError] = useState("");

  const selectedPackage = useMemo(() => packages.find((item) => item._id === selectedId) || null, [packages, selectedId]);
  const activeCount = packages.filter((item) => item.is_active).length;
  const inactiveCount = packages.length - activeCount;

  async function loadPackages() {
    setIsLoading(true);
    setError("");

    try {
      const payload = await adminDepositApi.listPackages();
      const nextPackages = (payload.packages || []).slice().sort(newestPackageSort);
      setPackages(nextPackages);
      if (!isCreating && selectedId) {
        const nextSelected = nextPackages.find((item) => item._id === selectedId);
        if (nextSelected) setDraft(toDraft(nextSelected));
      }
    } catch (apiError) {
      setError(apiError.message || "Unable to load deposit packages.");
    } finally {
      setIsLoading(false);
    }
  }

  async function loadLedger(nextFilters = ledgerFilters) {
    setIsLedgerLoading(true);
    setLedgerError("");

    try {
      const payload = await adminDepositApi.listRequests(nextFilters);
      setLedger({
        list: payload.list || [],
        summary: payload.summary || {},
        page: payload.page || nextFilters.page || 1,
        limit: payload.limit || nextFilters.limit || 10,
        total: payload.total || 0,
        total_pages: payload.total_pages || 0,
        has_next_page: Boolean(payload.has_next_page),
        has_prev_page: Boolean(payload.has_prev_page),
      });
    } catch (apiError) {
      setLedgerError(apiError.message || "Unable to load deposit ledger.");
    } finally {
      setIsLedgerLoading(false);
    }
  }

  function updateLedgerFilters(patch) {
    setLedgerFilters((current) => ({ ...current, ...patch }));
  }

  useEffect(() => {
    loadPackages();
    loadLedger(defaultLedgerFilters);
  }, []);

  async function applyLedgerFilters(event) {
    event.preventDefault();
    const nextFilters = { ...ledgerFilters, page: 1 };
    setLedgerFilters(nextFilters);
    await loadLedger(nextFilters);
  }

  async function changeLedgerPage(nextPage) {
    const nextFilters = { ...ledgerFilters, page: nextPage };
    setLedgerFilters(nextFilters);
    await loadLedger(nextFilters);
  }

  function updateDraft(field, value) {
    setDraft((current) => ({ ...current, [field]: value }));
    setNotice("");
    setError("");
  }

  function startCreate() {
    setIsCreating(true);
    setSelectedId(null);
    setDraft(emptyDraft);
    setNotice("");
    setError("");
  }

  function startEdit(pkg) {
    setIsCreating(false);
    setSelectedId(pkg._id);
    setDraft(toDraft(pkg));
    setNotice("");
    setError("");
  }

  async function savePackage(event) {
    event.preventDefault();
    setIsSaving(true);
    setNotice("");
    setError("");

    const payload = {
      label: draft.label.trim(),
      vnd_price: Number(draft.vnd_price),
      token_received: Number(draft.token_received),
      bonus_token: Number(draft.bonus_token || 0),
      is_active: Boolean(draft.is_active),
    };

    if (isCreating) {
      payload.package_id = draft.package_id.trim().toUpperCase();
    }

    try {
      const response = isCreating
        ? await adminDepositApi.createPackage(payload)
        : await adminDepositApi.updatePackage(selectedId, payload);
      const savedPackage = response.package;
      setNotice(isCreating ? "Deposit package created." : "Deposit package updated.");
      await loadPackages();
      if (savedPackage?._id) {
        setIsCreating(false);
        setSelectedId(savedPackage._id);
        setDraft(toDraft(savedPackage));
      }
    } catch (apiError) {
      setError(apiError.message || "Unable to save deposit package.");
    } finally {
      setIsSaving(false);
    }
  }

  async function deactivatePackage(pkg) {
    setIsSaving(true);
    setNotice("");
    setError("");

    try {
      const response = await adminDepositApi.deletePackage(pkg._id);
      setNotice(response.message || `Package ${pkg.package_id} deactivated.`);
      await loadPackages();
      if (selectedId === pkg._id) {
        setDraft(toDraft({ ...pkg, is_active: false }));
      }
    } catch (apiError) {
      setError(apiError.message || "Unable to deactivate deposit package.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <AdminLayout
      title="Deposit packages"
      eyebrow="Wallet operations"
      description="Manage fixed top-up packages used by spectators before payment checkout."
      actions={(
        <>
          <button className="admin-header__button admin-header__button--ghost" disabled={isLoading || isLedgerLoading} type="button" onClick={() => { loadPackages(); loadLedger(); }}>
            <RefreshCw size={16} className={isLoading || isLedgerLoading ? "admin-competition__spin" : ""} aria-hidden="true" /> Refresh
          </button>
          <button className="admin-header__button" type="button" onClick={startCreate}>
            <Plus size={16} aria-hidden="true" /> New package
          </button>
        </>
      )}
    >
      <section className="admin-command-metrics" aria-label="Deposit package summary">
        <article><CircleDollarSign size={18} aria-hidden="true" /><div><strong>{packages.length}</strong><small>Total packages</small></div></article>
        <article><CheckCircle2 size={18} aria-hidden="true" /><div><strong>{activeCount}</strong><small>Active packages</small></div></article>
        <article><Trash2 size={18} aria-hidden="true" /><div><strong>{inactiveCount}</strong><small>Inactive packages</small></div></article>
      </section>

      {notice && <section className="admin-live-state admin-command-notice" aria-live="polite"><CheckCircle2 size={17} aria-hidden="true" />{notice}</section>}
      {error && <section className="admin-live-state admin-live-state--warning" aria-live="assertive">{error}</section>}

      <section className="admin-deposit-workspace">
        {isLoading ? (
          <LoadingSkeleton ariaLabel="Loading deposit packages" rows={7} variant="table" />
        ) : (
        <article className="admin-command-ledger">
          <div className="admin-data-table__wrap" role="region" aria-label="Deposit package table" tabIndex="0">
            <table className="admin-data-table">
              <thead>
                <tr><th>Package</th><th>Price</th><th>Tokens</th><th>Status</th><th>Action</th></tr>
              </thead>
              <tbody>
                {!packages.length && <tr><td colSpan="5">No deposit packages found.</td></tr>}
                {packages.map((pkg) => (
                  <tr className={selectedId === pkg._id ? "admin-command-row--selected" : ""} key={pkg._id || pkg.package_id}>
                    <td><strong>{pkg.label}</strong><span className="admin-deposit-subline">{pkg.package_id}</span></td>
                    <td>{formatVnd(pkg.vnd_price)}</td>
                    <td>{totalToken(pkg)} TOKEN<span className="admin-deposit-subline">Base {pkg.token_received} + bonus {pkg.bonus_token || 0}</span></td>
                    <td><StatusBadge active={pkg.is_active} /></td>
                    <td>
                      <button className="admin-command-review" type="button" onClick={() => startEdit(pkg)}>Edit</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>
        )}

        <aside className="admin-panel admin-deposit-editor">
          <div className="admin-panel__header">
            <div>
              <p className="admin-panel__eyebrow">{isCreating ? "Create" : "Edit"}</p>
              <h2>{isCreating ? "New deposit package" : selectedPackage?.package_id}</h2>
            </div>
            {!isCreating && selectedPackage && <StatusBadge active={selectedPackage.is_active} />}
          </div>

          <form className="admin-form-grid" onSubmit={savePackage}>
            <label className="admin-field">
              <span>Package ID</span>
              <input disabled={!isCreating} value={draft.package_id} onChange={(event) => updateDraft("package_id", event.target.value)} placeholder="PKG_50K" />
            </label>

            <label className="admin-field">
              <span>Label</span>
              <input value={draft.label} onChange={(event) => updateDraft("label", event.target.value)} placeholder="Starter package" />
            </label>

            <label className="admin-field">
              <span>VND price</span>
              <select value={draft.vnd_price} onChange={(event) => updateDraft("vnd_price", Number(event.target.value))}>
                {allowedVndPrices.map((price) => <option key={price} value={price}>{formatVnd(price)}</option>)}
              </select>
            </label>

            <div className="admin-deposit-editor__split">
              <label className="admin-field">
                <span>Base token</span>
                <input min="1" type="number" value={draft.token_received} onChange={(event) => updateDraft("token_received", event.target.value)} />
              </label>
              <label className="admin-field">
                <span>Bonus token</span>
                <input min="0" type="number" value={draft.bonus_token} onChange={(event) => updateDraft("bonus_token", event.target.value)} />
              </label>
            </div>

            <label className="admin-deposit-switch">
              <input checked={draft.is_active} type="checkbox" onChange={(event) => updateDraft("is_active", event.target.checked)} />
              <span>Visible to spectators</span>
            </label>

            <div className="admin-deposit-preview">
              <span>Total credit</span>
              <strong>{Number(draft.token_received || 0) + Number(draft.bonus_token || 0)} TOKEN</strong>
              <small>{formatVnd(draft.vnd_price)} checkout amount</small>
            </div>

            <div className="admin-deposit-actions">
              <button className="admin-header__button" disabled={isSaving} type="submit"><Save size={15} aria-hidden="true" /> {isSaving ? "Saving..." : "Save package"}</button>
              {!isCreating && selectedPackage?.is_active && (
                <button className="admin-header__button admin-header__button--red" disabled={isSaving} type="button" onClick={() => deactivatePackage(selectedPackage)}>
                  <Trash2 size={15} aria-hidden="true" /> Deactivate
                </button>
              )}
            </div>
          </form>
        </aside>
      </section>

      <section className="admin-command-ledger" aria-labelledby="deposit-ledger-title">
        <header>
          <div>
            <CircleDollarSign size={18} aria-hidden="true" />
            <span>Payment ledger</span>
            <strong id="deposit-ledger-title">Deposit requests</strong>
            <small>
              {ledger.summary?.pending_count || 0} pending / {ledger.summary?.success_count || 0} success / {ledger.summary?.failed_count || 0} failed
            </small>
          </div>
          <span>{formatVnd(ledger.summary?.total_vnd)} / {Number(ledger.summary?.total_token || 0)} TOKEN</span>
        </header>

        <form className="admin-form-grid admin-competition__round-controls" onSubmit={applyLedgerFilters}>
          <label className="admin-field">
            <span>Status</span>
            <select value={ledgerFilters.status} onChange={(event) => updateLedgerFilters({ status: event.target.value, page: 1 })}>
              <option value="">All statuses</option>
              <option value="pending">Pending</option>
              <option value="success">Success</option>
              <option value="failed">Failed</option>
            </select>
          </label>
          <label className="admin-field">
            <span>From</span>
            <input type="date" value={ledgerFilters.from} onChange={(event) => updateLedgerFilters({ from: event.target.value, page: 1 })} />
          </label>
          <label className="admin-field">
            <span>To</span>
            <input type="date" value={ledgerFilters.to} onChange={(event) => updateLedgerFilters({ to: event.target.value, page: 1 })} />
          </label>
          <label className="admin-field">
            <span>Rows</span>
            <select value={ledgerFilters.limit} onChange={(event) => updateLedgerFilters({ limit: Number(event.target.value), page: 1 })}>
              <option value="10">10</option>
              <option value="20">20</option>
              <option value="50">50</option>
            </select>
          </label>
          <button className="admin-header__button" disabled={isLedgerLoading} type="submit">
            <RefreshCw size={15} className={isLedgerLoading ? "admin-competition__spin" : ""} aria-hidden="true" /> Apply
          </button>
        </form>

        {ledgerError && <section className="admin-live-state admin-live-state--warning" aria-live="assertive">{ledgerError}</section>}

        <div className="admin-data-table__wrap" role="region" aria-label="Deposit request table" tabIndex="0">
          <table className="admin-data-table">
            <thead>
              <tr><th>Order</th><th>User</th><th>Package</th><th>Method</th><th>Amount</th><th>Status</th><th>Gateway ref</th><th>Created</th></tr>
            </thead>
            <tbody>
              {isLedgerLoading && <tr><td colSpan="8">Loading deposit requests...</td></tr>}
              {!isLedgerLoading && !ledgerError && !ledger.list.length && <tr><td colSpan="8">No deposit requests match the current filters.</td></tr>}
              {!isLedgerLoading && !ledgerError && ledger.list.map((order) => (
                <tr key={order._id || order.order_id}>
                  <td><strong>{order.order_id}</strong></td>
                  <td>
                    {order.user_id?.username || order.user_id?.email || "Unknown"}
                    <span className="admin-deposit-subline">{order.user_id?.email || ""}</span>
                  </td>
                  <td>{order.package_id || "CUSTOM"}</td>
                  <td>{order.payment_method || "-"}</td>
                  <td>{formatVnd(order.total_vnd)}<span className="admin-deposit-subline">{order.total_token || 0} TOKEN</span></td>
                  <td><RequestStatusBadge status={order.status} /></td>
                  <td>{order.gateway_reference_id || "-"}</td>
                  <td>{formatDateTime(order.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <footer className="admin-command-pagination">
          <span>Page {ledger.page || 1} of {ledger.total_pages || 1} / {ledger.total || 0} records</span>
          <div>
            <button disabled={!ledger.has_prev_page || isLedgerLoading} type="button" onClick={() => changeLedgerPage(Math.max(1, (ledger.page || 1) - 1))}>Previous</button>
            <button disabled={!ledger.has_next_page || isLedgerLoading} type="button" onClick={() => changeLedgerPage((ledger.page || 1) + 1)}>Next</button>
          </div>
        </footer>
      </section>
    </AdminLayout>
  );
}
