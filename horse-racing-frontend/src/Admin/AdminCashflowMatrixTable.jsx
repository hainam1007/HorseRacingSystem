import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { adminApi } from "../api/adminApi";
import {
  Activity,
  Award,
  Calendar,
  CheckCircle2,
  ChevronRight,
  CircleDollarSign,
  Clock,
  CreditCard,
  Crown,
  Eye,
  Filter,
  Layers,
  Percent,
  Search,
  Sparkles,
  TrendingUp,
  Trophy,
  User,
  Users,
  Wallet,
  X,
  Zap
} from "lucide-react";

const formatNumber = (val) => new Intl.NumberFormat("en-US").format(Number(val || 0));
const formatVND = (val) =>
  new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND", maximumFractionDigits: 0 }).format(
    Number(val || 0)
  );
const formatToken = (val) => `${formatNumber(val)} tokens`;
const formatDateTime = (val) => {
  if (!val) return "—";
  const d = new Date(val);
  return `${d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false })} · ${d.toLocaleDateString("en-US", { day: "2-digit", month: "short", year: "numeric" })}`;
};

const PAYMENT_METHODS = [
  { id: "all", label: "All Gateways" },
  { id: "VNPAY", label: "VNPAY QR/Card" },
  { id: "MOMO", label: "MoMo Wallet" },
  { id: "MOCK", label: "Mock Sandbox" }
];

export default function AdminCashflowMatrixTable({ cashflowMatrix, isLoading, onPaymentMethodChange }) {
  const [activeTab, setActiveTab] = useState("packages"); // 'packages' | 'depositors'
  const [activePaymentMethod, setActivePaymentMethod] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState("popularity"); // 'popularity' | 'revenue' | 'name'
  const [internalData, setInternalData] = useState(null);

  // Modals
  const [selectedPackage, setSelectedPackage] = useState(null); // When set, opens Package Drilldown Modal
  const [selectedDepositor, setSelectedDepositor] = useState(null); // When set, opens Customer Deposit History Modal
  const [modalSearch, setModalSearch] = useState("");

  useEffect(() => {
    if (!cashflowMatrix) {
      adminApi
        .getCashflowMatrix({ payment_method: activePaymentMethod !== "all" ? activePaymentMethod : undefined })
        .then((res) => {
          if (res) setInternalData(res);
        })
        .catch(() => {});
    }
  }, [cashflowMatrix, activePaymentMethod]);

  const effectiveData = cashflowMatrix || internalData;

  const packages = useMemo(() => effectiveData?.packages || [], [effectiveData]);
  const topDepositors = useMemo(() => effectiveData?.top_depositors || [], [effectiveData]);
  const totals = useMemo(() => effectiveData?.totals || {}, [effectiveData]);
  const kpiSummary = useMemo(() => effectiveData?.kpi_summary || {}, [effectiveData]);
  const allTransactions = useMemo(() => effectiveData?.all_recent_transactions || [], [effectiveData]);

  const handlePaymentMethodClick = (pmId) => {
    setActivePaymentMethod(pmId);
    if (onPaymentMethodChange) {
      onPaymentMethodChange(pmId);
    }
  };

  // Filtered and sorted Packages
  const filteredPackages = useMemo(() => {
    return packages
      .filter((pkg) => {
        if (!searchQuery.trim()) return true;
        const q = searchQuery.toLowerCase();
        const matchesLabel = pkg.label?.toLowerCase().includes(q);
        const matchesPrice = String(pkg.vnd_price).includes(q);
        const matchesBadge = pkg.commercial_badge?.toLowerCase().includes(q);
        return matchesLabel || matchesPrice || matchesBadge;
      })
      .sort((a, b) => {
        if (sortBy === "popularity") return (b.metrics?.success_count || 0) - (a.metrics?.success_count || 0);
        if (sortBy === "revenue") return (b.metrics?.total_vnd || 0) - (a.metrics?.total_vnd || 0);
        if (sortBy === "name") return (a.label || "").localeCompare(b.label || "");
        return 0;
      });
  }, [packages, searchQuery, sortBy]);

  // Filtered and sorted Depositors
  const filteredDepositors = useMemo(() => {
    return topDepositors
      .filter((dep) => {
        if (!searchQuery.trim()) return true;
        const q = searchQuery.toLowerCase();
        const matchesName = dep.user_name?.toLowerCase().includes(q);
        const matchesEmail = dep.user_email?.toLowerCase().includes(q);
        const matchesFav = dep.favorite_package_label?.toLowerCase().includes(q);
        return matchesName || matchesEmail || matchesFav;
      })
      .sort((a, b) => {
        if (sortBy === "popularity") return (b.success_orders || 0) - (a.success_orders || 0);
        if (sortBy === "revenue") return (b.total_spent_vnd || 0) - (a.total_spent_vnd || 0);
        if (sortBy === "name") return (a.user_name || "").localeCompare(b.user_name || "");
        return 0;
      });
  }, [topDepositors, searchQuery, sortBy]);

  // Filtered transactions for Package detail modal
  const packageModalTransactions = useMemo(() => {
    if (!selectedPackage) return [];
    const list = selectedPackage.recent_transactions || [];
    if (!modalSearch.trim()) return list;
    const q = modalSearch.toLowerCase();
    return list.filter(
      (tx) =>
        (tx.order_id && tx.order_id.toLowerCase().includes(q)) ||
        (tx.user_name && tx.user_name.toLowerCase().includes(q)) ||
        (tx.user_email && tx.user_email.toLowerCase().includes(q)) ||
        (tx.payment_method && tx.payment_method.toLowerCase().includes(q))
    );
  }, [selectedPackage, modalSearch]);

  // Filtered transactions for Customer detail modal
  const customerModalTransactions = useMemo(() => {
    if (!selectedDepositor) return [];
    const list = selectedDepositor.orders_history || [];
    if (!modalSearch.trim()) return list;
    const q = modalSearch.toLowerCase();
    return list.filter(
      (tx) =>
        (tx.order_id && tx.order_id.toLowerCase().includes(q)) ||
        (tx.package_id && tx.package_id.toLowerCase().includes(q)) ||
        (tx.payment_method && tx.payment_method.toLowerCase().includes(q))
    );
  }, [selectedDepositor, modalSearch]);

  return (
    <article className="admin-cashflow-matrix-container">
      {/* HEADER WITH TITLE & CONTROLS */}
      <header className="admin-role-matrix-header">
        <div className="admin-role-matrix-title-group">
          <div className="admin-role-matrix-eyebrow">
            <CreditCard size={14} className="admin-icon-accent" />
            <span>Commercial & Purchasing Intelligence</span>
          </div>
          <h2>Deposit Packages & Customer Purchasing Breakdown</h2>
          <p>
            Track package sales popularity, gross revenue contribution share, and individual customer deposit frequency
            & favorite purchasing habits.
          </p>
        </div>

        <div className="admin-role-matrix-actions">
          {/* Search Box */}
          <div className="admin-matrix-search">
            <Search size={15} />
            <input
              type="text"
              placeholder={
                activeTab === "packages"
                  ? "Search by package tier or price..."
                  : "Search customer name, email, favorite..."
              }
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              aria-label="Filter packages and depositors"
            />
            {searchQuery && (
              <button
                type="button"
                className="admin-matrix-search__clear"
                onClick={() => setSearchQuery("")}
                aria-label="Clear search"
              >
                <X size={13} />
              </button>
            )}
          </div>

          {/* Sort Selector */}
          <select
            className="admin-filter-select"
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            aria-label="Sort by"
          >
            <option value="popularity">Sort by Most Orders (Popularity)</option>
            <option value="revenue">Sort by Highest Revenue</option>
            <option value="name">Sort by Name (A-Z)</option>
          </select>

          {/* All Transactions Drill-down button */}
          <button
            type="button"
            className="admin-filter-btn admin-filter-btn--drilldown"
            onClick={() => {
              setSelectedPackage({
                label: "All Packages (Consolidated)",
                package_id: "all",
                vnd_price: totals.aov_vnd || 0,
                metrics: totals,
                recent_transactions: allTransactions,
                top_buyers: topDepositors.slice(0, 5)
              });
              setModalSearch("");
            }}
          >
            <Zap size={15} />
            <span>All Orders ({allTransactions.length})</span>
          </button>
        </div>
      </header>

      {/* TOP EXECUTIVE KPI HIGHLIGHTS BAR */}
      <section className="admin-commercial-kpi-bar" aria-label="Commercial Highlights">
        <div className="admin-commercial-kpi-card">
          <div className="admin-commercial-kpi-icon admin-commercial-kpi-icon--gold">
            <Trophy size={18} />
          </div>
          <div>
            <span className="admin-commercial-kpi-label">Most Popular Package</span>
            <strong className="admin-commercial-kpi-val">{kpiSummary.best_seller_label || "50,000 VND Booster"}</strong>
            <small className="admin-commercial-kpi-sub">
              {kpiSummary.best_seller_count || 0} orders ({kpiSummary.best_seller_share || 0}% of all sales)
            </small>
          </div>
        </div>

        <div className="admin-commercial-kpi-card">
          <div className="admin-commercial-kpi-icon admin-commercial-kpi-icon--emerald">
            <CircleDollarSign size={18} />
          </div>
          <div>
            <span className="admin-commercial-kpi-label">Top Revenue Driver</span>
            <strong className="admin-commercial-kpi-val">{kpiSummary.top_revenue_label || "500,000 VND VIP Pro"}</strong>
            <small className="admin-commercial-kpi-sub">
              {formatVND(kpiSummary.top_revenue_vnd)} ({kpiSummary.top_revenue_share || 0}% of gross inflow)
            </small>
          </div>
        </div>

        <div className="admin-commercial-kpi-card">
          <div className="admin-commercial-kpi-icon admin-commercial-kpi-icon--blue">
            <Users size={18} />
          </div>
          <div>
            <span className="admin-commercial-kpi-label">Active Depositors</span>
            <strong className="admin-commercial-kpi-val">{topDepositors.length} Customers</strong>
            <small className="admin-commercial-kpi-sub">
              Avg {kpiSummary.avg_orders_per_user || "1.0"} purchases per customer
            </small>
          </div>
        </div>

        <div className="admin-commercial-kpi-card">
          <div className="admin-commercial-kpi-icon admin-commercial-kpi-icon--purple">
            <Percent size={18} />
          </div>
          <div>
            <span className="admin-commercial-kpi-label">Repeat Retention</span>
            <strong className="admin-commercial-kpi-val">{totals.repeat_rate || "0%"}</strong>
            <small className="admin-commercial-kpi-sub">Users funding account ≥2 times</small>
          </div>
        </div>
      </section>

      {/* FILTER BAR & TAB CONTROLS */}
      <div className="admin-cashflow-filters-bar">
        {/* Core Mode Tabs */}
        <nav className="admin-matrix-categories" aria-label="Commercial mode tabs">
          <button
            type="button"
            className={`admin-matrix-category-tab${activeTab === "packages" ? " is-active" : ""}`}
            onClick={() => {
              setActiveTab("packages");
              setSearchQuery("");
            }}
          >
            <Wallet size={15} />
            <span>By Package Tiers</span>
            <span className="admin-matrix-tab-count">{packages.length}</span>
          </button>

          <button
            type="button"
            className={`admin-matrix-category-tab${activeTab === "depositors" ? " is-active" : ""}`}
            onClick={() => {
              setActiveTab("depositors");
              setSearchQuery("");
            }}
          >
            <Users size={15} />
            <span>Customer Purchasing Habits & Top Depositors</span>
            <span className="admin-matrix-tab-count">{topDepositors.length}</span>
          </button>
        </nav>

        {/* Payment Method Filter Pills */}
        <div className="admin-payment-method-pills" aria-label="Gateway filter">
          <span className="admin-payment-pill-label">Gateway:</span>
          {PAYMENT_METHODS.map((pm) => (
            <button
              key={pm.id}
              type="button"
              className={`admin-payment-pill${activePaymentMethod === pm.id ? " is-active" : ""}`}
              onClick={() => handlePaymentMethodClick(pm.id)}
            >
              {pm.label}
            </button>
          ))}
        </div>
      </div>

      {/* MAIN DATA TABLE */}
      <div className="admin-matrix-table-wrapper">
        {/* ================= TAB 1: BY PACKAGE TIERS ================= */}
        {activeTab === "packages" && (
          <table className="admin-matrix-table admin-directory-table">
            <thead>
              <tr>
                <th>Package Tier & Pricing</th>
                <th>Sales Volume & Share</th>
                <th>Gross Revenue & Share</th>
                <th>Customer Segmentation</th>
                <th>Turnaround Velocity</th>
                <th>Preferred Gateway</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredPackages.length === 0 ? (
                <tr>
                  <td colSpan={7} className="admin-matrix-empty-row">
                    <div className="admin-matrix-empty-state">
                      <Filter size={24} />
                      <strong>No deposit packages found</strong>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredPackages.map((pkg) => {
                  const m = pkg.metrics || {};
                  return (
                    <tr
                      key={pkg.package_id}
                      className="admin-matrix-row admin-directory-row"
                      onClick={() => {
                        setSelectedPackage(pkg);
                        setModalSearch("");
                      }}
                    >
                      <td>
                        <div className="admin-profile-cell">
                          <div className="admin-horse-avatar-box">
                            <Wallet size={18} className="admin-icon-accent" />
                          </div>
                          <div>
                            <div className="admin-pkg-title-row">
                              <strong className="admin-profile-name">{pkg.label}</strong>
                              <span className="admin-commercial-rank-pill">{pkg.commercial_badge}</span>
                            </div>
                            <small className="admin-subtext">
                              {formatVND(pkg.vnd_price)} ➔ {formatNumber(pkg.token_received)} tokens
                              {pkg.bonus_token > 0 ? ` (+${pkg.bonus_token} bonus)` : ""}
                            </small>
                          </div>
                        </div>
                      </td>

                      {/* Sales Volume & Progress bar */}
                      <td>
                        <div className="admin-share-stack">
                          <div className="admin-share-numbers">
                            <strong>{formatNumber(m.success_count)} orders</strong>
                            <span className="admin-share-pct">{m.order_share_percent}%</span>
                          </div>
                          <div className="admin-progress-bar-bg">
                            <div
                              className="admin-progress-bar-fill admin-progress-bar-fill--blue"
                              style={{ width: `${Math.min(100, Math.max(8, m.order_share_percent || 0))}%` }}
                            />
                          </div>
                        </div>
                      </td>

                      {/* Gross Revenue & Progress bar */}
                      <td>
                        <div className="admin-share-stack">
                          <div className="admin-share-numbers">
                            <strong className="admin-prize-vnd">{formatVND(m.total_vnd)}</strong>
                            <span className="admin-share-pct admin-share-pct--green">{m.revenue_share_percent}%</span>
                          </div>
                          <div className="admin-progress-bar-bg">
                            <div
                              className="admin-progress-bar-fill admin-progress-bar-fill--emerald"
                              style={{ width: `${Math.min(100, Math.max(8, m.revenue_share_percent || 0))}%` }}
                            />
                          </div>
                        </div>
                      </td>

                      {/* Customer Segmentation */}
                      <td>
                        <div className="admin-segmentation-cell">
                          <span>
                            <strong>{m.unique_depositors}</strong> unique buyers
                          </span>
                          <small className="admin-subtext">
                            {m.ftd_count} First-time ({m.repeat_rate} repeat rate)
                          </small>
                        </div>
                      </td>

                      {/* Turnaround Velocity */}
                      <td>
                        <span className="admin-velocity-pill">
                          <Clock size={12} />
                          {m.token_velocity || "Fast (< 15m)"}
                        </span>
                      </td>

                      {/* Preferred Gateway */}
                      <td>
                        <span className="admin-dim-text">{m.preferred_gateway || "VNPAY · MoMo"}</span>
                      </td>

                      {/* Action */}
                      <td>
                        <button
                          type="button"
                          className="admin-table-action-btn"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedPackage(pkg);
                            setModalSearch("");
                          }}
                        >
                          <Eye size={14} />
                          <span>Details</span>
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        )}

        {/* ================= TAB 2: BY CUSTOMER HABITS ================= */}
        {activeTab === "depositors" && (
          <table className="admin-matrix-table admin-directory-table">
            <thead>
              <tr>
                <th>Customer Profile</th>
                <th>Total Purchases</th>
                <th>Favorite Package Tier</th>
                <th>Total Spent (VND)</th>
                <th>Tokens Minted</th>
                <th>Last Active Deposit</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredDepositors.length === 0 ? (
                <tr>
                  <td colSpan={7} className="admin-matrix-empty-row">
                    <div className="admin-matrix-empty-state">
                      <Users size={24} />
                      <strong>No customer deposit records found</strong>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredDepositors.map((dep) => (
                  <tr
                    key={dep.user_id}
                    className="admin-matrix-row admin-directory-row"
                    onClick={() => {
                      setSelectedDepositor(dep);
                      setModalSearch("");
                    }}
                  >
                    <td>
                      <div className="admin-profile-cell">
                        <div className="admin-jockey-avatar-box">
                          {dep.avatar_url ? (
                            <img src={dep.avatar_url} alt={dep.user_name} className="admin-avatar-img" />
                          ) : (
                            <User size={18} />
                          )}
                        </div>
                        <div>
                          <strong className="admin-profile-name">{dep.user_name}</strong>
                          <small className="admin-subtext">{dep.user_email}</small>
                        </div>
                      </div>
                    </td>

                    {/* Total Purchases */}
                    <td>
                      <div className="admin-record-stack">
                        <strong>{dep.success_orders} purchases</strong>
                        <small className="admin-highlight-text">
                          {dep.success_orders >= 5 ? "💎 High Roller" : "⭐ Verified Buyer"}
                        </small>
                      </div>
                    </td>

                    {/* Favorite Package */}
                    <td>
                      <div className="admin-favorite-pkg-cell">
                        <span className="admin-fav-tag">⭐ {dep.favorite_package_label}</span>
                        <small className="admin-subtext">
                          {dep.favorite_package_count}/{dep.success_orders} orders ({dep.favorite_package_share_percent}%)
                        </small>
                      </div>
                    </td>

                    {/* Total Spent */}
                    <td>
                      <strong className="admin-prize-vnd">{formatVND(dep.total_spent_vnd)}</strong>
                    </td>

                    {/* Total Tokens */}
                    <td>
                      <span>{formatNumber(dep.total_tokens_received)} tokens</span>
                    </td>

                    {/* Last Deposit */}
                    <td>
                      <span className="admin-dim-text">{formatDateTime(dep.last_deposit_at)}</span>
                    </td>

                    {/* Action */}
                    <td>
                      <button
                        type="button"
                        className="admin-table-action-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedDepositor(dep);
                          setModalSearch("");
                        }}
                      >
                        <Eye size={14} />
                        <span>History</span>
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}
      </div>

      {/* FOOTER */}
      <footer className="admin-role-matrix-footer">
        <div className="admin-matrix-footer-info">
          <CheckCircle2 size={15} />
          <span>
            Payment intelligence synchronized in real time with VNPAY & MoMo settlement logs. Click any row or customer
            to view comprehensive purchasing history.
          </span>
        </div>

        <div className="admin-matrix-quick-links">
          <Link to="/admin/deposits">
            <span>All Deposit Orders</span>
            <ChevronRight size={14} />
          </Link>
        </div>
      </footer>

      {/* ================= MODAL 1: PACKAGE DETAIL & TOP BUYERS ================= */}
      {selectedPackage && (
        <div
          className="admin-modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-labelledby="pkg-modal-title"
          onClick={() => setSelectedPackage(null)}
        >
          <div className="admin-detail-modal admin-detail-modal--large" onClick={(e) => e.stopPropagation()}>
            <header className="admin-detail-modal__header">
              <div className="admin-profile-cell">
                <div className="admin-horse-avatar-box admin-horse-avatar-box--large">
                  <Wallet size={26} className="admin-icon-accent" />
                </div>
                <div>
                  <div className="admin-role-matrix-eyebrow">
                    <Sparkles size={14} />
                    <span>Package Commercial Breakdown</span>
                  </div>
                  <h3 id="pkg-modal-title">{selectedPackage.label}</h3>
                  <span className="admin-commercial-rank-pill">{selectedPackage.commercial_badge || "Active Tier"}</span>
                </div>
              </div>
              <button
                type="button"
                className="admin-detail-modal__close"
                onClick={() => setSelectedPackage(null)}
                aria-label="Close modal"
              >
                <X size={18} />
              </button>
            </header>

            {/* KPI Summary Grid */}
            <div className="admin-detail-kpi-grid">
              <div className="admin-detail-kpi-card">
                <span>Completed Orders</span>
                <strong>{formatNumber(selectedPackage.metrics?.success_count)} orders</strong>
              </div>
              <div className="admin-detail-kpi-card">
                <span>Gross Fiat Inflow</span>
                <strong className="admin-prize-vnd">{formatVND(selectedPackage.metrics?.total_vnd)}</strong>
              </div>
              <div className="admin-detail-kpi-card">
                <span>Tokens Issued</span>
                <strong>{formatNumber(selectedPackage.metrics?.total_tokens)} tokens</strong>
              </div>
              <div className="admin-detail-kpi-card">
                <span>Unique Buyers</span>
                <strong>{selectedPackage.metrics?.unique_depositors || 0} users</strong>
              </div>
            </div>

            {/* Top Buyers of this package */}
            {selectedPackage.top_buyers && selectedPackage.top_buyers.length > 0 && (
              <div className="admin-modal-sub-section">
                <h4 className="admin-modal-sub-heading">
                  <Crown size={15} className="admin-icon-accent" />
                  <span>Top Buyers of this Package</span>
                </h4>
                <div className="admin-top-buyers-grid">
                  {selectedPackage.top_buyers.map((buyer, idx) => (
                    <div key={buyer.user_id || idx} className="admin-buyer-mini-card">
                      <div className="admin-buyer-rank">#{idx + 1}</div>
                      <div>
                        <strong>{buyer.user_name}</strong>
                        <small className="admin-subtext">{buyer.user_email}</small>
                      </div>
                      <div className="admin-buyer-stats">
                        <span className="admin-fav-tag">{buyer.count} purchases</span>
                        <strong>{formatVND(buyer.total_vnd)}</strong>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Search Box in Modal */}
            <div className="admin-detail-modal__search">
              <Search size={15} />
              <input
                type="text"
                placeholder="Search orders by ID, user name, email, gateway..."
                value={modalSearch}
                onChange={(e) => setModalSearch(e.target.value)}
              />
              {modalSearch && (
                <button type="button" onClick={() => setModalSearch("")}>
                  <X size={13} />
                </button>
              )}
            </div>

            {/* Transactions Log Table */}
            <div className="admin-detail-table-wrapper">
              <table className="admin-detail-table">
                <thead>
                  <tr>
                    <th>Order ID</th>
                    <th>Depositor</th>
                    <th>Fiat Value</th>
                    <th>Tokens Credited</th>
                    <th>Gateway</th>
                    <th>Timestamp</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {packageModalTransactions.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="admin-detail-empty">
                        No transactions recorded.
                      </td>
                    </tr>
                  ) : (
                    packageModalTransactions.map((tx) => (
                      <tr key={tx.id || tx.order_id}>
                        <td>
                          <code className="admin-profile-code">{tx.order_id}</code>
                        </td>
                        <td>
                          <strong>{tx.user_name}</strong>
                          <small className="admin-subtext">{tx.user_email}</small>
                        </td>
                        <td>
                          <strong>{formatVND(tx.total_vnd)}</strong>
                        </td>
                        <td>
                          <span className="admin-highlight-text">{formatToken(tx.total_token)}</span>
                        </td>
                        <td>
                          <span className="admin-gateway-badge">{tx.payment_method}</span>
                        </td>
                        <td>
                          <small>{formatDateTime(tx.created_at)}</small>
                        </td>
                        <td>
                          <span
                            className={`admin-status-pill admin-status-pill--${
                              tx.status === "success" ? "success" : tx.status === "pending" ? "warning" : "danger"
                            }`}
                          >
                            {tx.status === "success" ? "Completed" : tx.status}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <footer className="admin-detail-modal__footer">
              <span>Showing {packageModalTransactions.length} transaction entries</span>
              <button
                type="button"
                className="admin-header__button admin-header__button--ghost"
                onClick={() => setSelectedPackage(null)}
              >
                Close
              </button>
            </footer>
          </div>
        </div>
      )}

      {/* ================= MODAL 2: INDIVIDUAL CUSTOMER HISTORY ================= */}
      {selectedDepositor && (
        <div
          className="admin-modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-labelledby="customer-modal-title"
          onClick={() => setSelectedDepositor(null)}
        >
          <div className="admin-detail-modal admin-detail-modal--large" onClick={(e) => e.stopPropagation()}>
            <header className="admin-detail-modal__header">
              <div className="admin-profile-cell">
                <div className="admin-jockey-avatar-box admin-jockey-avatar-box--large">
                  {selectedDepositor.avatar_url ? (
                    <img src={selectedDepositor.avatar_url} alt={selectedDepositor.user_name} className="admin-avatar-img" />
                  ) : (
                    <User size={28} />
                  )}
                </div>
                <div>
                  <div className="admin-role-matrix-eyebrow">
                    <User size={14} />
                    <span>Customer Purchasing History</span>
                  </div>
                  <h3 id="customer-modal-title">{selectedDepositor.user_name}</h3>
                  <span className="admin-subtext">{selectedDepositor.user_email} · {selectedDepositor.user_phone}</span>
                </div>
              </div>
              <button
                type="button"
                className="admin-detail-modal__close"
                onClick={() => setSelectedDepositor(null)}
                aria-label="Close modal"
              >
                <X size={18} />
              </button>
            </header>

            {/* KPI Summary Grid */}
            <div className="admin-detail-kpi-grid">
              <div className="admin-detail-kpi-card">
                <span>Total Purchases</span>
                <strong>{selectedDepositor.success_orders} orders</strong>
              </div>
              <div className="admin-detail-kpi-card">
                <span>Total Spent</span>
                <strong className="admin-prize-vnd">{formatVND(selectedDepositor.total_spent_vnd)}</strong>
              </div>
              <div className="admin-detail-kpi-card">
                <span>Total Tokens Minted</span>
                <strong>{formatNumber(selectedDepositor.total_tokens_received)} tokens</strong>
              </div>
              <div className="admin-detail-kpi-card">
                <span>Favorite Package</span>
                <strong>⭐ {selectedDepositor.favorite_package_label}</strong>
              </div>
            </div>

            {/* Search Box in Modal */}
            <div className="admin-detail-modal__search">
              <Search size={15} />
              <input
                type="text"
                placeholder="Filter customer orders by ID, gateway..."
                value={modalSearch}
                onChange={(e) => setModalSearch(e.target.value)}
              />
              {modalSearch && (
                <button type="button" onClick={() => setModalSearch("")}>
                  <X size={13} />
                </button>
              )}
            </div>

            {/* User Transactions Table */}
            <div className="admin-detail-table-wrapper">
              <table className="admin-detail-table">
                <thead>
                  <tr>
                    <th>Order ID</th>
                    <th>Package Code</th>
                    <th>Amount (VND)</th>
                    <th>Tokens Credited</th>
                    <th>Gateway</th>
                    <th>Timestamp</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {customerModalTransactions.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="admin-detail-empty">
                        No orders found for this user in selected period.
                      </td>
                    </tr>
                  ) : (
                    customerModalTransactions.map((tx) => (
                      <tr key={tx.id || tx.order_id}>
                        <td>
                          <code className="admin-profile-code">{tx.order_id}</code>
                        </td>
                        <td>
                          <strong>{tx.package_id}</strong>
                        </td>
                        <td>
                          <strong className="admin-prize-vnd">{formatVND(tx.total_vnd)}</strong>
                        </td>
                        <td>
                          <span className="admin-highlight-text">{formatToken(tx.total_token)}</span>
                        </td>
                        <td>
                          <span className="admin-gateway-badge">{tx.payment_method}</span>
                        </td>
                        <td>
                          <small>{formatDateTime(tx.created_at)}</small>
                        </td>
                        <td>
                          <span
                            className={`admin-status-pill admin-status-pill--${
                              tx.status === "success" ? "success" : tx.status === "pending" ? "warning" : "danger"
                            }`}
                          >
                            {tx.status === "success" ? "Completed" : tx.status}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <footer className="admin-detail-modal__footer">
              <span>Customer ID: {selectedDepositor.user_id}</span>
              <button
                type="button"
                className="admin-header__button admin-header__button--ghost"
                onClick={() => setSelectedDepositor(null)}
              >
                Close
              </button>
            </footer>
          </div>
        </div>
      )}
    </article>
  );
}
