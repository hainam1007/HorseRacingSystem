import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  BadgeCheck,
  Clock3,
  Gift,
  PackageCheck,
  RefreshCw,
  ShieldCheck,
  ShoppingBag,
  WalletCards,
  X,
} from "lucide-react";
import { rewardApi } from "../../api/rewardApi.js";
import { walletApi } from "../../api/walletApi.js";
import LoadingSkeleton from "../../components/LoadingSkeleton.jsx";
import { formatTokenAmount, formatTransactionDate, getWalletBalance } from "./walletFormatters.js";
import "./spectator.css";

function normalizeRewards(payload) {
  return payload?.items || payload?.rewards || [];
}

function normalizeRedemptions(payload) {
  return payload?.redemptions || payload?.items || [];
}

function getItemId(item) {
  return item?._id || item?.id || item?.item_id;
}

function getRedemptionItem(redemption) {
  return redemption?.item_id && typeof redemption.item_id === "object" ? redemption.item_id : redemption?.item || null;
}

function statusClass(status) {
  if (status === "completed") return "spectator-badge--green";
  if (status === "cancelled") return "spectator-badge--red";
  return "spectator-badge--amber";
}

export default function Rewards() {
  const [walletState, setWalletState] = useState({ balance: null, isLoading: true, error: "" });
  const [rewardsState, setRewardsState] = useState({ items: [], isLoading: true, error: "" });
  const [historyState, setHistoryState] = useState({ redemptions: [], meta: null, isLoading: true, error: "" });
  const [redeemState, setRedeemState] = useState({ itemId: "", message: "", error: "" });
  const [confirmReward, setConfirmReward] = useState(null);

  async function loadRewardsData() {
    setWalletState((current) => ({ ...current, isLoading: true, error: "" }));
    setRewardsState((current) => ({ ...current, isLoading: true, error: "" }));
    setHistoryState((current) => ({ ...current, isLoading: true, error: "" }));

    try {
      const [walletPayload, rewardsPayload, redemptionsPayload] = await Promise.all([
        walletApi.getMyWallet(),
        rewardApi.listRewards(),
        rewardApi.getMyRedemptions({ page: 1, limit: 8 }),
      ]);

      setWalletState({ balance: getWalletBalance(walletPayload), isLoading: false, error: "" });
      setRewardsState({ items: normalizeRewards(rewardsPayload), isLoading: false, error: "" });
      setHistoryState({
        redemptions: normalizeRedemptions(redemptionsPayload),
        meta: redemptionsPayload?.meta || null,
        isLoading: false,
        error: "",
      });
    } catch (error) {
      setWalletState((current) => ({ ...current, isLoading: false, error: error.message || "Unable to load wallet." }));
      setRewardsState((current) => ({ ...current, isLoading: false, error: error.message || "Unable to load reward catalog." }));
      setHistoryState((current) => ({ ...current, isLoading: false, error: error.message || "Unable to load redemption history." }));
    }
  }

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const [walletPayload, rewardsPayload, redemptionsPayload] = await Promise.all([
          walletApi.getMyWallet(),
          rewardApi.listRewards(),
          rewardApi.getMyRedemptions({ page: 1, limit: 8 }),
        ]);

        if (cancelled) return;
        setWalletState({ balance: getWalletBalance(walletPayload), isLoading: false, error: "" });
        setRewardsState({ items: normalizeRewards(rewardsPayload), isLoading: false, error: "" });
        setHistoryState({
          redemptions: normalizeRedemptions(redemptionsPayload),
          meta: redemptionsPayload?.meta || null,
          isLoading: false,
          error: "",
        });
      } catch (error) {
        if (cancelled) return;
        setWalletState((current) => ({ ...current, isLoading: false, error: error.message || "Unable to load wallet." }));
        setRewardsState((current) => ({ ...current, isLoading: false, error: error.message || "Unable to load reward catalog." }));
        setHistoryState((current) => ({ ...current, isLoading: false, error: error.message || "Unable to load redemption history." }));
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleRedeem(item) {
    const itemId = getItemId(item);
    if (!itemId) return;

    setConfirmReward(null);
    setRedeemState({ itemId, message: "", error: "" });

    try {
      const payload = await rewardApi.redeemReward(itemId);
      const nextBalance = getWalletBalance(payload);
      const updatedItem = payload?.item;
      const updatedItemId = getItemId(updatedItem);

      setWalletState((current) => ({
        ...current,
        balance: nextBalance ?? current.balance,
        error: "",
      }));
      setRewardsState((current) => ({
        ...current,
        items: current.items.map((reward) => (getItemId(reward) === updatedItemId ? { ...reward, ...updatedItem } : reward)),
      }));
      setRedeemState({
        itemId: "",
        message: `${item.name || "Reward"} redeemed. Fulfilment status is pending.`,
        error: "",
      });
      await loadRewardsData();
    } catch (error) {
      setRedeemState({
        itemId: "",
        message: "",
        error: error.message || "Unable to redeem reward.",
      });
    }
  }

  function requestRedeem(item) {
    setRedeemState({ itemId: "", message: "", error: "" });
    setConfirmReward(item);
  }

  const walletBalance = Number(walletState.balance ?? 0);
  const catalogStats = useMemo(() => {
    const available = rewardsState.items.filter((item) => Number(item.stock || 0) > 0).length;
    const affordable = rewardsState.items.filter((item) => Number(item.token_price || 0) <= walletBalance && Number(item.stock || 0) > 0).length;
    const lowestPrice = rewardsState.items.reduce((min, item) => {
      const price = Number(item.token_price);
      if (!Number.isFinite(price)) return min;
      return min === null ? price : Math.min(min, price);
    }, null);

    return { available, affordable, lowestPrice };
  }, [rewardsState.items, walletBalance]);

  if (rewardsState.isLoading && historyState.isLoading) {
    return <LoadingSkeleton ariaLabel="Loading rewards" rows={5} variant="cards" />;
  }

  return (
    <section className="spectator-page rewards-page">
      <header className="rewards-hero">
        <div className="rewards-hero__copy">
          <p className="spectator-eyebrow">Reward exchange</p>
          <h1 className="spectator-title">Redeem TOKEN for trackside rewards.</h1>
          <p className="spectator-copy">
            Choose an active reward, confirm the token spend, and track the fulfillment record from your redemption ledger.
          </p>
          <div className="rewards-hero__signals" aria-label="Reward exchange safeguards">
            <span><ShieldCheck size={15} aria-hidden="true" /> Token deducted atomically</span>
            <span><PackageCheck size={15} aria-hidden="true" /> Stock checked live</span>
            <span><Clock3 size={15} aria-hidden="true" /> New requests start pending</span>
          </div>
        </div>

        <aside className="rewards-wallet-panel">
          <span><WalletCards size={16} aria-hidden="true" /> Available balance</span>
          <strong>{walletState.isLoading ? "-- TOKEN" : formatTokenAmount(walletState.balance)}</strong>
          <small>{walletState.error || "Used for predictions, deposits, and reward redemption."}</small>
          <div className="rewards-wallet-panel__actions">
            <Link className="spectator-button spectator-button--primary" to="/spectator/deposit">Add TOKEN</Link>
            <Link className="spectator-button" to="/spectator/profile">Wallet logs</Link>
          </div>
        </aside>
      </header>

      <div className="rewards-stat-grid" aria-label="Reward catalog summary">
        <article>
          <ShoppingBag size={18} aria-hidden="true" />
          <span>Active rewards</span>
          <strong>{rewardsState.isLoading ? "--" : rewardsState.items.length}</strong>
          <small>{catalogStats.available} currently in stock</small>
        </article>
        <article>
          <BadgeCheck size={18} aria-hidden="true" />
          <span>Affordable now</span>
          <strong>{walletState.isLoading ? "--" : catalogStats.affordable}</strong>
          <small>Based on current wallet balance</small>
        </article>
        <article>
          <Gift size={18} aria-hidden="true" />
          <span>Lowest token tier</span>
          <strong>{catalogStats.lowestPrice === null ? "--" : formatTokenAmount(catalogStats.lowestPrice)}</strong>
          <small>Catalog sorted by token price</small>
        </article>
      </div>

      {(redeemState.message || redeemState.error) && (
        <div className={redeemState.error ? "rewards-status is-error" : "rewards-status is-success"} role="status">
          {redeemState.error || redeemState.message}
        </div>
      )}

      <div className="rewards-layout">
        <article className="spectator-card rewards-catalog">
          <div className="spectator-card__header">
            <div>
              <p className="spectator-eyebrow">Catalog</p>
              <h2>Available rewards</h2>
            </div>
            <button className="spectator-badge profile-refresh-button" disabled={rewardsState.isLoading || historyState.isLoading} type="button" onClick={loadRewardsData}>
              <RefreshCw size={13} aria-hidden="true" /> Refresh
            </button>
          </div>

          {rewardsState.isLoading && <LoadingSkeleton ariaLabel="Loading reward catalog" rows={4} variant="cards" />}
          {!rewardsState.isLoading && rewardsState.error && (
            <div className="rewards-empty" role="alert">
              <Gift size={22} aria-hidden="true" />
              <strong>Reward catalog unavailable</strong>
              <span>{rewardsState.error}</span>
            </div>
          )}
          {!rewardsState.isLoading && !rewardsState.error && !rewardsState.items.length && (
            <div className="rewards-empty">
              <Gift size={22} aria-hidden="true" />
              <strong>No rewards are active</strong>
              <span>When operations enables reward items, they will appear here by token tier.</span>
            </div>
          )}

          {!rewardsState.isLoading && !rewardsState.error && rewardsState.items.length > 0 && (
            <div className="rewards-catalog-grid">
              {rewardsState.items.map((item) => {
                const itemId = getItemId(item);
                const price = Number(item.token_price || 0);
                const stock = Number(item.stock || 0);
                const isOutOfStock = stock <= 0;
                const isUnaffordable = walletState.balance !== null && price > walletBalance;
                const isRedeeming = redeemState.itemId === itemId;
                const actionDisabled = isRedeeming || isOutOfStock || isUnaffordable || walletState.isLoading;

                return (
                  <article className="reward-card" key={itemId || item.name}>
                    <div className="reward-card__media">
                      {item.image_url ? <img src={item.image_url} alt={item.name || "Reward item"} /> : <Gift size={38} aria-hidden="true" />}
                      <span className={`spectator-badge ${isOutOfStock ? "spectator-badge--red" : "spectator-badge--green"}`}>
                        {isOutOfStock ? "Out" : `${stock} left`}
                      </span>
                    </div>
                    <div className="reward-card__body">
                      <div>
                        <h3>{item.name || "Reward item"}</h3>
                        <p>{item.description || "Redeem with TOKEN and wait for operations fulfillment."}</p>
                      </div>
                      <div className="reward-card__meta">
                        <span>Token price</span>
                        <strong>{formatTokenAmount(price)}</strong>
                      </div>
                      <button
                        className="spectator-button spectator-button--primary"
                        disabled={actionDisabled}
                        type="button"
                        onClick={() => requestRedeem(item)}
                      >
                        {isRedeeming ? "Redeeming..." : isOutOfStock ? "Out of stock" : isUnaffordable ? "Need more TOKEN" : "Redeem reward"}
                        {!actionDisabled && <ArrowRight size={16} aria-hidden="true" />}
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </article>

        <aside className="spectator-card rewards-history-card">
          <div className="spectator-card__header">
            <div>
              <p className="spectator-eyebrow">Ledger</p>
              <h2>My redemptions</h2>
            </div>
            <span className="spectator-badge">{historyState.meta?.total ?? historyState.redemptions.length} Total</span>
          </div>

          <div className="rewards-history-list">
            {historyState.isLoading && <LoadingSkeleton ariaLabel="Loading redemptions" rows={5} variant="list" />}
            {!historyState.isLoading && historyState.error && (
              <div className="rewards-history-row">
                <span>Error</span>
                <strong>Unable to load ledger</strong>
                <small>{historyState.error}</small>
                <b>--</b>
              </div>
            )}
            {!historyState.isLoading && !historyState.error && !historyState.redemptions.length && (
              <div className="rewards-history-row">
                <span>Empty</span>
                <strong>No redemptions yet</strong>
                <small>Your redeemed reward requests will appear here.</small>
                <b>0 TOKEN</b>
              </div>
            )}
            {!historyState.isLoading && !historyState.error && historyState.redemptions.map((redemption) => {
              const item = getRedemptionItem(redemption);
              return (
                <div className="rewards-history-row" key={redemption._id || `${redemption.item_id}-${redemption.created_at}`}>
                  <span>{formatTransactionDate(redemption.created_at)}</span>
                  <strong>{item?.name || "Reward redemption"}</strong>
                  <small>{item?.description || redemption.transaction_id || "Fulfilment request created"}</small>
                  <b>{formatTokenAmount(redemption.token_spent)}</b>
                  <em className={`spectator-badge ${statusClass(redemption.status)}`}>{redemption.status || "pending"}</em>
                </div>
              );
            })}
          </div>
        </aside>
      </div>

      {confirmReward && (
        <div className="rewards-confirm-toast" role="dialog" aria-modal="false" aria-labelledby="reward-confirm-title">
          <button className="rewards-confirm-toast__close" type="button" onClick={() => setConfirmReward(null)} aria-label="Cancel reward redemption">
            <X size={16} aria-hidden="true" />
          </button>
          <div className="rewards-confirm-toast__icon" aria-hidden="true">
            <Gift size={18} />
          </div>
          <div className="rewards-confirm-toast__copy">
            <h3 id="reward-confirm-title">Confirm reward redemption</h3>
            <p>
              Redeem <strong>{confirmReward.name || "this reward"}</strong> for{" "}
              <strong>{formatTokenAmount(confirmReward.token_price)}</strong>. Your request will start as pending.
            </p>
          </div>
          <div className="rewards-confirm-toast__actions">
            <button className="spectator-button" type="button" onClick={() => setConfirmReward(null)}>Cancel</button>
            <button className="spectator-button spectator-button--primary" type="button" onClick={() => handleRedeem(confirmReward)}>
              Confirm redeem
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
