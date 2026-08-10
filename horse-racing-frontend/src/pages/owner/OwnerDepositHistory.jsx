import { useMemo, useState } from "react";
import { ArrowLeft, CalendarDays, CheckCircle2, ChevronRight, CreditCard, FileText, Flag, MapPin, Receipt, Trophy, UserRound, X } from "lucide-react";
import LoadingSkeleton from "../../components/LoadingSkeleton.jsx";
import { useOwnerRegistrations } from "./useOwnerData";

const money = (value) => new Intl.NumberFormat("vi-VN", {
  style: "currency",
  currency: "VND",
  maximumFractionDigits: 0,
}).format(Number(value || 0));

const dateLabel = (value) => {
  if (!value || value === "Pending date") return value || "Pending date";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleDateString("vi-VN", { day: "2-digit", month: "short", year: "numeric" });
};

const isPaid = (registration) => ["paid", "success", "successful", "completed"].includes(
  String(registration.paymentStatus || "").toLowerCase().replace(/\s+/g, "_")
);

function OwnerDepositHistory() {
  const { registrations, isLoading, error } = useOwnerRegistrations();
  const paidRegistrations = useMemo(
    () => registrations.filter((item) => isPaid(item) && Number(item.entryFeeVnd) > 0),
    [registrations],
  );
  const [selectedId, setSelectedId] = useState(null);
  const selected = paidRegistrations.find((item) => item.id === selectedId) || paidRegistrations[0] || null;
  const totalPaid = paidRegistrations.reduce((total, item) => total + Number(item.entryFeeVnd || 0), 0);

  if (isLoading) {
    return <div className="owner-deposit-page"><LoadingSkeleton ariaLabel="Loading deposit history" rows={6} /></div>;
  }

  return (
    <div className="owner-deposit-page">
      <section className="owner-deposit-header">
        <div>
          <p className="owner-eyebrow">Finance / Owner records</p>
          <h1>Deposit history</h1>
          <p>Review registration fees paid for your tournament entries.</p>
        </div>
        <div className="owner-deposit-summary">
          <span><Receipt size={16} /> {paidRegistrations.length} paid entries</span>
          <strong>{money(totalPaid)}</strong>
          <small>Total registration fees</small>
        </div>
      </section>

      {error && <section className="admin-live-state admin-live-state--warning" aria-live="polite">{error}</section>}

      <section className="owner-deposit-layout">
        <div className="owner-deposit-list" aria-label="Paid registration history">
          <div className="owner-deposit-list__heading">
            <div><span className="owner-kicker">Payment records</span><h2>Paid registrations</h2></div>
            <span>{paidRegistrations.length} records</span>
          </div>

          {paidRegistrations.map((item) => (
            <button
              className={`owner-deposit-row${selected?.id === item.id ? " is-selected" : ""}`}
              key={item.id}
              onClick={() => setSelectedId(item.id)}
              type="button"
            >
              <span className="owner-deposit-row__date">{dateLabel(item.paymentPaidAt || item.submitted)}</span>
              <span className="owner-deposit-row__main">
                <strong>{item.tournament}</strong>
                <small>{item.race} · {item.horse}</small>
              </span>
              <span className="owner-deposit-row__amount">{money(item.entryFeeVnd)}</span>
              <span className="owner-deposit-row__status"><CheckCircle2 size={15} /> Paid</span>
              <ChevronRight className="owner-deposit-row__arrow" size={18} />
            </button>
          ))}

          {!paidRegistrations.length && (
            <div className="owner-empty owner-empty--compact">
              <CreditCard size={22} />
              <strong>No paid registrations yet</strong>
              <span>Completed tournament entry payments will appear here.</span>
            </div>
          )}
        </div>

        <aside className={`owner-deposit-detail${selected ? "" : " is-empty"}`} aria-live="polite">
          {selected ? (
            <>
              <div className="owner-deposit-detail__top">
                <div><span className="owner-kicker">Payment detail</span><h2>Registration receipt</h2></div>
                <span className="owner-badge owner-badge--green"><CheckCircle2 size={14} /> Paid</span>
                <button className="owner-icon-button owner-deposit-detail__close" aria-label="Close payment detail" onClick={() => setSelectedId(null)} type="button"><X size={17} /></button>
              </div>
              <div className="owner-deposit-detail__amount"><small>Amount paid</small><strong>{money(selected.entryFeeVnd)}</strong><span><CreditCard size={14} /> VNPay · {dateLabel(selected.paymentPaidAt || selected.submitted)}</span></div>
              <div className="owner-deposit-detail__tournament"><Trophy size={18} /><div><small>Tournament</small><strong>{selected.tournament}</strong><span>{selected.round}</span></div></div>
              <div className="owner-deposit-facts">
                <div><CalendarDays size={16} /><span>Race date<strong>{dateLabel(selected.raceDate)}</strong></span></div>
                <div><MapPin size={16} /><span>Venue<strong>{selected.venue}</strong></span></div>
                <div><Flag size={16} /><span>Race<strong>{selected.race}</strong></span></div>
                <div><UserRound size={16} /><span>Horse<strong>{selected.horse}</strong></span></div>
              </div>
              <div className="owner-deposit-detail__note"><FileText size={16} /><div><small>Registration note</small><p>{selected.note}</p></div></div>
              <div className="owner-deposit-detail__footer"><span>Payment status</span><strong>Successfully completed</strong></div>
            </>
          ) : (
            <div className="owner-deposit-detail__placeholder"><Receipt size={28} /><strong>Select a payment</strong><span>Click a record to view tournament information.</span></div>
          )}
        </aside>
      </section>

      {selected && <button className="owner-deposit-mobile-back" onClick={() => setSelectedId(null)} type="button"><ArrowLeft size={16} /> Back to payment list</button>}
    </div>
  );
}

export default OwnerDepositHistory;
