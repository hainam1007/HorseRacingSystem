import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { adminApi } from "../api/adminApi";
import {
  Activity,
  CheckCircle2,
  ChevronRight,
  CircleDollarSign,
  Clock,
  CreditCard,
  Eye,
  EyeOff,
  Filter,
  Info,
  Layers,
  Search,
  Sparkles,
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

const cleanTimeString = (val) => {
  if (!val) return "—";
  let s = String(val);
  s = s.replace(/\(Tối\)/gi, "(Evening)");
  s = s.replace(/\(Chiều\)/gi, "(Afternoon)");
  s = s.replace(/\(Sáng\)/gi, "(Morning)");
  s = s.replace(/Cuối tuần\s*\/\s*Giờ đua/gi, "Weekends / Race days");
  s = s.replace(/Trong kỳ/gi, "In period");
  s = s.replace(/~\s*30\s*phút\s*sau\s*nạp/gi, "~ 30 mins after deposit");
  s = s.replace(/Rất nhanh\s*\(<\s*20p\)/gi, "Fast (< 20 mins)");
  s = s.replace(/Rất nhanh\s*\(<\s*15p\)/gi, "Fast (< 15 mins)");
  s = s.replace(/Rất nhanh/gi, "Fast (< 15 mins)");
  return s;
};

const CATEGORIES = [
  { id: "all", label: "All Metrics", icon: Layers },
  { id: "volume", label: "Volume & Orders", icon: Users },
  { id: "revenue", label: "Revenue & Tokens", icon: CircleDollarSign },
  { id: "time", label: "Timing & Trends", icon: Clock }
];

const PAYMENT_METHODS = [
  { id: "all", label: "All Gateways" },
  { id: "VNPAY", label: "VNPAY QR/Card" },
  { id: "MOMO", label: "MoMo Wallet" },
  { id: "MOCK", label: "Mock Sandbox" }
];

export default function AdminCashflowMatrixTable({ cashflowMatrix, isLoading, onPaymentMethodChange }) {
  const [activeCategory, setActiveCategory] = useState("all");
  const [activePaymentMethod, setActivePaymentMethod] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [hideZeroRows, setHideZeroRows] = useState(false);
  const [showPkgSelector, setShowPkgSelector] = useState(false);
  const [visiblePackages, setVisiblePackages] = useState({});
  const [selectedDetailPackage, setSelectedDetailPackage] = useState(null); // When non-null, opens detail modal
  const [modalSearch, setModalSearch] = useState("");
  const [internalData, setInternalData] = useState(null);

  useEffect(() => {
    if (!cashflowMatrix) {
      adminApi.getCashflowMatrix({ payment_method: activePaymentMethod !== "all" ? activePaymentMethod : undefined }).then((res) => {
        if (res) setInternalData(res);
      }).catch(() => {});
    }
  }, [cashflowMatrix, activePaymentMethod]);

  const effectiveData = cashflowMatrix || internalData;

  const packages = useMemo(() => effectiveData?.packages || [], [effectiveData]);
  const totals = useMemo(() => effectiveData?.totals || {}, [effectiveData]);
  const allTransactions = useMemo(() => effectiveData?.all_recent_transactions || [], [effectiveData]);

  // Initialize visiblePackages on first load
  useMemo(() => {
    if (packages.length > 0 && Object.keys(visiblePackages).length === 0) {
      const init = {};
      packages.forEach((pkg) => {
        init[pkg.package_id] = true;
      });
      setVisiblePackages(init);
    }
  }, [packages]);

  const togglePackage = (pkgId) => {
    setVisiblePackages((prev) => {
      const next = { ...prev, [pkgId]: !prev[pkgId] };
      const anyVisible = Object.values(next).some(Boolean);
      return anyVisible ? next : prev;
    });
  };

  const selectAllPackages = (select) => {
    const next = {};
    packages.forEach((p) => {
      next[p.package_id] = select;
    });
    setVisiblePackages(next);
  };

  const handlePaymentMethodClick = (pmId) => {
    setActivePaymentMethod(pmId);
    if (onPaymentMethodChange) {
      onPaymentMethodChange(pmId);
    }
  };

  // Row definitions matching clear business categories: Volume - Revenue - Time
  const rowDefinitions = useMemo(() => {
    return [
      // CATEGORY 1: VOLUME & ORDERS
      {
        id: "success_count",
        category: "volume",
        factorTag: "Volume",
        label: "Successful Deposits",
        sublabel: "Completed orders with tokens credited",
        badge: "Completed",
        formatter: (v) => formatNumber(v),
        getValue: (m) => m.success_count,
        getTotal: () => totals.success_count || 0,
        unit: "orders",
        highlight: true
      },
      {
        id: "unique_depositors",
        category: "volume",
        factorTag: "Volume",
        label: "Unique Depositing Users",
        sublabel: "Distinct user accounts funding wallets",
        badge: "Audience",
        formatter: (v) => formatNumber(v),
        getValue: (m) => m.unique_depositors,
        getTotal: () => totals.unique_depositors || 0,
        unit: "users"
      },
      {
        id: "ftd_count",
        category: "volume",
        factorTag: "Volume",
        label: "First-Time Depositors (FTD)",
        sublabel: "New users funding accounts for the first time",
        badge: "Acquisition",
        formatter: (v) => formatNumber(v),
        getValue: (m) => m.ftd_count,
        getTotal: () => totals.ftd_count || 0,
        unit: "users",
        highlight: true
      },
      {
        id: "pending_failed",
        category: "volume",
        factorTag: "Volume",
        label: "Pending & Failed Orders",
        sublabel: "In-flight or unconfirmed gateway orders",
        badge: "Attention",
        formatter: (v, m) => {
          const pending = m?.pending_count || 0;
          const failed = m?.failed_count || 0;
          if (pending === 0 && failed === 0) return "0";
          return `${formatNumber(pending)} pending · ${formatNumber(failed)} failed`;
        },
        getValue: (m) => (m.pending_count || 0) + (m.failed_count || 0),
        getTotal: () => (totals.pending_count || 0) + (totals.failed_count || 0),
        unit: "orders",
        isAlert: (v) => v > 0
      },
      {
        id: "success_rate",
        category: "volume",
        factorTag: "Volume",
        label: "Payment Conversion Rate",
        sublabel: "Percentage of checkout attempts settled",
        badge: "Conversion",
        formatter: (v, m) => m?.success_rate || "100%",
        getValue: (m) => parseFloat(m?.success_rate || 100),
        getTotal: () => totals.success_rate || "100%",
        unit: "%"
      },

      // CATEGORY 2: REVENUE & TOKENS
      {
        id: "total_vnd",
        category: "revenue",
        factorTag: "Revenue",
        label: "Gross Fiat Inflow (VND)",
        sublabel: "Actual fiat revenue received via gateways",
        badge: "Gross Revenue",
        formatter: (v) => formatVND(v),
        getValue: (m) => m.total_vnd,
        getTotal: () => totals.total_vnd || 0,
        unit: "VND",
        highlight: true
      },
      {
        id: "total_tokens",
        category: "revenue",
        factorTag: "Revenue",
        label: "Tokens Minted to Wallets",
        sublabel: "Total token volume supplied to players",
        badge: "Issuance",
        formatter: (v) => formatToken(v),
        getValue: (m) => m.total_tokens,
        getTotal: () => totals.total_tokens || 0,
        unit: "tokens"
      },
      {
        id: "bonus_tokens",
        category: "revenue",
        factorTag: "Revenue",
        label: "Promotional Bonus Tokens",
        sublabel: "Bonus incentive token allowance",
        badge: "Incentives",
        formatter: (v) => formatToken(v),
        getValue: (m) => m.bonus_tokens,
        getTotal: () => totals.bonus_tokens || 0,
        unit: "tokens"
      },
      {
        id: "aov_vnd",
        category: "revenue",
        factorTag: "Revenue",
        label: "Average Order Value (AOV)",
        sublabel: "Mean fiat value per successful order",
        badge: "AOV",
        formatter: (v) => formatVND(v),
        getValue: (m) => m.aov_vnd,
        getTotal: () => totals.aov_vnd || 0,
        unit: "VND"
      },

      // CATEGORY 3: TIMING & TRENDS
      {
        id: "peak_hour_window",
        category: "time",
        factorTag: "Timing",
        label: "Peak Deposit Hours",
        sublabel: "Timeframe with highest transaction volume",
        badge: "Peak Hours",
        formatter: (v, m) => cleanTimeString(m?.peak_hour_window || v || "18:00 – 21:00 (Evening)"),
        getValue: (m) => m?.peak_hour_window,
        getTotal: () => cleanTimeString(totals.peak_hour_window || "18:00 – 21:00 (Evening)"),
        unit: "hours",
        highlight: true
      },
      {
        id: "token_velocity",
        category: "time",
        factorTag: "Timing",
        label: "Wagering Turnaround Speed",
        sublabel: "Average duration from deposit to first placed bet",
        badge: "Velocity",
        formatter: (v, m) => cleanTimeString(m?.token_velocity || v || "Fast (< 20 mins)"),
        getValue: (m) => m?.token_velocity,
        getTotal: () => cleanTimeString(totals.token_velocity || "Fast (< 20 mins)"),
        unit: "turnaround"
      },
      {
        id: "repeat_rate",
        category: "time",
        factorTag: "Timing",
        label: "Repeat Deposit Retention",
        sublabel: "Proportion of users funding account ≥2 times",
        badge: "Retention",
        formatter: (v, m) => m?.repeat_rate || "0%",
        getValue: (m) => m?.repeat_rate,
        getTotal: () => totals.repeat_rate || "0%",
        unit: "%"
      },
      {
        id: "peak_date",
        category: "time",
        factorTag: "Timing",
        label: "Peak Inflow Surge Date",
        sublabel: "Day of period with highest total fiat inflow",
        badge: "Peak Date",
        formatter: (v, m) => cleanTimeString(m?.peak_date || v || "Race days / Peak"),
        getValue: (m) => m?.peak_date,
        getTotal: () => cleanTimeString(totals.peak_date || "Race days / Peak"),
        unit: "date"
      }
    ];
  }, [totals]);

  // Filter rows
  const filteredRows = useMemo(() => {
    return rowDefinitions.filter((row) => {
      if (activeCategory !== "all" && row.category !== activeCategory) {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const mLabel = row.label.toLowerCase().includes(q);
        const mSub = row.sublabel?.toLowerCase().includes(q);
        const mBadge = row.badge?.toLowerCase().includes(q);
        if (!mLabel && !mSub && !mBadge) return false;
      }
      if (hideZeroRows) {
        if (typeof row.getTotal === "function") {
          const tVal = row.getTotal();
          if (typeof tVal === "number" && tVal === 0) return false;
        }
      }
      return true;
    });
  }, [rowDefinitions, activeCategory, searchQuery, hideZeroRows]);

  const activeVisiblePkgCount = packages.filter((p) => visiblePackages[p.package_id] !== false).length;

  // Filtered transactions for detail modal
  const modalTransactions = useMemo(() => {
    if (!selectedDetailPackage) return [];
    let list = [];
    if (selectedDetailPackage === "all") {
      list = allTransactions;
    } else {
      const pkg = packages.find((p) => p.package_id === selectedDetailPackage);
      list = pkg?.recent_transactions || [];
    }

    if (!modalSearch.trim()) return list;
    const q = modalSearch.toLowerCase();
    return list.filter(
      (tx) =>
        (tx.order_id && tx.order_id.toLowerCase().includes(q)) ||
        (tx.user_name && tx.user_name.toLowerCase().includes(q)) ||
        (tx.user_email && tx.user_email.toLowerCase().includes(q)) ||
        (tx.payment_method && tx.payment_method.toLowerCase().includes(q))
    );
  }, [selectedDetailPackage, packages, allTransactions, modalSearch]);

  const selectedPkgObject = useMemo(() => {
    if (!selectedDetailPackage || selectedDetailPackage === "all") return null;
    return packages.find((p) => p.package_id === selectedDetailPackage);
  }, [selectedDetailPackage, packages]);

  return (
    <article className="admin-cashflow-matrix-container">
      {/* HEADER WITH TITLE & CONTROLS */}
      <header className="admin-role-matrix-header">
        <div className="admin-role-matrix-title-group">
          <div className="admin-role-matrix-eyebrow">
            <CreditCard size={14} className="admin-icon-accent" />
            <span>Deposit & Cash Flow Matrix</span>
          </div>
          <h2>Deposit Packages & Liquidity Breakdown</h2>
          <p>
            Review gross fiat revenue, token issuance volume, and deposit velocity across all active package tiers.
          </p>
        </div>

        <div className="admin-role-matrix-actions">
          {/* Search Box */}
          <div className="admin-matrix-search">
            <Search size={15} />
            <input
              type="text"
              placeholder="Filter cash flow metrics..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              aria-label="Filter cash flow metrics"
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

          {/* Toggle Column Selector */}
          <div className="admin-matrix-column-filter">
            <button
              type="button"
              className={`admin-filter-btn${showPkgSelector ? " is-active" : ""}`}
              onClick={() => setShowPkgSelector(!showPkgSelector)}
              aria-expanded={showPkgSelector}
            >
              <Filter size={15} />
              <span>Deposit Packs ({activeVisiblePkgCount}/{packages.length})</span>
            </button>

            {showPkgSelector && (
              <div className="admin-matrix-dropdown">
                <div className="admin-matrix-dropdown__header">
                  <strong>Visible Deposit Packs</strong>
                  <div className="admin-matrix-dropdown__quick-btns">
                    <button type="button" onClick={() => selectAllPackages(true)}>
                      Show all
                    </button>
                    <span>·</span>
                    <button type="button" onClick={() => selectAllPackages(false)}>
                      Hide all
                    </button>
                  </div>
                </div>
                <div className="admin-matrix-dropdown__list">
                  {packages.map((pkg) => {
                    const isChecked = visiblePackages[pkg.package_id] !== false;
                    return (
                      <label key={pkg.package_id} className="admin-matrix-checkbox-item">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => togglePackage(pkg.package_id)}
                        />
                        <Wallet size={14} className="admin-icon-accent" />
                        <span className="admin-matrix-checkbox-label">
                          <strong>{pkg.label}</strong>
                          <small>{formatVND(pkg.vnd_price)}</small>
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Filter Zero Values Toggle */}
          <button
            type="button"
            className={`admin-filter-btn${hideZeroRows ? " is-active" : ""}`}
            onClick={() => setHideZeroRows(!hideZeroRows)}
            title="Hide rows with zero values"
          >
            {hideZeroRows ? <EyeOff size={15} /> : <Eye size={15} />}
            <span>{hideZeroRows ? "Active rows only" : "Show all rows"}</span>
          </button>

          {/* All Transactions Drill-down button */}
          <button
            type="button"
            className="admin-filter-btn admin-filter-btn--drilldown"
            onClick={() => {
              setSelectedDetailPackage("all");
              setModalSearch("");
            }}
          >
            <Zap size={15} />
            <span>Audit Log ({allTransactions.length})</span>
          </button>
        </div>
      </header>

      {/* FILTER CONTROLS: 2 ROWS (CATEGORIES + PAYMENT CHANNELS) */}
      <div className="admin-cashflow-filters-bar">
        {/* Category Tabs */}
        <nav className="admin-matrix-categories" aria-label="Metric category tabs">
          {CATEGORIES.map((cat) => {
            const Icon = cat.icon;
            const isActive = activeCategory === cat.id;
            const count =
              cat.id === "all"
                ? rowDefinitions.length
                : rowDefinitions.filter((r) => r.category === cat.id).length;

            return (
              <button
                key={cat.id}
                type="button"
                className={`admin-matrix-category-tab${isActive ? " is-active" : ""}`}
                onClick={() => setActiveCategory(cat.id)}
              >
                <Icon size={15} />
                <span>{cat.label}</span>
                <span className="admin-matrix-tab-count">{count}</span>
              </button>
            );
          })}
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

      {/* MATRIX TABLE */}
      <div className="admin-matrix-table-wrapper">
        <table className="admin-matrix-table">
          <thead>
            <tr>
              <th className="admin-matrix-col--metric">
                <div className="admin-matrix-col-header">
                  <span>Performance Metric</span>
                  <small>Grouped by Category</small>
                </div>
              </th>

              {/* Dynamic Package Columns */}
              {packages.map((pkg) => {
                if (visiblePackages[pkg.package_id] === false) return null;

                return (
                  <th key={pkg.package_id} className="admin-matrix-col--role admin-matrix-col--package">
                    <div className="admin-role-header-cell">
                      <div className="admin-role-header-top">
                        <span className="admin-role-icon-box admin-role-icon-box--package">
                          <Wallet size={16} />
                        </span>
                        <span className="admin-role-badge-pill admin-role-badge-pill--package">
                          {pkg.bonus_token > 0 ? `+${pkg.bonus_token} bonus` : "Standard"}
                        </span>
                      </div>
                      <strong className="admin-role-title">{pkg.label}</strong>
                      <div className="admin-pkg-subheading">
                        <span>{formatVND(pkg.vnd_price)}</span>
                        <button
                          type="button"
                          className="admin-pkg-detail-link"
                          onClick={() => {
                            setSelectedDetailPackage(pkg.package_id);
                            setModalSearch("");
                          }}
                          title={`View transactions for ${pkg.label}`}
                        >
                          Details <ChevronRight size={12} />
                        </button>
                      </div>
                    </div>
                  </th>
                );
              })}

              {/* Total Summary Column */}
              <th className="admin-matrix-col--total">
                <div className="admin-role-header-cell admin-role-header-cell--total">
                  <div className="admin-role-header-top">
                    <span className="admin-role-icon-box admin-role-icon-box--total">
                      <Sparkles size={16} />
                    </span>
                    <span className="admin-role-badge-pill admin-role-badge-pill--total">Consolidated</span>
                  </div>
                  <strong className="admin-role-title">Total Inflow</strong>
                  <div className="admin-pkg-subheading">
                    <span>All tiers combined</span>
                    <button
                      type="button"
                      className="admin-pkg-detail-link"
                      onClick={() => {
                        setSelectedDetailPackage("all");
                        setModalSearch("");
                      }}
                      title="View all transactions in period"
                    >
                      Audit Log <ChevronRight size={12} />
                    </button>
                  </div>
                </div>
              </th>
            </tr>
          </thead>

          <tbody>
            {filteredRows.length === 0 ? (
              <tr>
                <td colSpan={activeVisiblePkgCount + 2} className="admin-matrix-empty-row">
                  <div className="admin-matrix-empty-state">
                    <Filter size={24} />
                    <strong>No matching metrics found</strong>
                    <p>Try clearing filters or adjusting your search keyword.</p>
                  </div>
                </td>
              </tr>
            ) : (
              filteredRows.map((row) => {
                const totalVal = typeof row.getTotal === "function" ? row.getTotal() : totals[row.id];
                const isHighlight = row.highlight;

                return (
                  <tr
                    key={row.id}
                    className={`admin-matrix-row admin-matrix-row--${row.category}${isHighlight ? " is-highlight" : ""}`}
                  >
                    {/* Metric Column */}
                    <td className="admin-matrix-cell--metric">
                      <div className="admin-metric-cell-content">
                        <div className="admin-metric-cell-heading">
                          <span className={`admin-factor-pill admin-factor-pill--${row.category}`}>
                            {row.factorTag}
                          </span>
                          <strong>{row.label}</strong>
                        </div>
                        {row.sublabel && <small className="admin-metric-sublabel">{row.sublabel}</small>}
                      </div>
                    </td>

                    {/* Package Values */}
                    {packages.map((pkg) => {
                      if (visiblePackages[pkg.package_id] === false) return null;

                      const m = pkg.metrics || {};
                      const rawVal = row.getValue(m);
                      const isAlert = row.isAlert ? row.isAlert(rawVal) : false;
                      const isZero = typeof rawVal === "number" && rawVal === 0;

                      return (
                        <td
                          key={pkg.package_id}
                          className={`admin-matrix-cell--value${isAlert ? " is-alert-cell" : ""}${isZero ? " is-dimmed" : ""}`}
                        >
                          <span className="admin-cell-value-text">
                            {row.formatter ? row.formatter(rawVal, m) : formatNumber(rawVal)}
                          </span>
                        </td>
                      );
                    })}

                    {/* Total Column */}
                    <td className="admin-matrix-cell--total-val">
                      <strong className="admin-total-value-text">
                        {row.formatter ? row.formatter(totalVal, totals) : formatNumber(totalVal)}
                      </strong>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* FOOTER & ACTIONS */}
      <footer className="admin-role-matrix-footer">
        <div className="admin-matrix-footer-info">
          <CheckCircle2 size={15} />
          <span>
            Aggregated real-time from <code>deposit_requests</code> and <code>deposit_packages</code>. Click{" "}
            <strong>"Details"</strong> on any tier to inspect individual transactions.
          </span>
        </div>

        <div className="admin-matrix-quick-links">
          <Link to="/admin/deposits">
            <span>Deposit Approvals Queue</span>
            <ChevronRight size={14} />
          </Link>
        </div>
      </footer>

      {/* DRILL-DOWN DETAIL MODAL */}
      {selectedDetailPackage && (
        <div
          className="admin-modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-labelledby="drilldown-modal-title"
          onClick={() => setSelectedDetailPackage(null)}
        >
          <div className="admin-detail-modal" onClick={(e) => e.stopPropagation()}>
            <header className="admin-detail-modal__header">
              <div>
                <div className="admin-role-matrix-eyebrow">
                  <Activity size={14} />
                  <span>Verified Transaction Audit Log</span>
                </div>
                <h3 id="drilldown-modal-title">
                  {selectedDetailPackage === "all"
                    ? "Consolidated Deposit Log (All Tiers)"
                    : `${selectedPkgObject?.label || "Tier"} — Transaction Log`}
                </h3>
              </div>
              <button
                type="button"
                className="admin-detail-modal__close"
                onClick={() => setSelectedDetailPackage(null)}
                aria-label="Close modal"
              >
                <X size={18} />
              </button>
            </header>

            {/* Modal KPI Mini Summary */}
            <div className="admin-detail-kpi-grid">
              <div className="admin-detail-kpi-card">
                <span>Gross Fiat Inflow</span>
                <strong>
                  {selectedDetailPackage === "all"
                    ? formatVND(totals.total_vnd)
                    : formatVND(selectedPkgObject?.metrics?.total_vnd || 0)}
                </strong>
              </div>
              <div className="admin-detail-kpi-card">
                <span>Total Tokens Credited</span>
                <strong>
                  {selectedDetailPackage === "all"
                    ? formatToken(totals.total_tokens)
                    : formatToken(selectedPkgObject?.metrics?.total_tokens || 0)}
                </strong>
              </div>
              <div className="admin-detail-kpi-card">
                <span>Completed Orders</span>
                <strong>
                  {selectedDetailPackage === "all"
                    ? `${formatNumber(totals.success_count)} orders`
                    : `${formatNumber(selectedPkgObject?.metrics?.success_count || 0)} orders`}
                </strong>
              </div>
              <div className="admin-detail-kpi-card">
                <span>Peak Concentration</span>
                <strong>
                  {selectedDetailPackage === "all"
                    ? totals.peak_hour_window
                    : selectedPkgObject?.metrics?.peak_hour_window || "—"}
                </strong>
              </div>
            </div>

            {/* Modal Search Bar */}
            <div className="admin-detail-modal__search">
              <Search size={15} />
              <input
                type="text"
                placeholder="Search by Order ID, User Name, Email, or Payment Gateway..."
                value={modalSearch}
                onChange={(e) => setModalSearch(e.target.value)}
                aria-label="Search transaction records"
              />
              {modalSearch && (
                <button type="button" onClick={() => setModalSearch("")} aria-label="Clear search">
                  <X size={13} />
                </button>
              )}
            </div>

            {/* Transactions Table in Modal */}
            <div className="admin-detail-table-wrapper">
              <table className="admin-detail-table">
                <thead>
                  <tr>
                    <th>Order ID</th>
                    <th>Depositor</th>
                    <th>Fiat Value</th>
                    <th>Tokens</th>
                    <th>Gateway</th>
                    <th>Timestamp</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {modalTransactions.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="admin-detail-empty">
                        <Info size={18} />
                        <span>No transaction records found matching the criteria in this timeframe.</span>
                      </td>
                    </tr>
                  ) : (
                    modalTransactions.map((tx) => (
                      <tr key={tx.id || tx.order_id}>
                        <td>
                          <code className="admin-tx-code">{tx.order_id}</code>
                        </td>
                        <td>
                          <div className="admin-tx-user">
                            <strong>{tx.user_name || "Customer"}</strong>
                            <small>{tx.user_email || "—"}</small>
                          </div>
                        </td>
                        <td>
                          <strong>{formatVND(tx.total_vnd)}</strong>
                        </td>
                        <td>
                          <span className="admin-tx-token">+{formatNumber(tx.total_token)}</span>
                        </td>
                        <td>
                          <span className="admin-tx-method">{tx.payment_method || "VNPAY"}</span>
                        </td>
                        <td>
                          <span className="admin-tx-time">{formatDateTime(tx.created_at)}</span>
                        </td>
                        <td>
                          <span
                            className={`admin-tx-status admin-tx-status--${tx.status || "success"}`}
                          >
                            {tx.status === "success"
                              ? "Completed"
                              : tx.status === "pending"
                              ? "Pending"
                              : "Failed"}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <footer className="admin-detail-modal__footer">
              <span>Displaying {modalTransactions.length} recent transaction records</span>
              <button
                type="button"
                className="admin-header__button admin-header__button--ghost"
                onClick={() => setSelectedDetailPackage(null)}
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
