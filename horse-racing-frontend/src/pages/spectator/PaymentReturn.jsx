import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ArrowLeft, CheckCircle2, Clock3, CreditCard, ReceiptText, RefreshCw, ShieldCheck, WalletCards, XCircle } from "lucide-react";
import { depositApi } from "../../api/depositApi.js";
import { ownerApi } from "../../api/ownerApi.js";
import { walletApi } from "../../api/walletApi.js";
import { formatTokenAmount, getWalletBalance } from "./walletFormatters.js";
import "./spectator.css";

function findOrder(orders, orderId) {
  if (!orderId) return orders[0] || null;
  return orders.find((order) => order.order_id === orderId || order.gateway_reference_id === orderId) || null;
}

export default function PaymentReturn() {
  const [searchParams] = useSearchParams();
  const orderId = searchParams.get("order_id") || searchParams.get("vnp_TxnRef") || searchParams.get("orderId") || "";
  const gatewayStatus = searchParams.get("status") || searchParams.get("vnp_ResponseCode") || searchParams.get("resultCode") || "";
  const paymentMethod = searchParams.get("payment_method") || searchParams.get("method") || "";
  const isRegistrationPayment = orderId.startsWith("REG-");
  const [state, setState] = useState({ order: null, balance: null, isLoading: true, error: "", polls: 0 });

  const statusCopy = useMemo(() => {
    const orderStatus = String(state.order?.status || "").toLowerCase();
    if (orderStatus === "success") return { title: "Payment completed", tone: "success", detail: isRegistrationPayment ? "Your race registration payment is recorded." : "Your wallet and deposit history are up to date.", icon: CheckCircle2 };
    if (orderStatus === "failed") return { title: "Payment failed", tone: "error", detail: isRegistrationPayment ? "The race registration fee was not confirmed." : "No TOKEN was credited for this order.", icon: XCircle };
    return { title: "Payment processing", tone: "pending", detail: "We are checking the latest gateway confirmation for this order.", icon: Clock3 };
  }, [isRegistrationPayment, state.order]);

  const StatusIcon = statusCopy.icon;
  const orderStatus = String(state.order?.status || "pending").toLowerCase();
  const orderAmount = state.order
    ? isRegistrationPayment
      ? new Intl.NumberFormat("en-US", { style: "currency", currency: "VND", maximumFractionDigits: 0 }).format(Number(state.order.total_vnd || 0))
      : formatTokenAmount(state.order.total_token)
    : "Pending";
  const gatewayLabel = paymentMethod || (searchParams.get("vnp_TxnRef") ? "VNPAY" : "Gateway");
  const backTarget = isRegistrationPayment ? "/owner/registrations" : "/spectator/deposit";
  const depositHistoryTarget = isRegistrationPayment ? "/owner/deposit-history" : "/spectator/deposit";
  const backLabel = isRegistrationPayment ? "Back to registrations" : "Back to deposit";
  const hasSignedGatewayPayload = Boolean(
    searchParams.get("vnp_SecureHash")
    || searchParams.get("signature")
    || searchParams.get("mock_secret")
  );

  async function refresh(polls = state.polls) {
    setState((current) => ({ ...current, isLoading: true, error: "" }));

    try {
      if (isRegistrationPayment) {
        const response = hasSignedGatewayPayload
          ? await depositApi.confirmPaymentReturn(Object.fromEntries(searchParams.entries()))
          : await ownerApi.getRegistrationPayment(orderId);
        setState({
          order: response.order || {
            order_id: orderId,
            status: response.registration?.payment_status === "paid" ? "success" : response.registration?.payment_status || "pending",
            total_vnd: response.registration?.entry_fee_vnd || 0,
            package_id: "RACE_REGISTRATION",
            gateway_reference_id: response.registration?.gateway_reference_id,
          },
          balance: null,
          isLoading: false,
          error: "",
          polls,
        });
        return;
      }

      if (searchParams.get("vnp_TxnRef") || searchParams.get("vnp_SecureHash") || searchParams.get("orderId")) {
        await depositApi.confirmPaymentReturn(Object.fromEntries(searchParams.entries()));
      }

      const [historyPayload, walletPayload] = await Promise.all([
        depositApi.getHistory({ page: 1, limit: 10 }),
        walletApi.getMyWallet(),
      ]);
      const orders = historyPayload.orders || historyPayload.history || [];
      setState({
        order: findOrder(orders, orderId),
        balance: getWalletBalance(walletPayload),
        isLoading: false,
        error: "",
        polls,
      });
    } catch (error) {
      setState((current) => ({ ...current, isLoading: false, error: error.message || "Unable to refresh payment status." }));
    }
  }

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!cancelled) await refresh(0);
    }

    load();
    return () => { cancelled = true; };
  }, [orderId]);

  useEffect(() => {
    if (state.isLoading || state.error) return undefined;
    const status = String(state.order?.status || "").toLowerCase();
    if (["success", "failed"].includes(status) || state.polls >= 5) return undefined;

    const timeout = window.setTimeout(() => {
      refresh(state.polls + 1);
    }, 2500);

    return () => window.clearTimeout(timeout);
  }, [state.isLoading, state.error, state.order, state.polls]);

  return (
    <section className="spectator-page payment-return-page">
      <Link className="tournament-detail-back" to={backTarget}><ArrowLeft size={16} /> {backLabel}</Link>

      <article className={`payment-return-panel payment-return-panel--${statusCopy.tone}`} aria-labelledby="payment-return-title">
        <div className="payment-return-panel__main">
          <span className="payment-return-status-mark"><StatusIcon size={28} aria-hidden="true" /></span>
          <p className="spectator-eyebrow">Payment return</p>
          <h1 id="payment-return-title">{statusCopy.title}</h1>
          <p>{statusCopy.detail}</p>

          <div className="payment-return-actions">
            <Link className="spectator-button spectator-button--primary" to={depositHistoryTarget}>Open deposit history</Link>
            <button className="spectator-button spectator-button--secondary payment-return-refresh" disabled={state.isLoading} type="button" onClick={() => refresh(state.polls)}>
              <RefreshCw size={16} className={state.isLoading ? "payment-return-spin" : ""} aria-hidden="true" /> Refresh
            </button>
          </div>
        </div>

        <aside className="payment-return-balance" aria-label={isRegistrationPayment ? "Registration payment amount" : "Current wallet balance"}>
          <span><WalletCards size={17} aria-hidden="true" /> {isRegistrationPayment ? "Registration fee" : "Current balance"}</span>
          <strong>{state.isLoading ? "Checking" : isRegistrationPayment ? orderAmount : formatTokenAmount(state.balance)}</strong>
          <small>{gatewayStatus ? `${gatewayLabel} code ${gatewayStatus}` : isRegistrationPayment ? "VND gateway payment" : "Latest wallet snapshot"}</small>
        </aside>
      </article>

      <section className="payment-return-grid" aria-label="Payment summary">
        <article className="payment-return-receipt">
          <div className="payment-return-card-heading">
            <span><ReceiptText size={17} aria-hidden="true" /> Latest order</span>
            <strong>{orderId || state.order?.order_id || "Deposit status"}</strong>
          </div>

          {state.error ? (
            <div className="deposit-status is-error">{state.error}</div>
          ) : (
            <div className={`payment-return-result payment-return-result--${statusCopy.tone}`} role="status">
              <StatusIcon size={18} aria-hidden="true" />
              <span>{orderStatus}</span>
              <strong>{orderAmount}</strong>
            </div>
          )}

          <dl className="payment-return-details">
            <div><dt>Gateway</dt><dd>{gatewayLabel}</dd></div>
            <div><dt>Reference</dt><dd>{state.order?.gateway_reference_id || searchParams.get("vnp_BankTranNo") || "Pending"}</dd></div>
            <div><dt>{isRegistrationPayment ? "Purpose" : "Package"}</dt><dd>{state.order?.package_id || (isRegistrationPayment ? "RACE_REGISTRATION" : "Checking")}</dd></div>
          </dl>
        </article>

        <article className="payment-return-receipt payment-return-receipt--steps">
          <div className="payment-return-card-heading">
            <span><ShieldCheck size={17} aria-hidden="true" /> Settlement check</span>
            <strong>{state.polls > 0 ? `Checked ${state.polls + 1} times` : "Live status"}</strong>
          </div>

          <ol className="payment-return-steps">
            <li className="is-complete"><CreditCard size={16} aria-hidden="true" /><span>Gateway payment</span><strong>Received</strong></li>
            <li className={orderStatus === "success" ? "is-complete" : orderStatus === "failed" ? "is-error" : "is-active"}><ShieldCheck size={16} aria-hidden="true" /><span>{isRegistrationPayment ? "Registration settlement" : "Wallet settlement"}</span><strong>{orderStatus}</strong></li>
            <li className={orderStatus === "success" ? "is-complete" : ""}><WalletCards size={16} aria-hidden="true" /><span>{isRegistrationPayment ? "Entry update" : "History refresh"}</span><strong>{state.order ? "Ready" : "Waiting"}</strong></li>
          </ol>
        </article>
      </section>
    </section>
  );
}
