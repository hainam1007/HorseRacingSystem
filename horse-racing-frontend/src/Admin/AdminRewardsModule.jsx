import { useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  Gift,
  Image as ImageIcon,
  PackageCheck,
  Plus,
  RefreshCw,
  Save,
  Search,
  ShoppingBag,
  SlidersHorizontal,
  Upload,
  WalletCards,
} from "lucide-react";
import { adminApi } from "../api/adminApi";
import LoadingSkeleton from "../components/LoadingSkeleton";
import { readFileAsDataUri } from "../utils/fileData";
import AdminLayout from "./AdminLayout";

const emptyDraft = {
  name: "",
  description: "",
  token_price: 100,
  stock: 10,
  is_active: true,
  image_file_data: "",
  image_preview: "",
  image_file_name: "",
};

const rewardFiltersInitial = {
  page: 1,
  limit: 20,
  search: "",
  status: "",
  sort: "created_at",
  order: "desc",
};

const redemptionFiltersInitial = {
  page: 1,
  limit: 10,
  status: "",
};

function formatToken(value) {
  return `${new Intl.NumberFormat("en-US").format(Number(value || 0))} TOKEN`;
}

function formatDateTime(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function getId(value) {
  if (!value) return "";
  if (typeof value === "string") return value;
  return value._id || value.id || "";
}

function getUserLabel(value) {
  if (!value) return "Unknown user";
  if (typeof value === "string") return value;
  return value.full_name || value.username || value.email || getId(value) || "Unknown user";
}

function getRewardLabel(value) {
  if (!value) return "Reward item";
  if (typeof value === "string") return value;
  return value.name || getId(value) || "Reward item";
}

function getMeta(payload, fallback = {}) {
  return payload?.meta || fallback;
}

function toneForStatus(status) {
  const value = String(status || "").toLowerCase();
  if (["active", "completed"].includes(value)) return "green";
  if (["pending", "processing"].includes(value)) return "amber";
  if (["inactive", "cancelled"].includes(value)) return "red";
  return "gray";
}

function StatusBadge({ value }) {
  return <span className={`admin-status-badge admin-status-badge--${toneForStatus(value)}`}>{value}</span>;
}

function toDraft(item) {
  if (!item) return emptyDraft;
  return {
    name: item.name || "",
    description: item.description || "",
    token_price: Number(item.token_price || 1),
    stock: Number(item.stock || 0),
    is_active: Boolean(item.is_active),
    image_file_data: "",
    image_preview: item.image_url || "",
    image_file_name: "",
  };
}

function nextRedemptionStatuses(status) {
  const value = String(status || "").toLowerCase();
  if (value === "pending") return ["processing", "cancelled"];
  if (value === "processing") return ["completed", "cancelled"];
  return [];
}

export default function AdminRewardsModule() {
  const [rewards, setRewards] = useState([]);
  const [rewardMeta, setRewardMeta] = useState({ total: 0, page: 1, limit: 20, total_pages: 1 });
  const [statistics, setStatistics] = useState({});
  const [redemptions, setRedemptions] = useState([]);
  const [redemptionMeta, setRedemptionMeta] = useState({ total: 0, page: 1, limit: 10, total_pages: 1 });
  const [rewardFilters, setRewardFilters] = useState(rewardFiltersInitial);
  const [redemptionFilters, setRedemptionFilters] = useState(redemptionFiltersInitial);
  const [draft, setDraft] = useState(emptyDraft);
  const [selectedId, setSelectedId] = useState("");
  const [isCreating, setIsCreating] = useState(true);
  const [stockDraft, setStockDraft] = useState({ operation: "increase", value: 1 });
  const [isLoading, setIsLoading] = useState(true);
  const [isRedemptionsLoading, setIsRedemptionsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [actionId, setActionId] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [redemptionError, setRedemptionError] = useState("");

  const selectedReward = useMemo(() => rewards.find((item) => getId(item) === selectedId) || null, [rewards, selectedId]);
  const activeRewards = rewards.filter((item) => item.is_active).length;
  const outOfStockRewards = rewards.filter((item) => Number(item.stock || 0) <= 0).length;

  async function loadRewards(nextFilters = rewardFilters) {
    setIsLoading(true);
    setError("");

    try {
      const [statsPayload, rewardsPayload] = await Promise.all([
        adminApi.getRewardStatistics(),
        adminApi.listRewards(nextFilters),
      ]);

      const nextRewards = rewardsPayload?.items || [];
      setStatistics(statsPayload?.statistics || {});
      setRewards(nextRewards);
      setRewardMeta(getMeta(rewardsPayload, { total: nextRewards.length, page: nextFilters.page, limit: nextFilters.limit, total_pages: 1 }));

      if (!isCreating && selectedId) {
        const nextSelected = nextRewards.find((item) => getId(item) === selectedId);
        if (nextSelected) setDraft(toDraft(nextSelected));
      }
    } catch (apiError) {
      setError(apiError.message || "Unable to load reward catalog.");
    } finally {
      setIsLoading(false);
    }
  }

  async function loadRedemptions(nextFilters = redemptionFilters) {
    setIsRedemptionsLoading(true);
    setRedemptionError("");

    try {
      const payload = await adminApi.listRewardRedemptions(nextFilters);
      const nextRedemptions = payload?.redemptions || [];
      setRedemptions(nextRedemptions);
      setRedemptionMeta(getMeta(payload, { total: nextRedemptions.length, page: nextFilters.page, limit: nextFilters.limit, total_pages: 1 }));
    } catch (apiError) {
      setRedemptionError(apiError.message || "Unable to load redemption requests.");
    } finally {
      setIsRedemptionsLoading(false);
    }
  }

  useEffect(() => {
    loadRewards(rewardFiltersInitial);
    loadRedemptions(redemptionFiltersInitial);
  }, []);

  useEffect(() => {
    if (!notice) return undefined;
    const timer = window.setTimeout(() => setNotice(""), 4200);
    return () => window.clearTimeout(timer);
  }, [notice]);

  function updateDraft(field, value) {
    setDraft((current) => ({ ...current, [field]: value }));
    setError("");
    setNotice("");
  }

  async function updateRewardImage(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    setError("");
    setNotice("");

    try {
      const imageData = await readFileAsDataUri(file);
      setDraft((current) => ({
        ...current,
        image_file_data: imageData,
        image_preview: imageData,
        image_file_name: file.name,
      }));
    } catch (fileError) {
      setError(fileError.message || "Unable to read selected reward image.");
    }
  }

  function clearRewardImage() {
    setDraft((current) => ({
      ...current,
      image_file_data: "",
      image_preview: selectedReward?.image_url || "",
      image_file_name: "",
    }));
    setError("");
    setNotice("");
  }

  function startCreate() {
    setIsCreating(true);
    setSelectedId("");
    setDraft(emptyDraft);
    setStockDraft({ operation: "increase", value: 1 });
    setError("");
    setNotice("");
  }

  function startEdit(item) {
    setIsCreating(false);
    setSelectedId(getId(item));
    setDraft(toDraft(item));
    setStockDraft({ operation: "increase", value: 1 });
    setError("");
    setNotice("");
  }

  async function saveReward(event) {
    event.preventDefault();
    setIsSaving(true);
    setError("");
    setNotice("");

    const payload = {
      name: draft.name.trim(),
      description: draft.description.trim(),
      token_price: Number(draft.token_price),
    };

    if (draft.image_file_data) {
      payload.image_file_data = draft.image_file_data;
    }

    if (isCreating) {
      payload.stock = Number(draft.stock);
      payload.is_active = Boolean(draft.is_active);
    }

    try {
      const response = isCreating
        ? await adminApi.createReward(payload)
        : await adminApi.updateReward(selectedId, payload);
      const saved = response?.item;
      setNotice(isCreating ? "Reward item created." : "Reward item updated.");
      await loadRewards();
      if (saved) {
        setIsCreating(false);
        setSelectedId(getId(saved));
        setDraft(toDraft(saved));
      }
    } catch (apiError) {
      setError(apiError.message || "Unable to save reward item.");
    } finally {
      setIsSaving(false);
    }
  }

  async function submitStock(event) {
    event.preventDefault();
    if (!selectedId) return;

    setIsSaving(true);
    setError("");
    setNotice("");

    try {
      const response = await adminApi.updateRewardStock(selectedId, {
        operation: stockDraft.operation,
        value: Number(stockDraft.value),
      });
      setNotice("Stock updated.");
      await loadRewards();
      if (response?.item) setDraft(toDraft(response.item));
    } catch (apiError) {
      setError(apiError.message || "Unable to update stock.");
    } finally {
      setIsSaving(false);
    }
  }

  async function toggleStatus(item) {
    const id = getId(item);
    setActionId(`status:${id}`);
    setError("");
    setNotice("");

    try {
      await adminApi.updateRewardStatus(id, !item.is_active);
      setNotice(item.is_active ? "Reward item disabled." : "Reward item enabled.");
      await loadRewards();
    } catch (apiError) {
      setError(apiError.message || "Unable to update reward status.");
    } finally {
      setActionId("");
    }
  }

  async function applyRewardFilters(event) {
    event.preventDefault();
    const nextFilters = { ...rewardFilters, page: 1 };
    setRewardFilters(nextFilters);
    await loadRewards(nextFilters);
  }

  async function changeRewardPage(nextPage) {
    const nextFilters = { ...rewardFilters, page: nextPage };
    setRewardFilters(nextFilters);
    await loadRewards(nextFilters);
  }

  async function applyRedemptionFilters(event) {
    event.preventDefault();
    const nextFilters = { ...redemptionFilters, page: 1 };
    setRedemptionFilters(nextFilters);
    await loadRedemptions(nextFilters);
  }

  async function changeRedemptionPage(nextPage) {
    const nextFilters = { ...redemptionFilters, page: nextPage };
    setRedemptionFilters(nextFilters);
    await loadRedemptions(nextFilters);
  }

  async function updateRedemptionStatus(redemption, status) {
    const id = getId(redemption);
    setActionId(`redemption:${id}:${status}`);
    setRedemptionError("");
    setNotice("");

    try {
      await adminApi.updateRewardRedemptionStatus(id, status);
      setNotice(`Redemption moved to ${status}.`);
      await Promise.all([loadRedemptions(), loadRewards()]);
    } catch (apiError) {
      setRedemptionError(apiError.message || "Unable to update redemption status.");
    } finally {
      setActionId("");
    }
  }

  const rewardTotalPages = Math.max(1, Number(rewardMeta.total_pages || 1));
  const redemptionTotalPages = Math.max(1, Number(redemptionMeta.total_pages || 1));

  return (
    <AdminLayout
      title="Prize rewards"
      eyebrow="Reward exchange"
      description="Create token-priced prize items, control stock, and process reward redemption requests."
      actions={(
        <>
          <button className="admin-header__button admin-header__button--ghost" disabled={isLoading || isRedemptionsLoading} type="button" onClick={() => { loadRewards(); loadRedemptions(); }}>
            <RefreshCw size={16} className={isLoading || isRedemptionsLoading ? "admin-competition__spin" : ""} aria-hidden="true" /> Refresh
          </button>
          <button className="admin-header__button" type="button" onClick={startCreate}>
            <Plus size={16} aria-hidden="true" /> New prize
          </button>
        </>
      )}
    >
      <section className="admin-command-metrics admin-rewards-metrics" aria-label="Prize reward summary">
        <article><Gift size={18} aria-hidden="true" /><div><strong>{statistics.total_rewards ?? rewardMeta.total ?? rewards.length}</strong><small>Total prize items</small></div></article>
        <article><PackageCheck size={18} aria-hidden="true" /><div><strong>{activeRewards}</strong><small>Active on catalog</small></div></article>
        <article><ShoppingBag size={18} aria-hidden="true" /><div><strong>{statistics.out_of_stock_rewards ?? outOfStockRewards}</strong><small>Out of stock</small></div></article>
        <article><WalletCards size={18} aria-hidden="true" /><div><strong>{statistics.pending_redemption ?? 0}</strong><small>Pending requests</small></div></article>
      </section>

      {notice && <section className="admin-live-state admin-command-notice" aria-live="polite"><CheckCircle2 size={17} aria-hidden="true" />{notice}</section>}
      {error && <section className="admin-live-state admin-live-state--warning" aria-live="assertive">{error}</section>}

      <section className="admin-rewards-workspace">
        <article className="admin-command-ledger">
          <header>
            <div><Gift size={18} aria-hidden="true" /><span><strong>Prize catalog</strong><small>{rewardMeta.total || rewards.length} records</small></span></div>
            <span>Token price and stock controls</span>
          </header>

          <form className="admin-rewards-toolbar" onSubmit={applyRewardFilters}>
            <label><Search size={16} aria-hidden="true" /><span className="sr-only">Search prize items</span><input value={rewardFilters.search} onChange={(event) => setRewardFilters((current) => ({ ...current, search: event.target.value }))} placeholder="Search prize name..." /></label>
            <select value={rewardFilters.status} onChange={(event) => setRewardFilters((current) => ({ ...current, status: event.target.value }))}>
              <option value="">All statuses</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
            <select value={rewardFilters.sort} onChange={(event) => setRewardFilters((current) => ({ ...current, sort: event.target.value }))}>
              <option value="created_at">Newest</option>
              <option value="token_price">Token price</option>
              <option value="stock">Stock</option>
              <option value="name">Name</option>
            </select>
            <button className="admin-header__button admin-header__button--ghost" disabled={isLoading} type="submit">
              <SlidersHorizontal size={15} aria-hidden="true" /> Apply
            </button>
          </form>

          {isLoading ? (
            <LoadingSkeleton ariaLabel="Loading prize rewards" rows={7} variant="table" />
          ) : (
            <div className="admin-data-table__wrap" role="region" aria-label="Prize reward table" tabIndex="0">
              <table className="admin-data-table">
                <thead>
                  <tr><th>Prize</th><th>Token price</th><th>Stock</th><th>Status</th><th>Updated</th><th>Action</th></tr>
                </thead>
                <tbody>
                  {!rewards.length && <tr><td colSpan="6">No prize items match the current filters.</td></tr>}
                  {rewards.map((item) => {
                    const id = getId(item);
                    return (
                      <tr className={selectedId === id ? "admin-command-row--selected" : ""} key={id || item.name}>
                        <td>
                          <div className="admin-rewards-prize-cell">
                            <span className="admin-rewards-thumb" aria-hidden="true">
                              {item.image_url ? <img src={item.image_url} alt="" /> : <Gift size={18} />}
                            </span>
                            <span>
                              <strong>{item.name}</strong>
                              <span className="admin-rewards-subline">{item.description || "No description"}</span>
                            </span>
                          </div>
                        </td>
                        <td>{formatToken(item.token_price)}</td>
                        <td>{Number(item.stock || 0)}</td>
                        <td><StatusBadge value={item.is_active ? "active" : "inactive"} /></td>
                        <td>{formatDateTime(item.updated_at || item.created_at)}</td>
                        <td>
                          <div className="admin-rewards-row-actions">
                            <button className="admin-command-review" type="button" onClick={() => startEdit(item)}>Edit</button>
                            <button className="admin-command-review" disabled={actionId === `status:${id}`} type="button" onClick={() => toggleStatus(item)}>
                              {item.is_active ? "Disable" : "Enable"}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          <footer className="admin-command-pagination">
            <span>Page {rewardMeta.page || rewardFilters.page} of {rewardTotalPages} / {rewardMeta.total || 0} records</span>
            <div>
              <button disabled={isLoading || Number(rewardMeta.page || 1) <= 1} type="button" onClick={() => changeRewardPage(Math.max(1, Number(rewardMeta.page || 1) - 1))}>Previous</button>
              <button disabled={isLoading || Number(rewardMeta.page || 1) >= rewardTotalPages} type="button" onClick={() => changeRewardPage(Number(rewardMeta.page || 1) + 1)}>Next</button>
            </div>
          </footer>
        </article>

        <aside className="admin-panel admin-rewards-editor">
          <div className="admin-panel__header">
            <div>
              <p className="admin-panel__eyebrow">{isCreating ? "Create" : "Edit"}</p>
              <h2>{isCreating ? "New prize item" : selectedReward?.name || "Prize item"}</h2>
            </div>
            {!isCreating && selectedReward && <StatusBadge value={selectedReward.is_active ? "active" : "inactive"} />}
          </div>

          <form className="admin-form-grid" onSubmit={saveReward}>
            <label className="admin-field">
              <span>Prize name</span>
              <input value={draft.name} onChange={(event) => updateDraft("name", event.target.value)} placeholder="VIP paddock voucher" />
            </label>

            <label className="admin-field">
              <span>Description</span>
              <textarea value={draft.description} onChange={(event) => updateDraft("description", event.target.value)} placeholder="Short fulfillment note shown to spectators." />
            </label>

            <div className="admin-field admin-rewards-image-field">
              <span>Prize image</span>
              <div className="admin-rewards-image-picker">
                <div className="admin-rewards-image-preview">
                  {draft.image_preview ? <img src={draft.image_preview} alt={draft.name || "Prize preview"} /> : <ImageIcon size={30} aria-hidden="true" />}
                </div>
                <div>
                  <label className="admin-header__button admin-header__button--ghost admin-rewards-upload-button">
                    <Upload size={15} aria-hidden="true" />
                    Upload image
                    <input accept="image/*" type="file" onChange={updateRewardImage} />
                  </label>
                  <small>{draft.image_file_name || (draft.image_preview ? "Current catalog image" : "PNG, JPG, or WEBP image.")}</small>
                  {draft.image_file_data && (
                    <button className="admin-command-review" type="button" onClick={clearRewardImage}>
                      Reset selection
                    </button>
                  )}
                </div>
              </div>
            </div>

            <div className="admin-rewards-editor__split">
              <label className="admin-field">
                <span>Token price</span>
                <input min="1" type="number" value={draft.token_price} onChange={(event) => updateDraft("token_price", event.target.value)} />
              </label>
              <label className="admin-field">
                <span>Opening stock</span>
                <input disabled={!isCreating} min="0" type="number" value={draft.stock} onChange={(event) => updateDraft("stock", event.target.value)} />
              </label>
            </div>

            {isCreating && (
              <label className="admin-deposit-switch">
                <input checked={draft.is_active} type="checkbox" onChange={(event) => updateDraft("is_active", event.target.checked)} />
                <span>Visible to spectators</span>
              </label>
            )}

            <div className="admin-deposit-preview">
              <span>Catalog price</span>
              <strong>{formatToken(draft.token_price)}</strong>
              <small>{Number(draft.stock || 0)} item(s) available after save</small>
            </div>

            <div className="admin-deposit-actions">
              <button className="admin-header__button" disabled={isSaving} type="submit">
                <Save size={15} aria-hidden="true" /> {isSaving ? "Saving..." : "Save prize"}
              </button>
            </div>
          </form>

          {!isCreating && selectedReward && (
            <form className="admin-rewards-stock" onSubmit={submitStock}>
              <div>
                <p className="admin-panel__eyebrow">Inventory</p>
                <strong>{Number(selectedReward.stock || 0)} in stock</strong>
              </div>
              <label className="admin-field">
                <span>Operation</span>
                <select value={stockDraft.operation} onChange={(event) => setStockDraft((current) => ({ ...current, operation: event.target.value }))}>
                  <option value="increase">Increase</option>
                  <option value="decrease">Decrease</option>
                  <option value="set">Set exact</option>
                </select>
              </label>
              <label className="admin-field">
                <span>Value</span>
                <input min="0" type="number" value={stockDraft.value} onChange={(event) => setStockDraft((current) => ({ ...current, value: event.target.value }))} />
              </label>
              <button className="admin-header__button admin-header__button--ghost" disabled={isSaving} type="submit">
                <PackageCheck size={15} aria-hidden="true" /> Update stock
              </button>
            </form>
          )}
        </aside>
      </section>

      <section className="admin-command-ledger" aria-labelledby="reward-redemptions-title">
        <header>
          <div><WalletCards size={18} aria-hidden="true" /><span><strong id="reward-redemptions-title">Redemption requests</strong><small>{redemptionMeta.total || 0} records</small></span></div>
          <span>{statistics.processing_redemption || 0} processing / {statistics.completed_redemption || 0} completed / {statistics.cancelled_redemption || 0} cancelled</span>
        </header>

        <form className="admin-rewards-toolbar admin-rewards-toolbar--compact" onSubmit={applyRedemptionFilters}>
          <select value={redemptionFilters.status} onChange={(event) => setRedemptionFilters((current) => ({ ...current, status: event.target.value }))}>
            <option value="">All statuses</option>
            <option value="pending">Pending</option>
            <option value="processing">Processing</option>
            <option value="completed">Completed</option>
            <option value="cancelled">Cancelled</option>
          </select>
          <button className="admin-header__button admin-header__button--ghost" disabled={isRedemptionsLoading} type="submit">
            <SlidersHorizontal size={15} aria-hidden="true" /> Apply
          </button>
        </form>

        {redemptionError && <section className="admin-live-state admin-live-state--warning" aria-live="assertive">{redemptionError}</section>}

        <div className="admin-data-table__wrap" role="region" aria-label="Reward redemption table" tabIndex="0">
          <table className="admin-data-table">
            <thead>
              <tr><th>User</th><th>Prize</th><th>Token spent</th><th>Status</th><th>Requested</th><th>Next step</th></tr>
            </thead>
            <tbody>
              {isRedemptionsLoading && <tr><td colSpan="6">Loading redemption requests...</td></tr>}
              {!isRedemptionsLoading && !redemptionError && !redemptions.length && <tr><td colSpan="6">No redemption requests match the current filters.</td></tr>}
              {!isRedemptionsLoading && !redemptionError && redemptions.map((redemption) => {
                const id = getId(redemption);
                const status = String(redemption.status || "pending").toLowerCase();
                const actions = nextRedemptionStatuses(status);
                return (
                  <tr key={id || `${redemption.user_id}-${redemption.created_at}`}>
                    <td><strong>{getUserLabel(redemption.user_id)}</strong><span className="admin-rewards-subline">{typeof redemption.user_id === "object" ? redemption.user_id?.email : ""}</span></td>
                    <td>{getRewardLabel(redemption.item_id)}<span className="admin-rewards-subline">{getId(redemption.item_id)}</span></td>
                    <td>{formatToken(redemption.token_spent)}</td>
                    <td><StatusBadge value={status} /></td>
                    <td>{formatDateTime(redemption.created_at)}</td>
                    <td>
                      <div className="admin-rewards-row-actions">
                        {actions.length ? actions.map((nextStatus) => (
                          <button
                            className={`admin-command-review ${nextStatus === "cancelled" ? "admin-rewards-row-actions__danger" : ""}`}
                            disabled={actionId === `redemption:${id}:${nextStatus}`}
                            key={nextStatus}
                            type="button"
                            onClick={() => updateRedemptionStatus(redemption, nextStatus)}
                          >
                            {nextStatus}
                          </button>
                        )) : <span className="admin-rewards-terminal">Complete</span>}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <footer className="admin-command-pagination">
          <span>Page {redemptionMeta.page || redemptionFilters.page} of {redemptionTotalPages} / {redemptionMeta.total || 0} records</span>
          <div>
            <button disabled={isRedemptionsLoading || Number(redemptionMeta.page || 1) <= 1} type="button" onClick={() => changeRedemptionPage(Math.max(1, Number(redemptionMeta.page || 1) - 1))}>Previous</button>
            <button disabled={isRedemptionsLoading || Number(redemptionMeta.page || 1) >= redemptionTotalPages} type="button" onClick={() => changeRedemptionPage(Number(redemptionMeta.page || 1) + 1)}>Next</button>
          </div>
        </footer>
      </section>
    </AdminLayout>
  );
}
