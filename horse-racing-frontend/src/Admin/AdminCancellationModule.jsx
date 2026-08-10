import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Banknote,
  CalendarClock,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleDollarSign,
  Clock3,
  FileClock,
  RefreshCw,
  Search,
  ShieldCheck,
  UserRound,
  X,
} from "lucide-react";
import { adminApi } from "../api/adminApi";
import LoadingSkeleton from "../components/LoadingSkeleton";
import AdminLayout from "./AdminLayout";

const titleCase = (value) => String(value || "")
  .replaceAll("_", " ")
  .replace(/\b\w/g, (letter) => letter.toUpperCase());
const idOf = (value) => String(value?._id || value?.id || value || "");
const ownerOf = (ticket) => ticket?.owner_id?.user_id || {};
const formatMoney = (value) => new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "VND",
  maximumFractionDigits: 0,
}).format(Number(value || 0));
const formatDateTime = (value) => {
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime())
    ? date.toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })
    : "Not recorded";
};
const statusTone = (ticket) => {
  if (ticket?.refund_status === "completed") return "green";
  if (ticket?.status === "rejected") return "red";
  if (ticket?.status === "pending" || ticket?.refund_status === "pending") return "amber";
  return "gray";
};
const statusLabel = (ticket) => {
  if (ticket?.refund_status === "completed") return "Refund complete";
  if (ticket?.refund_status === "awaiting_owner_confirmation") return "Awaiting owner";
  if (ticket?.status === "approved" && ticket?.refund_status === "pending") return "Refund due";
  return titleCase(ticket?.status);
};

function AdminCancellationModule() {
  const [tickets, setTickets] = useState([]);
  const [filter, setFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [note, setNote] = useState("");
  const [refundReference, setRefundReference] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const loadTickets = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await adminApi.listCancellationTickets();
      const nextTickets = data.cancellation_tickets || [];
      setTickets(nextTickets);
      setSelectedId((currentId) => (
        nextTickets.some((ticket) => idOf(ticket) === currentId)
          ? currentId
          : idOf(nextTickets[0])
      ));
    } catch (apiError) {
      setError(apiError.message || "Unable to load cancellation requests.");
      setTickets([]);
      setSelectedId("");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTickets();
  }, [loadTickets]);

  const counts = useMemo(() => ({
    pending: tickets.filter((ticket) => ticket.status === "pending").length,
    refund: tickets.filter((ticket) => ticket.refund_status === "pending").length,
    confirmation: tickets.filter((ticket) => ticket.refund_status === "awaiting_owner_confirmation").length,
  }), [tickets]);

  const filteredTickets = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return tickets.filter((ticket) => {
      const matchesFilter = filter === "all"
        || (filter === "completed" && ticket.refund_status === "completed")
        || (filter !== "completed" && ticket.status === filter);
      if (!matchesFilter) return false;
      if (!normalizedQuery) return true;

      const owner = ownerOf(ticket);
      return [
        owner.full_name,
        owner.email,
        ticket.horse_id?.name,
        ticket.race_id?.name,
        ticket.tournament_id?.name,
      ].some((value) => String(value || "").toLowerCase().includes(normalizedQuery));
    });
  }, [filter, query, tickets]);

  const selected = useMemo(
    () => filteredTickets.find((ticket) => idOf(ticket) === selectedId) || filteredTickets[0] || null,
    [filteredTickets, selectedId],
  );

  useEffect(() => {
    setNote(selected?.admin_note || "");
    setRefundReference(selected?.refund_reference || "");
  }, [selected?.admin_note, selected?.refund_reference, selectedId]);

  const chooseTicket = (ticket) => {
    setSelectedId(idOf(ticket));
    setNote(ticket.admin_note || "");
    setRefundReference(ticket.refund_reference || "");
    setError("");
    setNotice("");
  };

  const completeAction = async (action) => {
    if (!selected) return;
    const ticketId = idOf(selected);
    setBusyId(ticketId);
    setError("");
    try {
      if (action === "approve") await adminApi.approveCancellationTicket(ticketId, note);
      if (action === "reject") await adminApi.rejectCancellationTicket(ticketId, note);
      if (action === "refund") await adminApi.markCancellationRefundSent(ticketId, refundReference, note);
      setNotice(
        action === "approve"
          ? "Cancellation approved. The race slot has been released."
          : action === "reject"
            ? "Cancellation request rejected."
            : "Refund recorded. Waiting for the horse owner to confirm receipt.",
      );
      await loadTickets();
    } catch (apiError) {
      setError(apiError.message || "Unable to complete this action.");
    } finally {
      setBusyId("");
    }
  };

  const selectedOwner = ownerOf(selected);
  const isBusy = selected && busyId === idOf(selected);

  return (
    <AdminLayout
      title="Cancellation requests"
      eyebrow="Race entries"
      description="Review owner requests, release race slots, and track every refund through confirmation."
      actions={(
        <button className="admin-header__button admin-header__button--ghost" type="button" onClick={loadTickets}>
          <RefreshCw size={16} /> Refresh
        </button>
      )}
    >
      <section className="admin-cancellation-metrics" aria-label="Cancellation request summary">
        <article>
          <span className="admin-cancellation-metrics__icon"><FileClock size={18} /></span>
          <div><small>Awaiting review</small><strong>{counts.pending}</strong></div>
        </article>
        <article>
          <span className="admin-cancellation-metrics__icon"><CircleDollarSign size={18} /></span>
          <div><small>Refunds to send</small><strong>{counts.refund}</strong></div>
        </article>
        <article>
          <span className="admin-cancellation-metrics__icon"><Clock3 size={18} /></span>
          <div><small>Awaiting owner</small><strong>{counts.confirmation}</strong></div>
        </article>
      </section>

      {notice && <div className="admin-live-state">{notice}</div>}
      {error && <div className="admin-live-state admin-live-state--warning">{error}</div>}

      <section className="admin-cancellation-workspace">
        <aside className="admin-cancellation-queue" aria-label="Cancellation request queue">
          <header>
            <div>
              <p className="admin-panel__eyebrow">Request queue</p>
              <h2>Review cases</h2>
            </div>
            <span>{filteredTickets.length} shown</span>
          </header>

          <div className="admin-cancellation-tabs" role="tablist" aria-label="Filter requests">
            {[
              ["all", "All"],
              ["pending", "Pending"],
              ["approved", "Approved"],
              ["rejected", "Rejected"],
              ["completed", "Completed"],
            ].map(([value, label]) => (
              <button
                aria-selected={filter === value}
                className={filter === value ? "is-active" : ""}
                key={value}
                onClick={() => {
                  setFilter(value);
                  setSelectedId("");
                }}
                role="tab"
                type="button"
              >
                {label}
              </button>
            ))}
          </div>

          <label className="admin-cancellation-search">
            <Search size={16} />
            <span className="sr-only">Search requests</span>
            <input
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search owner, horse, or race"
              type="search"
              value={query}
            />
          </label>

          <div className="admin-cancellation-list">
            {loading ? <LoadingSkeleton ariaLabel="Loading cancellation requests" variant="inline" /> : filteredTickets.map((ticket) => {
              const owner = ownerOf(ticket);
              const ticketId = idOf(ticket);
              return (
                <button
                  className={`admin-cancellation-row ${ticketId === idOf(selected) ? "is-selected" : ""}`}
                  key={ticketId}
                  onClick={() => chooseTicket(ticket)}
                  type="button"
                >
                  <span className="admin-cancellation-row__top">
                    <strong>{ticket.horse_id?.name || "Horse unavailable"}</strong>
                    <span className={`admin-cancellation-status is-${statusTone(ticket)}`}>{statusLabel(ticket)}</span>
                  </span>
                  <span className="admin-cancellation-row__owner">
                    <UserRound size={14} /> {owner.full_name || owner.email || "Horse owner"}
                  </span>
                  <span className="admin-cancellation-row__race">{ticket.race_id?.name || "Race unavailable"}</span>
                  <span className="admin-cancellation-row__bottom">
                    <small>{formatDateTime(ticket.requested_at)}</small>
                    <ChevronRight size={16} />
                  </span>
                </button>
              );
            })}
            {!loading && !filteredTickets.length && (
              <div className="admin-cancellation-empty">No requests match this view.</div>
            )}
          </div>
        </aside>

        <article className="admin-cancellation-detail">
          {!selected ? (
            <div className="admin-cancellation-empty admin-cancellation-empty--detail">
              <ShieldCheck size={30} />
              <strong>Select a request to review</strong>
              <span>The case details and available decisions will appear here.</span>
            </div>
          ) : (
            <>
              <header className="admin-cancellation-detail__header">
                <div>
                  <p className="admin-panel__eyebrow">Cancellation case</p>
                  <h2>{selected.horse_id?.name || "Horse unavailable"}</h2>
                  <span>{selected.race_id?.name || "Race unavailable"}</span>
                </div>
                <span className={`admin-cancellation-status is-${statusTone(selected)}`}>{statusLabel(selected)}</span>
              </header>

              <div className="admin-cancellation-detail__body">
                <section className="admin-cancellation-reason">
                  <span>Owner&apos;s reason</span>
                  <p>{selected.reason || "No reason was provided."}</p>
                </section>

                <dl className="admin-cancellation-facts">
                  <div><dt>Horse owner</dt><dd>{selectedOwner.full_name || "Not recorded"}</dd><small>{selectedOwner.email || selectedOwner.phone_number || "No contact recorded"}</small></div>
                  <div><dt>Tournament</dt><dd>{selected.tournament_id?.name || "Not recorded"}</dd><small>{formatDateTime(selected.tournament_id?.start_date)}</small></div>
                  <div><dt>Race</dt><dd>{selected.race_id?.name || "Not recorded"}</dd><small>{formatDateTime(selected.race_id?.race_date)}</small></div>
                  <div><dt>Refund amount</dt><dd>{formatMoney(selected.refund_amount_vnd)}</dd><small>{titleCase(selected.refund_status)}</small></div>
                </dl>

                <section className="admin-cancellation-progress">
                  <h3>Case progress</h3>
                  <div className="admin-cancellation-progress__item is-complete">
                    <span><Check size={14} /></span>
                    <div><strong>Request submitted</strong><small>{formatDateTime(selected.requested_at)}</small></div>
                  </div>
                  <div className={`admin-cancellation-progress__item ${selected.reviewed_at ? "is-complete" : "is-current"}`}>
                    <span>{selected.reviewed_at ? <Check size={14} /> : "2"}</span>
                    <div><strong>Administrative review</strong><small>{selected.reviewed_at ? formatDateTime(selected.reviewed_at) : "Awaiting a decision"}</small></div>
                  </div>
                  <div className={`admin-cancellation-progress__item ${selected.refund_sent_at ? "is-complete" : selected.status === "approved" ? "is-current" : ""}`}>
                    <span>{selected.refund_sent_at ? <Check size={14} /> : "3"}</span>
                    <div><strong>Refund sent</strong><small>{selected.refund_sent_at ? formatDateTime(selected.refund_sent_at) : "Not yet recorded"}</small></div>
                  </div>
                  <div className={`admin-cancellation-progress__item ${selected.owner_confirmed_at ? "is-complete" : selected.refund_status === "awaiting_owner_confirmation" ? "is-current" : ""}`}>
                    <span>{selected.owner_confirmed_at ? <Check size={14} /> : "4"}</span>
                    <div><strong>Owner confirmation</strong><small>{selected.owner_confirmed_at ? formatDateTime(selected.owner_confirmed_at) : "Awaiting receipt confirmation"}</small></div>
                  </div>
                </section>

                {(selected.admin_note || selected.refund_reference || selected.owner_confirmation_note) && (
                  <section className="admin-cancellation-record">
                    <h3>Case record</h3>
                    {selected.admin_note && <p><span>Review note</span>{selected.admin_note}</p>}
                    {selected.refund_reference && <p><span>Refund reference</span>{selected.refund_reference}</p>}
                    {selected.owner_confirmation_note && <p><span>Owner note</span>{selected.owner_confirmation_note}</p>}
                  </section>
                )}
              </div>

              {selected.status === "pending" && (
                <footer className="admin-cancellation-actions">
                  <label className="admin-field">
                    <span>Decision note</span>
                    <textarea
                      maxLength="1000"
                      onChange={(event) => setNote(event.target.value)}
                      placeholder="Explain the decision clearly to the horse owner"
                      value={note}
                    />
                  </label>
                  <div>
                    <button className="admin-header__button admin-header__button--red" disabled={isBusy} onClick={() => completeAction("reject")} type="button">
                      <X size={16} /> Reject request
                    </button>
                    <button className="admin-header__button" disabled={isBusy} onClick={() => completeAction("approve")} type="button">
                      <CheckCircle2 size={16} /> {isBusy ? "Saving..." : "Approve cancellation"}
                    </button>
                  </div>
                </footer>
              )}

              {selected.status === "approved" && selected.refund_status === "pending" && (
                <footer className="admin-cancellation-actions admin-cancellation-actions--refund">
                  <div className="admin-cancellation-refund-heading">
                    <Banknote size={18} />
                    <div><strong>Record the refund</strong><span>Enter the payment reference after the transfer is complete.</span></div>
                  </div>
                  <label className="admin-field">
                    <span>Refund reference *</span>
                    <input
                      maxLength="255"
                      onChange={(event) => setRefundReference(event.target.value)}
                      placeholder="Bank transfer or VNPay reference"
                      required
                      value={refundReference}
                    />
                  </label>
                  <label className="admin-field">
                    <span>Note to owner</span>
                    <textarea maxLength="1000" onChange={(event) => setNote(event.target.value)} value={note} />
                  </label>
                  <button
                    className="admin-header__button"
                    disabled={isBusy || !refundReference.trim()}
                    onClick={() => completeAction("refund")}
                    type="button"
                  >
                    <Banknote size={16} /> {isBusy ? "Saving..." : "Mark refund as sent"}
                  </button>
                </footer>
              )}

              {selected.refund_status === "awaiting_owner_confirmation" && (
                <footer className="admin-cancellation-actions admin-cancellation-actions--waiting">
                  <Clock3 size={18} />
                  <div><strong>Waiting for the horse owner</strong><span>The refund was recorded. This case closes when the owner confirms receipt.</span></div>
                </footer>
              )}

              {selected.refund_status === "completed" && (
                <footer className="admin-cancellation-actions admin-cancellation-actions--complete">
                  <CheckCircle2 size={18} />
                  <div><strong>Refund confirmed</strong><span>This cancellation case is complete.</span></div>
                </footer>
              )}

              {selected.status === "approved" && selected.refund_status === "not_required" && (
                <footer className="admin-cancellation-actions admin-cancellation-actions--complete">
                  <CheckCircle2 size={18} />
                  <div><strong>Cancellation complete</strong><span>The race slot was released and no refund was required.</span></div>
                </footer>
              )}

              {selected.status === "rejected" && (
                <footer className="admin-cancellation-actions admin-cancellation-actions--closed">
                  <CalendarClock size={18} />
                  <div><strong>Request closed</strong><span>The race registration remains active.</span></div>
                </footer>
              )}
            </>
          )}
        </article>
      </section>
    </AdminLayout>
  );
}

export default AdminCancellationModule;
