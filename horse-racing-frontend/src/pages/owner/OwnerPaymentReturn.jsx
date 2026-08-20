import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  ArrowLeft,
  BadgeCheck,
  CalendarDays,
  CheckCircle2,
  CircleAlert,
  Clock3,
  CreditCard,
  FileText,
  Flag,
  MapPin,
  ReceiptText,
  RefreshCw,
  ShieldCheck,
  Trophy,
  XCircle,
} from "lucide-react";
import { ownerApi } from "../../api/ownerApi";
import "./owner.css";

const money = (value) => new Intl.NumberFormat("vi-VN", {
  style: "currency",
  currency: "VND",
  maximumFractionDigits: 0,
}).format(Number(value || 0));

function getEntityName(value, fallback) {
  if (!value) return fallback;
  if (typeof value === "string") return fallback;
  return value.name || value.title || fallback;
}

function getEntityDetail(value, field, fallback) {
  if (!value || typeof value === "string") return fallback;
  return value[field] || fallback;
}

function formatDate(value, fallback = "Pending") {
  if (!value) return fallback;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return fallback;

  return date.toLocaleString("vi-VN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getStatusCopy(status) {
  if (status === "success") {
    return {
      title: "Registration confirmed",
      detail: "Your entry fee has been recorded and your horse now has a confirmed place in this race.",
      tone: "success",
      icon: CheckCircle2,
    };
  }

  if (status === "failed") {
    return {
      title: "Payment was not completed",
      detail: "Your race entry has not been confirmed. You can return to registrations and try again when ready.",
      tone: "error",
      icon: XCircle,
    };
  }

  return {
    title: "Confirming your entry",
    detail: "We are waiting for the latest confirmation from the payment gateway. This page refreshes automatically.",
    tone: "pending",
    icon: Clock3,
  };
}

export default function OwnerPaymentReturn() {
  const [searchParams] = useSearchParams();
  const orderId = searchParams.get("order_id") || searchParams.get("vnp_TxnRef") || searchParams.get("orderId") || "";
  const gatewayStatus = searchParams.get("status") || searchParams.get("vnp_ResponseCode") || searchParams.get("resultCode") || "";
  const paymentMethod = searchParams.get("payment_method") || searchParams.get("method") || "VNPAY";
  const [state, setState] = useState({ registration: null, order: null, isLoading: true, error: "", polls: 0 });

  const refresh = useCallback(async (polls = 0) => {
    if (!orderId) {
      setState({ registration: null, order: null, isLoading: false, error: "No registration payment reference was provided.", polls });
      return;
    }

    setState((current) => ({ ...current, isLoading: true, error: "" }));

    try {
      const response = await ownerApi.getRegistrationPayment(orderId);
      setState({
        registration: response.registration || null,
        order: response.order || null,
        isLoading: false,
        error: "",
        polls,
      });
    } catch (error) {
      setState((current) => ({
        ...current,
        isLoading: false,
        error: error.message || "Unable to retrieve the registration payment.",
      }));
    }
  }, [orderId]);

  useEffect(() => {
    refresh(0);
  }, [refresh]);

  const orderStatus = String(state.order?.status || state.registration?.payment_status || "pending").toLowerCase();
  const normalizedStatus = ["success", "paid", "approved", "completed"].includes(orderStatus)
    ? "success"
    : ["failed", "rejected", "refund_pending", "refunded"].includes(orderStatus)
      ? "failed"
      : "pending";
  const statusCopy = getStatusCopy(normalizedStatus);
  const StatusIcon = statusCopy.icon;
  const registration = state.registration || {};
  const race = registration.race || registration.race_id;
  const horse = registration.horse || registration.horse_id;
  const tournament = registration.tournament || registration.tournament_id;
  const amount = state.order?.total_vnd ?? registration.entry_fee_vnd ?? 0;
  const reference = state.order?.gateway_reference_id || registration.gateway_reference_id || searchParams.get("vnp_BankTranNo") || "Waiting for gateway";
  const shouldPoll = !state.isLoading && !state.error && normalizedStatus === "pending" && state.polls < 5;

  useEffect(() => {
    if (!shouldPoll) return undefined;

    const timeout = window.setTimeout(() => refresh(state.polls + 1), 2500);
    return () => window.clearTimeout(timeout);
  }, [refresh, shouldPoll, state.polls]);

  const settlementLabel = useMemo(() => {
    if (normalizedStatus === "success") return "Entry confirmed";
    if (normalizedStatus === "failed") return "Entry not confirmed";
    return "Checking gateway";
  }, [normalizedStatus]);

  return (
    <section className="owner-payment-return" aria-labelledby="owner-payment-return-title">
      <Link className="owner-payment-return__back" to="/owner/registrations">
        <ArrowLeft size={17} aria-hidden="true" /> Back to registrations
      </Link>

      <article className={`owner-payment-return__hero owner-payment-return__hero--${statusCopy.tone}`}>
        <div className="owner-payment-return__copy">
          <span className="owner-payment-return__mark"><StatusIcon size={29} aria-hidden="true" /></span>
          <span className="owner-kicker">Race entry payment</span>
          <h1 id="owner-payment-return-title">{statusCopy.title}</h1>
          <p>{statusCopy.detail}</p>

          <div className="owner-payment-return__actions">
            <Link className="owner-button owner-button--primary" to="/owner/registrations">
              {normalizedStatus === "success" ? "View registrations" : "Return to registrations"}
            </Link>
            <Link className="owner-button" to="/owner/deposit-history">View payment record</Link>
            <button className="owner-button owner-payment-return__refresh" disabled={state.isLoading} onClick={() => refresh(state.polls)} type="button">
              <RefreshCw className={state.isLoading ? "owner-payment-return__spin" : ""} size={16} aria-hidden="true" />
              Refresh status
            </button>
          </div>
        </div>

        <aside className="owner-payment-return__amount" aria-label="Registration fee">
          <span><CreditCard size={18} aria-hidden="true" /> Registration fee</span>
          <strong>{state.isLoading ? "Checking" : money(amount)}</strong>
          <small>{gatewayStatus ? `${paymentMethod} response ${gatewayStatus}` : `${paymentMethod} payment`}</small>
          <div><span>Order</span><code>{orderId || "Unavailable"}</code></div>
        </aside>
      </article>

      {state.error ? (
        <section className="owner-payment-return__error" role="alert">
          <CircleAlert size={20} aria-hidden="true" />
          <div><strong>We could not load this payment yet.</strong><span>{state.error}</span></div>
        </section>
      ) : (
        <div className="owner-payment-return__grid">
          <article className="owner-payment-return__card owner-payment-return__entry-card">
            <div className="owner-payment-return__card-heading">
              <span><BadgeCheck size={18} aria-hidden="true" /> Race entry</span>
              <strong>{settlementLabel}</strong>
            </div>

            <div className="owner-payment-return__entry-name">
              <Trophy size={22} aria-hidden="true" />
              <div>
                <small>Tournament</small>
                <strong>{getEntityName(tournament, "Tournament entry")}</strong>
              </div>
            </div>

            <dl className="owner-payment-return__entry-facts">
              <div><dt><Flag size={15} aria-hidden="true" /> Race</dt><dd>{getEntityName(race, "Race pending")}</dd></div>
              <div><dt><CalendarDays size={15} aria-hidden="true" /> Race date</dt><dd>{formatDate(getEntityDetail(race, "race_date", registration.race_date), "To be scheduled")}</dd></div>
              <div><dt><MapPin size={15} aria-hidden="true" /> Venue</dt><dd>{getEntityDetail(race, "location", "Venue pending")}</dd></div>
              <div><dt><ReceiptText size={15} aria-hidden="true" /> Horse</dt><dd>{getEntityName(horse, "Horse entry")}</dd></div>
            </dl>
          </article>

          <article className="owner-payment-return__card">
            <div className="owner-payment-return__card-heading">
              <span><ShieldCheck size={18} aria-hidden="true" /> Payment record</span>
              <strong>{normalizedStatus === "pending" ? "Live check" : "Recorded"}</strong>
            </div>

            <dl className="owner-payment-return__payment-facts">
              <div><dt>Payment method</dt><dd>{paymentMethod}</dd></div>
              <div><dt>Gateway reference</dt><dd>{reference}</dd></div>
              <div><dt>Paid at</dt><dd>{formatDate(registration.payment_paid_at, normalizedStatus === "success" ? "Confirmed" : "Not confirmed")}</dd></div>
            </dl>

            <ol className="owner-payment-return__steps">
              <li className="is-complete"><CreditCard size={16} aria-hidden="true" /><span>Gateway payment</span><strong>{gatewayStatus === "00" || normalizedStatus === "success" ? "Received" : "Sent"}</strong></li>
              <li className={normalizedStatus === "success" ? "is-complete" : normalizedStatus === "failed" ? "is-error" : "is-active"}><ShieldCheck size={16} aria-hidden="true" /><span>Registration settlement</span><strong>{normalizedStatus === "success" ? "Confirmed" : normalizedStatus === "failed" ? "Declined" : "Checking"}</strong></li>
              <li className={normalizedStatus === "success" ? "is-complete" : ""}><FileText size={16} aria-hidden="true" /><span>Entry record</span><strong>{normalizedStatus === "success" ? "Ready" : "Waiting"}</strong></li>
            </ol>
          </article>
        </div>
      )}
    </section>
  );
}
