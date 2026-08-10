import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, CheckCircle2, CreditCard, Gift, Landmark, Package, RefreshCw, ShieldCheck, WalletCards } from "lucide-react";
import { depositApi } from "../../api/depositApi.js";
import { walletApi } from "../../api/walletApi.js";
import { formatTokenAmount, formatTransactionAmount, formatTransactionDate, getWalletBalance, transactionLabel } from "./walletFormatters.js";
import "./spectator.css";

const VALID_PAYMENT_METHODS = ["VNPAY", "MOMO"];
const CUSTOM_DEPOSIT_ENABLED = true;
const paymentMethods = (import.meta.env.VITE_PAYMENT_METHODS || "VNPAY,MOMO")
  .split(",")
  .map((method) => method.trim().toUpperCase())
  .filter((method) => VALID_PAYMENT_METHODS.includes(method));

const paymentMethodMeta = {
  VNPAY: {
    label: "VNPAY",
  },
  MOMO: {
    label: "MoMo",
  },
};

function formatVnd(value) {
  const amount = Number(value || 0);
  return new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND", maximumFractionDigits: 0 }).format(amount);
}

function getOrderDate(order) {
  return order?.created_at || order?.createdAt || order?.updated_at || order?.updatedAt;
}

function normalizePackages(payload) {
  return payload?.packages || [];
}

function normalizeOrders(payload) {
  return payload?.orders || payload?.history || [];
}

function normalizeTransactions(payload) {
  return payload?.transactions || payload?.history || [];
}

function normalizeActivityTone(status, transactionType = "") {
  const normalized = String(status || "").toLowerCase();
  const type = String(transactionType || "").toLowerCase();

  if (["lost", "failed", "failure", "cancelled", "canceled", "rejected", "expired"].includes(normalized)) return "lost";
  if (["pending", "processing"].includes(normalized)) return "pending";
  if (type.includes("redeem") || type.includes("reward")) return "redeem";
  if (["success", "completed", "complete", "published", "settled"].includes(normalized)) return "success";
  return "pending";
}

function formatActivityStatus(value) {
  const normalized = String(value || "pending").toLowerCase();
  if (normalized === "success") return "Success";
  if (normalized === "completed" || normalized === "complete") return "Completed";
  if (normalized === "published") return "Published";
  if (normalized === "won") return "Won";
  if (normalized === "lost") return "Lost";
  if (normalized === "failed" || normalized === "failure") return "Failed";
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

function formatPackageName(value) {
  if (!value) return "Custom top-up";
  return String(value)
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function Deposit() {
  const [walletState, setWalletState] = useState({ balance: null, isLoading: true, error: "" });
  const [packagesState, setPackagesState] = useState({ packages: [], isLoading: true, error: "" });
  const [historyState, setHistoryState] = useState({ orders: [], isLoading: true, error: "" });
  const [activityState, setActivityState] = useState({ transactions: [], isLoading: true, error: "" });
  const [ledgerFilter, setLedgerFilter] = useState("all");
  const [depositState, setDepositState] = useState({
    mode: "package",
    packageId: "",
    customTokenAmount: "75",
    paymentMethod: paymentMethods[0] || VALID_PAYMENT_METHODS[0],
    preview: null,
    isPreviewing: false,
    isSubmitting: false,
    message: "",
    error: "",
  });

  const selectedPackage = useMemo(
    () => packagesState.packages.find((item) => item.package_id === depositState.packageId) || null,
    [depositState.packageId, packagesState.packages]
  );
  const visiblePaymentMethods = paymentMethods.length ? paymentMethods : VALID_PAYMENT_METHODS;

  async function loadDepositData() {
    setWalletState((current) => ({ ...current, isLoading: true, error: "" }));
    setPackagesState((current) => ({ ...current, isLoading: true, error: "" }));
    setHistoryState((current) => ({ ...current, isLoading: true, error: "" }));
    setActivityState((current) => ({ ...current, isLoading: true, error: "" }));

    try {
      const [walletPayload, packagesPayload, historyPayload, transactionsPayload] = await Promise.all([
        walletApi.getMyWallet(),
        depositApi.listPackages(),
        depositApi.getHistory({ page: 1, limit: 20 }),
        walletApi.getTransactions({ type: "redeem", page: 1, limit: 20 }),
      ]);
      const packages = normalizePackages(packagesPayload);

      setWalletState({ balance: getWalletBalance(walletPayload), isLoading: false, error: "" });
      setPackagesState({ packages, isLoading: false, error: "" });
      setHistoryState({ orders: normalizeOrders(historyPayload), isLoading: false, error: "" });
      setActivityState({
        transactions: normalizeTransactions(transactionsPayload),
        isLoading: false,
        error: "",
      });
      setDepositState((current) => ({
        ...current,
        packageId: current.packageId || packages[0]?.package_id || "",
        paymentMethod: visiblePaymentMethods.includes(current.paymentMethod) ? current.paymentMethod : visiblePaymentMethods[0],
        error: "",
      }));
    } catch (error) {
      setWalletState((current) => ({ ...current, isLoading: false, error: error.message || "Unable to load wallet." }));
      setPackagesState((current) => ({ ...current, isLoading: false, error: error.message || "Unable to load deposit packages." }));
      setHistoryState((current) => ({ ...current, isLoading: false, error: error.message || "Unable to load deposit history." }));
      setActivityState((current) => ({ ...current, isLoading: false, error: error.message || "Unable to load account activity." }));
    }
  }

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const [walletPayload, packagesPayload, historyPayload, transactionsPayload] = await Promise.all([
          walletApi.getMyWallet(),
          depositApi.listPackages(),
          depositApi.getHistory({ page: 1, limit: 20 }),
          walletApi.getTransactions({ type: "redeem", page: 1, limit: 20 }),
        ]);
        if (cancelled) return;

        const packages = normalizePackages(packagesPayload);
        setWalletState({ balance: getWalletBalance(walletPayload), isLoading: false, error: "" });
        setPackagesState({ packages, isLoading: false, error: "" });
        setHistoryState({ orders: normalizeOrders(historyPayload), isLoading: false, error: "" });
        setActivityState({
          transactions: normalizeTransactions(transactionsPayload),
          isLoading: false,
          error: "",
        });
        setDepositState((current) => ({
          ...current,
          packageId: current.packageId || packages[0]?.package_id || "",
          paymentMethod: visiblePaymentMethods.includes(current.paymentMethod) ? current.paymentMethod : visiblePaymentMethods[0],
        }));
      } catch (error) {
        if (cancelled) return;
        setWalletState((current) => ({ ...current, isLoading: false, error: error.message || "Unable to load wallet." }));
        setPackagesState((current) => ({ ...current, isLoading: false, error: error.message || "Unable to load deposit packages." }));
        setHistoryState((current) => ({ ...current, isLoading: false, error: error.message || "Unable to load deposit history." }));
        setActivityState((current) => ({ ...current, isLoading: false, error: error.message || "Unable to load account activity." }));
      }
    }

    load();
    return () => { cancelled = true; };
  }, []);

  async function previewCustomDeposit() {
    const tokenAmount = Number(depositState.customTokenAmount);

    if (!Number.isInteger(tokenAmount) || tokenAmount < 1) {
      setDepositState((current) => ({ ...current, preview: null, error: "Custom token amount must be a positive integer.", message: "" }));
      return;
    }

    setDepositState((current) => ({ ...current, isPreviewing: true, error: "", message: "" }));

    try {
      const preview = await depositApi.previewCustom(tokenAmount);
      setDepositState((current) => ({ ...current, preview, isPreviewing: false, error: "" }));
    } catch (error) {
      setDepositState((current) => ({ ...current, preview: null, isPreviewing: false, error: error.message || "Unable to preview custom deposit." }));
    }
  }

  async function handleCreateIntent(event) {
    event.preventDefault();

    const isCustom = CUSTOM_DEPOSIT_ENABLED && depositState.mode === "custom";
    const customTokenAmount = Number(depositState.customTokenAmount);

    if (!depositState.paymentMethod) {
      setDepositState((current) => ({ ...current, error: "Please choose a payment method.", message: "" }));
      return;
    }

    if (!isCustom && !depositState.packageId) {
      setDepositState((current) => ({ ...current, error: "Please choose a deposit package.", message: "" }));
      return;
    }

    if (isCustom && (!Number.isInteger(customTokenAmount) || customTokenAmount < 1)) {
      setDepositState((current) => ({ ...current, error: "Custom token amount must be a positive integer.", message: "" }));
      return;
    }

    const body = isCustom
      ? { custom_token_amount: customTokenAmount, payment_method: depositState.paymentMethod }
      : { package_id: depositState.packageId, payment_method: depositState.paymentMethod };

    setDepositState((current) => ({ ...current, isSubmitting: true, error: "", message: "" }));

    try {
      const payload = await depositApi.createPaymentIntent(body);
      setDepositState((current) => ({
        ...current,
        isSubmitting: false,
        message: `Order ${payload.order_id || payload.order?.order_id || ""} created. Redirecting to payment gateway...`,
        error: "",
      }));

      if (payload.payment_url) {
        window.location.assign(payload.payment_url);
        return;
      }

      await loadDepositData();
    } catch (error) {
      setDepositState((current) => ({
        ...current,
        isSubmitting: false,
        message: "",
        error: error.message || "Unable to create payment intent.",
      }));
    }
  }

  const customPreview = depositState.preview;
  const packagePreview = selectedPackage
    ? {
      total_vnd: selectedPackage.vnd_price,
      total_token: selectedPackage.total_token ?? Number(selectedPackage.token_received || 0) + Number(selectedPackage.bonus_token || 0),
      bonus_token: selectedPackage.bonus_token || 0,
    }
    : null;
  const activePreview = depositState.mode === "custom"
    ? {
      total_vnd: customPreview?.vnd_price ?? Number(depositState.customTokenAmount || 0) * 1000,
      total_token: customPreview?.token_amount ?? Number(depositState.customTokenAmount || 0),
      bonus_token: 0,
    }
    : packagePreview;
  const activityRows = useMemo(() => {
    const depositRows = historyState.orders.map((order) => ({
      id: order._id || order.order_id,
      kind: "deposit",
      date: getOrderDate(order),
      title: `${paymentMethodMeta[order.payment_method]?.label || order.payment_method || "Wallet"} top-up`,
      detail: order.note || `${formatPackageName(order.package_id)} · ${formatVnd(order.total_vnd)}`,
      amountLabel: String(order.status || "").toLowerCase() === "success"
        ? `+${formatTokenAmount(order.total_token)}`
        : formatTokenAmount(order.total_token),
      status: order.status || "pending",
      tone: normalizeActivityTone(order.status, "deposit"),
      meta: "Deposit",
    }));

    const redemptionRows = activityState.transactions
      .filter((transaction) => transaction.transaction_type === "redeem")
      .map((transaction) => ({
        id: transaction._id || transaction.reference_id || `${transaction.transaction_type}-${transaction.created_at}`,
        kind: "redemption",
        date: transaction.created_at,
        title: transactionLabel(transaction.transaction_type),
        detail: transaction.note || "Prize exchange",
        amountLabel: formatTransactionAmount(transaction),
        status: transaction.status || "completed",
        tone: normalizeActivityTone(transaction.status, transaction.transaction_type),
        meta: transaction.direction === "credit" ? "Refund" : "Prize exchange",
      }));

    return [...depositRows, ...redemptionRows]
      .sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0))
      .slice(0, 24);
  }, [activityState.transactions, historyState.orders]);

  const visibleActivityRows = useMemo(
    () => ledgerFilter === "all" ? activityRows : activityRows.filter((row) => row.kind === ledgerFilter),
    [activityRows, ledgerFilter]
  );

  const ledgerCounts = useMemo(() => ({
    all: activityRows.length,
    deposit: activityRows.filter((row) => row.kind === "deposit").length,
    redemption: activityRows.filter((row) => row.kind === "redemption").length,
  }), [activityRows]);

  return (
    <section className="spectator-page deposit-page">
      <Link className="tournament-detail-back" to="/spectator/profile"><ArrowLeft size={16} /> Back to profile</Link>

      <header className="deposit-hero">
        <div className="deposit-hero__copy">
          <p className="spectator-eyebrow">Fund your wallet</p>
          <h1 className="spectator-title">Add TOKEN.<br />Stay race-ready.</h1>
          <p className="spectator-copy">Choose a token package or enter a custom amount, then pay securely through your preferred gateway.</p>
          <div className="deposit-hero__signals" aria-label="Deposit support summary">
            <span><ShieldCheck size={15} aria-hidden="true" /> Secure gateway return</span>
            <span><CreditCard size={15} aria-hidden="true" /> VNPAY or MoMo</span>
            <span><Gift size={15} aria-hidden="true" /> Deposit and prize logs</span>
          </div>
        </div>
        <aside className="deposit-balance-card">
          <span><WalletCards size={16} /> Current balance</span>
          <strong>{walletState.isLoading ? "Loading..." : formatTokenAmount(walletState.balance)}</strong>
          <small>{walletState.error || "Updated after successful deposits and prize exchanges."}</small>
          <Link to="/spectator/rewards">Browse prize rewards</Link>
        </aside>
      </header>

      <div className="deposit-layout deposit-layout--wide">
        <form className="deposit-form spectator-card" onSubmit={handleCreateIntent}>
          <div className="spectator-card__header">
            <div>
              <p className="spectator-eyebrow">Top-up</p>
              <h2>Choose how much to add</h2>
            </div>
            <span className="spectator-badge">Live rate · 1:1,000</span>
          </div>

          {CUSTOM_DEPOSIT_ENABLED && (
            <div className="deposit-mode-toggle" role="group" aria-label="Deposit mode">
              <button className={depositState.mode === "package" ? "is-active" : ""} type="button" onClick={() => setDepositState((current) => ({ ...current, mode: "package", error: "", message: "" }))}>Token packages</button>
              <button className={depositState.mode === "custom" ? "is-active" : ""} type="button" onClick={() => setDepositState((current) => ({ ...current, mode: "custom", error: "", message: "" }))}>Custom amount</button>
            </div>
          )}

          {depositState.mode === "package" ? (
            <div className="deposit-package-grid" aria-label="Active deposit packages">
              {packagesState.isLoading && <div className="deposit-empty">Loading packages...</div>}
              {!packagesState.isLoading && packagesState.error && <div className="deposit-empty">{packagesState.error}</div>}
              {!packagesState.isLoading && !packagesState.error && !packagesState.packages.length && <div className="deposit-empty">No active packages are available.</div>}
              {packagesState.packages.map((item) => {
                const totalToken = item.total_token ?? Number(item.token_received || 0) + Number(item.bonus_token || 0);
                return (
                  <button
                    className={item.package_id === depositState.packageId ? "deposit-package is-selected" : "deposit-package"}
                    key={item._id || item.package_id}
                    type="button"
                    onClick={() => setDepositState((current) => ({ ...current, packageId: item.package_id, error: "", message: "" }))}
                  >
                    <span><Package size={15} /> {item.label || item.package_id}</span>
                    <strong>{formatVnd(item.vnd_price)}</strong>
                    <small>{formatTokenAmount(totalToken)}{item.bonus_token ? ` includes +${item.bonus_token} bonus` : ""}</small>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="deposit-custom-row">
              <label htmlFor="deposit-token-amount">
                <span>Token amount</span>
                <input
                  id="deposit-token-amount"
                  min="1"
                  step="1"
                  type="number"
                  value={depositState.customTokenAmount}
                  onChange={(event) => setDepositState((current) => ({ ...current, customTokenAmount: event.target.value, preview: null, error: "", message: "" }))}
                />
              </label>
              <button className="spectator-button spectator-button--secondary" disabled={depositState.isPreviewing} type="button" onClick={previewCustomDeposit}>
                {depositState.isPreviewing ? "Previewing..." : "Preview"}
              </button>
              <small className="deposit-custom-note">Custom top-ups use the standard rate and do not include package bonus tokens.</small>
            </div>
          )}

          <div className="deposit-payment-methods" aria-label="Payment method">
            <span className="deposit-field-label">Payment method</span>
            <div className="deposit-payment-method-grid">
              {visiblePaymentMethods.map((method) => {
                const meta = paymentMethodMeta[method] || { label: method };
                const isSelected = depositState.paymentMethod === method;
                return (
                  <button
                    className={isSelected ? "deposit-payment-method is-selected" : "deposit-payment-method"}
                    key={method}
                    type="button"
                    onClick={() => setDepositState((current) => ({ ...current, paymentMethod: method, error: "", message: "" }))}
                    aria-pressed={isSelected}
                  >
                    <Landmark size={17} aria-hidden="true" />
                    <strong>{meta.label}</strong>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="deposit-preview">
            <div><span>You receive</span><strong>{activePreview ? formatTokenAmount(activePreview.total_token) : "-- TOKEN"}</strong></div>
            <div><span>You pay</span><strong>{activePreview ? formatVnd(activePreview.total_vnd) : "-- VND"}</strong></div>
            {activePreview?.bonus_token > 0 && <small>Includes +{activePreview.bonus_token} bonus TOKEN</small>}
          </div>

          {(depositState.message || depositState.error) && (
            <div className={depositState.error ? "deposit-status is-error" : "deposit-status is-success"} role="status">
              {depositState.error || depositState.message}
            </div>
          )}

          <button className="spectator-button spectator-button--primary" disabled={depositState.isSubmitting || packagesState.isLoading} type="submit">
            <CreditCard size={17} /> {depositState.isSubmitting ? "Creating order..." : "Continue to payment"}
          </button>
        </form>

        <article className="spectator-card deposit-history-card">
          <div className="spectator-card__header">
            <div>
              <p className="spectator-eyebrow">Focused wallet ledger</p>
              <h2>Deposits & prize exchanges</h2>
            </div>
            <button className="spectator-badge profile-refresh-button" disabled={historyState.isLoading || activityState.isLoading} type="button" onClick={loadDepositData}>
              <RefreshCw size={13} /> Refresh
            </button>
          </div>

          <div className="deposit-activity-summary" aria-label="Deposit account summary">
            <div><Package size={16} /><span>Deposit logs</span><strong>{ledgerCounts.deposit}</strong></div>
            <div><Gift size={16} /><span>Prize exchanges</span><strong>{ledgerCounts.redemption}</strong></div>
            <div><WalletCards size={16} /><span>Current balance</span><strong>{walletState.isLoading ? "--" : formatTokenAmount(walletState.balance)}</strong></div>
          </div>

          <div className="deposit-ledger-filters" role="tablist" aria-label="Filter wallet ledger">
            {[
              { id: "all", label: "All logs" },
              { id: "deposit", label: "Deposits" },
              { id: "redemption", label: "Prize exchanges" },
            ].map((item) => (
              <button
                aria-selected={ledgerFilter === item.id}
                className={ledgerFilter === item.id ? "is-active" : ""}
                key={item.id}
                role="tab"
                type="button"
                onClick={() => setLedgerFilter(item.id)}
              >
                {item.label} <b>{ledgerCounts[item.id]}</b>
              </button>
            ))}
          </div>

          <div className="deposit-history-list deposit-activity-list">
            {(historyState.isLoading || activityState.isLoading) && <div className="deposit-history-row"><span>Loading</span><strong>Wallet ledger</strong><small>Fetching deposits and prize exchanges</small><b>--</b></div>}
            {!historyState.isLoading && (historyState.error || activityState.error) && <div className="deposit-history-row"><span>Error</span><strong>Some activity is unavailable</strong><small>{historyState.error || activityState.error}</small><b>--</b></div>}
            {!historyState.isLoading && !activityState.isLoading && !historyState.error && !activityState.error && !visibleActivityRows.length && <div className="deposit-history-row"><span>Empty</span><strong>No matching wallet logs</strong><small>Successful top-ups and prize exchanges will appear here.</small><b>0 TOKEN</b></div>}
            {!historyState.isLoading && !activityState.isLoading && visibleActivityRows.map((row) => (
              <div className={`deposit-history-row deposit-activity-row deposit-activity-row--${row.tone}`} key={`${row.kind}-${row.id}`}>
                <span className="deposit-history-row__date">
                  <span>{formatTransactionDate(row.date)}</span>
                  <em className={`deposit-status-tag deposit-status-tag--${row.tone}`}>{formatActivityStatus(row.status)}</em>
                </span>
                <span className="deposit-history-row__main">
                  <strong>{row.kind === "deposit" ? <Landmark size={14} aria-hidden="true" /> : <Gift size={14} aria-hidden="true" />}{row.title} {row.tone === "success" && <CheckCircle2 size={14} aria-hidden="true" />}</strong>
                  <small>{row.detail}</small>
                </span>
                <b className={row.tone === "success" ? "profile-history__won deposit-history-row__amount" : "deposit-history-row__amount"}>{row.amountLabel}</b>
                <em className="deposit-history-row__meta">{row.meta}</em>
              </div>
            ))}
          </div>
        </article>
      </div>
    </section>
  );
}

export default Deposit;
