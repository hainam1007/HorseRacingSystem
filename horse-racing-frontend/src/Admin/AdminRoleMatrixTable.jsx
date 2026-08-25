import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  Award,
  CheckCircle2,
  ChevronRight,
  CircleDollarSign,
  Eye,
  EyeOff,
  Filter,
  Layers,
  Search,
  Shield,
  Sparkles,
  Ticket,
  Trophy,
  Users,
  X
} from "lucide-react";

const formatNumber = (val) => new Intl.NumberFormat("en-US").format(Number(val || 0));
const formatVND = (val) =>
  new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND", maximumFractionDigits: 0 }).format(
    Number(val || 0)
  );
const formatToken = (val) => `${formatNumber(val)} tokens`;

const CATEGORIES = [
  { id: "all", label: "All Metrics", icon: Layers },
  { id: "accounts", label: "1. User Accounts", icon: Users },
  { id: "financials", label: "2. Revenue & Cash Flow", icon: CircleDollarSign },
  { id: "operations", label: "3. Domain Operations", icon: Trophy }
];

const ROLE_ICONS = {
  horse_owner: Award,
  jockey: Trophy,
  race_referee: Shield,
  spectator: Ticket
};

const ROLE_META_OVERRIDES = {
  horse_owner: {
    label: "Horse Owner",
    badge: "Owner",
    description: "Horse ownership & race entries"
  },
  jockey: {
    label: "Jockey",
    badge: "Jockey",
    description: "Race riding & performance records"
  },
  race_referee: {
    label: "Race Referee",
    badge: "Referee",
    description: "Inspections & track supervision"
  },
  spectator: {
    label: "Spectator",
    badge: "Punter",
    description: "Race viewing & prediction wagering"
  }
};

export default function AdminRoleMatrixTable({ roleMatrix, isLoading }) {
  const [activeCategory, setActiveCategory] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [hideZeroRows, setHideZeroRows] = useState(false);
  const [visibleRoles, setVisibleRoles] = useState({
    horse_owner: true,
    jockey: true,
    race_referee: true,
    spectator: true
  });
  const [showRoleSelector, setShowRoleSelector] = useState(false);

  const roles = useMemo(() => roleMatrix?.roles || [], [roleMatrix]);
  const totals = useMemo(() => roleMatrix?.totals || {}, [roleMatrix]);

  const toggleRole = (roleKey) => {
    setVisibleRoles((prev) => {
      const next = { ...prev, [roleKey]: !prev[roleKey] };
      const anyVisible = Object.values(next).some(Boolean);
      return anyVisible ? next : prev;
    });
  };

  const selectAllRoles = (select) => {
    setVisibleRoles({
      horse_owner: select,
      jockey: select,
      race_referee: select,
      spectator: select
    });
  };

  // Build matrix rows definition
  const rowDefinitions = useMemo(() => {
    const rows = [
      // CATEGORY 1: ACCOUNTS & STATUS
      {
        id: "total_accounts",
        category: "accounts",
        label: "Total Registered Accounts",
        sublabel: "Total enrolled accounts by role",
        badge: "Accounts",
        formatter: (v) => formatNumber(v),
        getValue: (metrics) => metrics.total_accounts,
        getTotal: () => totals.total_accounts || 0,
        unit: "users",
        link: "/admin/users"
      },
      {
        id: "active_accounts",
        category: "accounts",
        label: "Active User Accounts",
        sublabel: "Accounts in active operational standing",
        badge: "Active",
        formatter: (v) => formatNumber(v),
        getValue: (metrics) => metrics.active_accounts,
        getTotal: () => totals.active_accounts || 0,
        unit: "users",
        link: "/admin/users"
      },
      {
        id: "new_accounts",
        category: "accounts",
        label: "New Registrations in Period",
        sublabel: "New signups during selected timeframe",
        badge: "New",
        formatter: (v) => formatNumber(v),
        getValue: (metrics) => metrics.new_accounts,
        getTotal: () => totals.new_accounts || 0,
        unit: "users",
        highlight: true
      },
      {
        id: "verified_accounts",
        category: "accounts",
        label: "Verified Profiles",
        sublabel: "Approved KYC profiles & verified credentials",
        badge: "Verified",
        formatter: (v) => formatNumber(v),
        getValue: (metrics) => metrics.verified_accounts,
        getTotal: () => totals.verified_accounts || 0,
        unit: "profiles"
      },
      {
        id: "pending_applications",
        category: "accounts",
        label: "Pending Role Applications",
        sublabel: "Role upgrade requests awaiting review",
        badge: "Review Queue",
        formatter: (v) => (v > 0 ? `${formatNumber(v)} pending` : "0"),
        getValue: (metrics) => metrics.pending_applications,
        getTotal: () => totals.pending_applications || 0,
        unit: "requests",
        isAlert: (v) => v > 0,
        link: "/admin/role-applications"
      },

      // CATEGORY 2: FINANCIALS & REVENUE
      {
        id: "deposit_vnd",
        category: "financials",
        label: "Successful Deposits (VND)",
        sublabel: "Gross fiat inflow deposited into platform",
        badge: "Deposits",
        formatter: (v) => formatVND(v),
        getValue: (metrics) => metrics.deposit_vnd,
        getTotal: () => totals.deposit_vnd || 0,
        unit: "VND",
        link: "/admin/deposits"
      },
      {
        id: "deposit_count",
        category: "financials",
        label: "Deposit Transactions",
        sublabel: "Total completed deposit transactions",
        badge: "Orders",
        formatter: (v) => formatNumber(v),
        getValue: (metrics) => metrics.deposit_count,
        getTotal: () => totals.deposit_count || 0,
        unit: "txs"
      },
      {
        id: "tokens_wagered",
        category: "financials",
        label: "Wagering Volume (Tokens)",
        sublabel: "Total prediction wager stake volume",
        badge: "Wagering",
        formatter: (v) => formatToken(v),
        getValue: (metrics) => metrics.tokens_wagered,
        getTotal: () => totals.tokens_wagered || 0,
        unit: "tokens"
      },
      {
        id: "payout_tokens",
        category: "financials",
        label: "Winning Payouts (Tokens)",
        sublabel: "Tokens settled & paid to winning punters",
        badge: "Payouts",
        formatter: (v) => formatToken(v),
        getValue: (metrics) => metrics.payout_tokens,
        getTotal: () => totals.payout_tokens || 0,
        unit: "tokens"
      },
      {
        id: "prize_awards_vnd",
        category: "financials",
        label: "Tournament Prize Awards (VND)",
        sublabel: "Purse payouts distributed to Owners & Jockeys",
        badge: "Prize Purse",
        formatter: (v) => formatVND(v),
        getValue: (metrics) => metrics.prize_awards_vnd,
        getTotal: () => totals.prize_awards_vnd || 0,
        unit: "VND",
        link: "/admin/results"
      },
      {
        id: "wallet_balance",
        category: "financials",
        label: "Total Wallet Balances",
        sublabel: "Token supply held across user wallets",
        badge: "Liquidity",
        formatter: (v) => formatToken(v),
        getValue: (metrics) => metrics.wallet_balance,
        getTotal: () => totals.wallet_balance || 0,
        unit: "tokens"
      },
      {
        id: "gross_margin",
        category: "financials",
        label: "Gross Gaming Revenue (GGR)",
        sublabel: "Retained wagering margin (Stakes − Payouts)",
        badge: "GGR Margin",
        formatter: (v) => formatToken(v),
        getValue: (metrics) => metrics.gross_margin,
        getTotal: () => totals.gross_margin || 0,
        unit: "tokens",
        highlight: true
      },

      // CATEGORY 3: ROLE-SPECIFIC OPERATIONS
      {
        id: "op_horses_registrations",
        category: "operations",
        label: "Horses Owned & Tournament Entries",
        sublabel: "Registered equine stable & race registrations",
        badge: "Equestrian",
        customCells: {
          horse_owner: (m) => {
            const hOp = m.operations?.find((o) => o.key === "horses_owned");
            const rOp = m.operations?.find((o) => o.key === "race_registrations");
            return hOp ? `${formatNumber(hOp.value)} horses (${rOp?.value || 0} entries)` : "—";
          },
          jockey: () => "—",
          race_referee: () => "—",
          spectator: () => "—"
        },
        customTotal: "By role",
        link: "/admin/tournament"
      },
      {
        id: "op_jockey_performance",
        category: "operations",
        label: "Races Ridden & Win Strike Rate",
        sublabel: "Race bookings ridden & first-place finishes",
        badge: "Performance",
        customCells: {
          horse_owner: () => "—",
          jockey: (m) => {
            const assignOp = m.operations?.find((o) => o.key === "race_assignments");
            const winOp = m.operations?.find((o) => o.key === "total_wins");
            const rateOp = m.operations?.find((o) => o.key === "win_rate");
            return assignOp
              ? `${formatNumber(assignOp.value)} rides (${winOp?.value || 0} wins · ${rateOp?.value || "0%"})`
              : "—";
          },
          race_referee: () => "—",
          spectator: () => "—"
        },
        customTotal: "By role",
        link: "/admin/jockeys"
      },
      {
        id: "op_checks_reports",
        category: "operations",
        label: "Pre-Race Checks & Official Reports",
        sublabel: "Horse health inspections & track supervision reports",
        badge: "Supervision",
        customCells: {
          horse_owner: () => "—",
          jockey: () => "—",
          race_referee: (m) => {
            const checkOp = m.operations?.find((o) => o.key === "horse_checks");
            const repOp = m.operations?.find((o) => o.key === "referee_reports");
            return checkOp
              ? `${formatNumber(checkOp.value)} checks (${repOp?.value || 0} reports)`
              : "—";
          },
          spectator: () => "—"
        },
        customTotal: "By role",
        link: "/admin/referees"
      },
      {
        id: "op_violations_discipline",
        category: "operations",
        label: "Violations Logged & Disciplinary Actions",
        sublabel: "Recorded infractions, rider suspensions & ticket drops",
        badge: "Disciplinary",
        customCells: {
          horse_owner: (m) => {
            const op = m.operations?.find((o) => o.key === "cancellation_tickets");
            return op ? `${formatNumber(op.value)} drop tickets` : "—";
          },
          jockey: (m) => {
            const op = m.operations?.find((o) => o.key === "suspended_jockeys");
            return op ? `${formatNumber(op.value)} suspended` : "—";
          },
          race_referee: (m) => {
            const op = m.operations?.find((o) => o.key === "violations_logged");
            return op ? `${formatNumber(op.value)} violation cases` : "—";
          },
          spectator: () => "—"
        },
        customTotal: "By role",
        link: "/admin/cancellations"
      },
      {
        id: "op_bets_bettors",
        category: "operations",
        label: "Wagering Tickets & Loyalty Redemptions",
        sublabel: "Total placed bets, unique punters & reward claims",
        badge: "Audience",
        customCells: {
          horse_owner: () => "—",
          jockey: () => "—",
          race_referee: () => "—",
          spectator: (m) => {
            const betOp = m.operations?.find((o) => o.key === "total_bets");
            const bettorOp = m.operations?.find((o) => o.key === "active_bettors");
            const redOp = m.operations?.find((o) => o.key === "reward_redemptions");
            return betOp
              ? `${formatNumber(betOp.value)} wagers (${bettorOp?.value || 0} punters · ${redOp?.value || 0} claims)`
              : "—";
          }
        },
        customTotal: "By role",
        link: "/admin/rewards"
      }
    ];

    return rows;
  }, [totals]);

  // Filtered rows
  const filteredRows = useMemo(() => {
    return rowDefinitions.filter((row) => {
      // Category filter
      if (activeCategory !== "all" && row.category !== activeCategory) {
        return false;
      }
      // Search query filter
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const matchesLabel = row.label.toLowerCase().includes(query);
        const matchesSublabel = row.sublabel?.toLowerCase().includes(query);
        const matchesBadge = row.badge?.toLowerCase().includes(query);
        if (!matchesLabel && !matchesSublabel && !matchesBadge) {
          return false;
        }
      }
      // Zero row filter
      if (hideZeroRows) {
        if (row.getTotal) {
          const totalVal = row.getTotal();
          if (!totalVal || totalVal === 0) return false;
        }
      }
      return true;
    });
  }, [rowDefinitions, activeCategory, searchQuery, hideZeroRows]);

  const activeVisibleRoleCount = Object.values(visibleRoles).filter(Boolean).length;

  return (
    <article className="admin-role-matrix-container">
      {/* HEADER WITH TITLE & FILTER CONTROLS */}
      <header className="admin-role-matrix-header">
        <div className="admin-role-matrix-title-group">
          <div className="admin-role-matrix-eyebrow">
            <Sparkles size={14} className="admin-icon-accent" />
            <span>Role Analytics Matrix</span>
          </div>
          <h2>Role-Based Operations & Performance Matrix</h2>
          <p>
            Cross-compare user volume, commercial cash flow, wagering exposure, and specialized domain operations
            across all 4 active platform roles.
          </p>
        </div>

        <div className="admin-role-matrix-actions">
          {/* Search Box */}
          <div className="admin-matrix-search">
            <Search size={15} />
            <input
              type="text"
              placeholder="Filter metrics by name..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              aria-label="Filter metrics by name"
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
              className={`admin-filter-btn${showRoleSelector ? " is-active" : ""}`}
              onClick={() => setShowRoleSelector(!showRoleSelector)}
              aria-expanded={showRoleSelector}
            >
              <Filter size={15} />
              <span>Role Columns ({activeVisibleRoleCount}/4)</span>
            </button>

            {showRoleSelector && (
              <div className="admin-matrix-dropdown">
                <div className="admin-matrix-dropdown__header">
                  <strong>Visible Role Columns</strong>
                  <div className="admin-matrix-dropdown__quick-btns">
                    <button type="button" onClick={() => selectAllRoles(true)}>
                      Show all
                    </button>
                    <span>·</span>
                    <button type="button" onClick={() => selectAllRoles(false)}>
                      Hide all
                    </button>
                  </div>
                </div>
                <div className="admin-matrix-dropdown__list">
                  {roles.map((r) => {
                    const Icon = ROLE_ICONS[r.role_name] || Users;
                    const isChecked = !!visibleRoles[r.role_name];
                    const meta = ROLE_META_OVERRIDES[r.role_name] || {
                      label: r.label,
                      badge: r.badge,
                      description: r.description
                    };
                    return (
                      <label key={r.role_name} className="admin-matrix-checkbox-item">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => toggleRole(r.role_name)}
                        />
                        <span className="admin-role-dot" style={{ backgroundColor: r.color }} />
                        <Icon size={14} style={{ color: r.color }} />
                        <span className="admin-matrix-checkbox-label">
                          <strong>{meta.label}</strong>
                          <small>{meta.badge}</small>
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
            title="Hide rows with zero totals"
          >
            {hideZeroRows ? <EyeOff size={15} /> : <Eye size={15} />}
            <span>{hideZeroRows ? "Active rows only" : "Show all rows"}</span>
          </button>
        </div>
      </header>

      {/* CATEGORY TABS FILTER */}
      <nav className="admin-matrix-categories" aria-label="Metric category filter">
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

      {/* MATRIX TABLE */}
      <div className="admin-matrix-table-wrapper">
        <table className="admin-matrix-table">
          <thead>
            <tr>
              <th className="admin-matrix-col--metric">
                <div className="admin-matrix-col-header">
                  <span>Performance Metric</span>
                  <small>Grouped by Role Activity</small>
                </div>
              </th>

              {/* Dynamic Role Columns */}
              {roles.map((r) => {
                if (!visibleRoles[r.role_name]) return null;
                const Icon = ROLE_ICONS[r.role_name] || Users;
                const meta = ROLE_META_OVERRIDES[r.role_name] || {
                  label: r.label,
                  badge: r.badge,
                  description: r.description
                };

                return (
                  <th key={r.role_name} className="admin-matrix-col--role">
                    <div className="admin-role-header-cell">
                      <div className="admin-role-header-top">
                        <span
                          className="admin-role-icon-box"
                          style={{
                            color: r.color,
                            backgroundColor: `rgba(${r.accent_rgb || "120,120,120"}, 0.15)`
                          }}
                        >
                          <Icon size={16} />
                        </span>
                        <span
                          className="admin-role-badge-pill"
                          style={{
                            borderColor: `rgba(${r.accent_rgb || "120,120,120"}, 0.3)`,
                            color: r.color
                          }}
                        >
                          {meta.badge}
                        </span>
                      </div>
                      <strong className="admin-role-title">{meta.label}</strong>
                      <small className="admin-role-desc">{meta.description}</small>
                    </div>
                  </th>
                );
              })}

              {/* Total / System Summary Column */}
              <th className="admin-matrix-col--total">
                <div className="admin-role-header-cell admin-role-header-cell--total">
                  <div className="admin-role-header-top">
                    <span className="admin-role-icon-box admin-role-icon-box--total">
                      <Sparkles size={16} />
                    </span>
                    <span className="admin-role-badge-pill admin-role-badge-pill--total">System Aggregate</span>
                  </div>
                  <strong className="admin-role-title">System Total</strong>
                  <small className="admin-role-desc">Consolidated across all 4 roles</small>
                </div>
              </th>
            </tr>
          </thead>

          <tbody>
            {filteredRows.length === 0 ? (
              <tr>
                <td colSpan={activeVisibleRoleCount + 2} className="admin-matrix-empty-row">
                  <div className="admin-matrix-empty-state">
                    <Filter size={24} />
                    <strong>No metrics matching the selected filters</strong>
                    <p>Try modifying your search term or switching to another category tab.</p>
                    <button
                      type="button"
                      className="admin-header__button admin-header__button--ghost"
                      onClick={() => {
                        setActiveCategory("all");
                        setSearchQuery("");
                        setHideZeroRows(false);
                      }}
                    >
                      Reset filters
                    </button>
                  </div>
                </td>
              </tr>
            ) : (
              filteredRows.map((row) => {
                const isHighlight = row.highlight;
                const totalVal = row.getTotal ? row.getTotal() : row.customTotal;
                const isTotalZero = typeof totalVal === "number" && totalVal === 0;

                return (
                  <tr
                    key={row.id}
                    className={`admin-matrix-row admin-matrix-row--${row.category}${isHighlight ? " is-highlight" : ""}`}
                  >
                    {/* Metric Label Cell */}
                    <td className="admin-matrix-cell--metric">
                      <div className="admin-metric-cell-content">
                        <div className="admin-metric-cell-heading">
                          <span className="admin-metric-badge">{row.badge}</span>
                          <strong>{row.label}</strong>
                          {row.link && (
                            <Link to={row.link} className="admin-metric-link" title="Open related module">
                              <ArrowRight size={13} />
                            </Link>
                          )}
                        </div>
                        {row.sublabel && <small className="admin-metric-sublabel">{row.sublabel}</small>}
                      </div>
                    </td>

                    {/* Role Value Cells */}
                    {roles.map((r) => {
                      if (!visibleRoles[r.role_name]) return null;

                      let cellDisplay = "—";
                      let isZero = false;
                      let isAlert = false;

                      if (row.customCells) {
                        const customFn = row.customCells[r.role_name];
                        cellDisplay = customFn ? customFn(r.metrics) : "—";
                      } else if (row.getValue) {
                        const rawVal = row.getValue(r.metrics);
                        isZero = !rawVal || rawVal === 0;
                        if (row.isAlert && row.isAlert(rawVal)) {
                          isAlert = true;
                        }
                        cellDisplay =
                          isZero &&
                          r.role_name !== "spectator" &&
                          row.category === "financials" &&
                          (row.id === "tokens_wagered" || row.id === "payout_tokens" || row.id === "gross_margin")
                            ? "N/A"
                            : row.formatter
                            ? row.formatter(rawVal)
                            : formatNumber(rawVal);
                      }

                      return (
                        <td
                          key={r.role_name}
                          className={`admin-matrix-cell--value${isAlert ? " is-alert-cell" : ""}${isZero ? " is-dimmed" : ""}`}
                        >
                          <span className="admin-cell-value-text">{cellDisplay}</span>
                        </td>
                      );
                    })}

                    {/* Total Cell */}
                    <td className={`admin-matrix-cell--total-val${isTotalZero ? " is-dimmed" : ""}`}>
                      <strong className="admin-total-value-text">
                        {row.customTotal
                          ? row.customTotal
                          : row.formatter
                          ? row.formatter(totalVal)
                          : formatNumber(totalVal)}
                      </strong>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* FOOTER SUMMARY & QUICK LEGEND */}
      <footer className="admin-role-matrix-footer">
        <div className="admin-matrix-footer-info">
          <CheckCircle2 size={15} />
          <span>
            Aggregated live from verified records across <code>users</code>, <code>roles</code>,{" "}
            <code>deposit_requests</code>, <code>bets</code>, and <code>prize_awards</code>.
          </span>
        </div>

        <div className="admin-matrix-quick-links">
          <Link to="/admin/users">
            <span>User Management</span>
            <ChevronRight size={14} />
          </Link>
          <Link to="/admin/role-applications">
            <span>Role Queue</span>
            <ChevronRight size={14} />
          </Link>
          <Link to="/admin/deposits">
            <span>Deposit Audits</span>
            <ChevronRight size={14} />
          </Link>
        </div>
      </footer>
    </article>
  );
}
