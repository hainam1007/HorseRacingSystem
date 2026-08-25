import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { adminApi } from "../api/adminApi";
import {
  Activity,
  AlertTriangle,
  Award,
  Calendar,
  CheckCircle2,
  ChevronRight,
  CircleDollarSign,
  Crown,
  Eye,
  Filter,
  HeartPulse,
  Info,
  Medal,
  Percent,
  PlusCircle,
  Scale,
  Search,
  Shield,
  ShieldAlert,
  Sparkles,
  Trophy,
  User,
  Users,
  X,
  Zap
} from "lucide-react";

const formatNumber = (val) => new Intl.NumberFormat("en-US").format(Number(val || 0));
const formatVND = (val) =>
  new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND", maximumFractionDigits: 0 }).format(
    Number(val || 0)
  );
const formatDate = (val) => {
  if (!val) return "—";
  const d = new Date(val);
  return d.toLocaleDateString("en-US", { day: "2-digit", month: "short", year: "numeric" });
};

export default function AdminEquineJockeyTable({ equineDirectory, isLoading }) {
  const [activeTab, setActiveTab] = useState("horses"); // 'horses' | 'jockeys' | 'pairings'
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all"); // 'all' | 'active' | 'suspended_resting'
  const [sortBy, setSortBy] = useState("rating_wins"); // 'rating_wins' | 'races' | 'name'
  const [internalData, setInternalData] = useState(null);

  // Selected item for rich modal
  const [selectedHorse, setSelectedHorse] = useState(null);
  const [selectedJockey, setSelectedJockey] = useState(null);

  useEffect(() => {
    if (!equineDirectory) {
      adminApi.getEquineDirectory().then((res) => {
        if (res) setInternalData(res);
      }).catch(() => {});
    }
  }, [equineDirectory]);

  const effectiveData = equineDirectory || internalData;

  const horses = useMemo(() => effectiveData?.horses || [], [effectiveData]);
  const jockeys = useMemo(() => effectiveData?.jockeys || [], [effectiveData]);
  const pairings = useMemo(() => effectiveData?.recent_pairings || [], [effectiveData]);

  // Filtered and sorted Horses
  const filteredHorses = useMemo(() => {
    return horses
      .filter((h) => {
        if (statusFilter === "active" && h.status !== "active") return false;
        if (statusFilter === "suspended_resting" && h.status === "active") return false;

        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase();
          const matchesName = h.name?.toLowerCase().includes(q);
          const matchesReg = h.registration_number?.toLowerCase().includes(q);
          const matchesBreed = h.breed?.toLowerCase().includes(q);
          const matchesOwner = h.owner_name?.toLowerCase().includes(q);
          if (!matchesName && !matchesReg && !matchesBreed && !matchesOwner) return false;
        }
        return true;
      })
      .sort((a, b) => {
        if (sortBy === "rating_wins") return (b.current_rating || 0) - (a.current_rating || 0);
        if (sortBy === "races") return (b.career_races || 0) - (a.career_races || 0);
        if (sortBy === "name") return (a.name || "").localeCompare(b.name || "");
        return 0;
      });
  }, [horses, statusFilter, searchQuery, sortBy]);

  // Filtered and sorted Jockeys
  const filteredJockeys = useMemo(() => {
    return jockeys
      .filter((j) => {
        if (statusFilter === "active" && j.status !== "active") return false;
        if (statusFilter === "suspended_resting" && j.disciplinary_status !== "suspended") return false;

        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase();
          const matchesName = j.name?.toLowerCase().includes(q);
          const matchesLic = j.license_number?.toLowerCase().includes(q);
          const matchesEmail = j.email?.toLowerCase().includes(q);
          if (!matchesName && !matchesLic && !matchesEmail) return false;
        }
        return true;
      })
      .sort((a, b) => {
        if (sortBy === "rating_wins") return (b.total_wins || 0) - (a.total_wins || 0);
        if (sortBy === "races") return (b.total_races || 0) - (a.total_races || 0);
        if (sortBy === "name") return (a.name || "").localeCompare(b.name || "");
        return 0;
      });
  }, [jockeys, statusFilter, searchQuery, sortBy]);

  // Filtered Pairings
  const filteredPairings = useMemo(() => {
    return pairings.filter((p) => {
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      return (
        p.horse_name?.toLowerCase().includes(q) ||
        p.jockey_name?.toLowerCase().includes(q) ||
        p.tournament_title?.toLowerCase().includes(q)
      );
    });
  }, [pairings, searchQuery]);

  return (
    <article className="admin-equine-directory-container">
      {/* HEADER WITH TITLE & STATS */}
      <header className="admin-role-matrix-header">
        <div className="admin-role-matrix-title-group">
          <div className="admin-role-matrix-eyebrow">
            <Trophy size={14} className="admin-icon-accent" />
            <span>Equine & Jockey Registry</span>
          </div>
          <h2>Equine & Jockey Performance Directory</h2>
          <p>
            Monitor verified horse pedigrees, jockey competitive records, career win rates, and live race pairings
            across all stables.
          </p>
        </div>

        <div className="admin-role-matrix-actions">
          {/* Search Box */}
          <div className="admin-matrix-search">
            <Search size={15} />
            <input
              type="text"
              placeholder={
                activeTab === "horses"
                  ? "Search by horse name, code, breed, owner..."
                  : activeTab === "jockeys"
                  ? "Search by jockey name, license, email..."
                  : "Search pairings by horse or jockey..."
              }
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              aria-label="Search directory"
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

          {/* Status Filter Dropdown / Pill */}
          <select
            className="admin-filter-select"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            aria-label="Filter status"
          >
            <option value="all">All Statuses</option>
            <option value="active">Active Standing Only</option>
            <option value="suspended_resting">
              {activeTab === "jockeys" ? "Suspended Riders" : "Inactive / Resting"}
            </option>
          </select>

          {/* Sort By Dropdown */}
          <select
            className="admin-filter-select"
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            aria-label="Sort by"
          >
            <option value="rating_wins">
              {activeTab === "horses" ? "Sort by Rating (Highest)" : "Sort by Wins (Highest)"}
            </option>
            <option value="races">Sort by Total Races</option>
            <option value="name">Sort by Name (A-Z)</option>
          </select>
        </div>
      </header>

      {/* TABS SELECTOR (HORSES / JOCKEYS / PAIRINGS) */}
      <nav className="admin-matrix-categories" aria-label="Directory mode tabs">
        <button
          type="button"
          className={`admin-matrix-category-tab${activeTab === "horses" ? " is-active" : ""}`}
          onClick={() => {
            setActiveTab("horses");
            setSearchQuery("");
          }}
        >
          <Award size={15} />
          <span>Horses Directory</span>
          <span className="admin-matrix-tab-count">{horses.length}</span>
        </button>

        <button
          type="button"
          className={`admin-matrix-category-tab${activeTab === "jockeys" ? " is-active" : ""}`}
          onClick={() => {
            setActiveTab("jockeys");
            setSearchQuery("");
          }}
        >
          <Trophy size={15} />
          <span>Jockeys Roster</span>
          <span className="admin-matrix-tab-count">{jockeys.length}</span>
        </button>

        <button
          type="button"
          className={`admin-matrix-category-tab${activeTab === "pairings" ? " is-active" : ""}`}
          onClick={() => {
            setActiveTab("pairings");
            setSearchQuery("");
          }}
        >
          <Sparkles size={15} />
          <span>Recent Race Pairings</span>
          <span className="admin-matrix-tab-count">{pairings.length}</span>
        </button>
      </nav>

      {/* MAIN DATA TABLE */}
      <div className="admin-matrix-table-wrapper">
        {/* ================= MODE 1: HORSES TABLE ================= */}
        {activeTab === "horses" && (
          <table className="admin-matrix-table admin-directory-table">
            <thead>
              <tr>
                <th>Horse Profile & Code</th>
                <th>Breed / Color</th>
                <th>Official Rating</th>
                <th>Owner / Stable</th>
                <th>Career Record</th>
                <th>Prize Purse</th>
                <th>Health Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredHorses.length === 0 ? (
                <tr>
                  <td colSpan={8} className="admin-matrix-empty-row">
                    <div className="admin-matrix-empty-state">
                      <Filter size={24} />
                      <strong>No horses matching the selected criteria</strong>
                      <p>Try modifying your search query or status filter.</p>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredHorses.map((h) => (
                  <tr
                    key={h.id}
                    className="admin-matrix-row admin-directory-row"
                    onClick={() => setSelectedHorse(h)}
                  >
                    <td>
                      <div className="admin-profile-cell">
                        <div className="admin-horse-avatar-box">
                          {h.image_url ? (
                            <img src={h.image_url} alt={h.name} className="admin-avatar-img" />
                          ) : (
                            <Award size={18} />
                          )}
                        </div>
                        <div>
                          <strong className="admin-profile-name">{h.name}</strong>
                          <code className="admin-profile-code">{h.registration_number}</code>
                        </div>
                      </div>
                    </td>
                    <td>
                      <span className="admin-dim-text">{h.breed}</span>
                      <small className="admin-subtext">{h.gender} · {h.color}</small>
                    </td>
                    <td>
                      <div className="admin-rating-badge">
                        <Zap size={13} className="admin-icon-accent" />
                        <strong>{h.current_rating}</strong>
                        <span className="admin-dim-text">/140</span>
                      </div>
                    </td>
                    <td>
                      <strong>{h.owner_name}</strong>
                      <small className="admin-subtext">{h.owner_email}</small>
                    </td>
                    <td>
                      <div className="admin-record-stack">
                        <strong>
                          {h.career_wins} wins / {h.career_races} races
                        </strong>
                        <small className="admin-highlight-text">
                          {h.win_rate} Win · {h.podium_finishes} Podiums
                        </small>
                      </div>
                    </td>
                    <td>
                      <strong className="admin-prize-vnd">{formatVND(h.prize_earned_vnd)}</strong>
                    </td>
                    <td>
                      <span
                        className={`admin-status-pill admin-status-pill--${
                          h.health_status === "healthy" ? "success" : "warning"
                        }`}
                      >
                        {h.health_status || "Healthy"}
                      </span>
                    </td>
                    <td>
                      <button
                        type="button"
                        className="admin-table-action-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedHorse(h);
                        }}
                      >
                        <Eye size={14} />
                        <span>Profile</span>
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}

        {/* ================= MODE 2: JOCKEYS TABLE ================= */}
        {activeTab === "jockeys" && (
          <table className="admin-matrix-table admin-directory-table">
            <thead>
              <tr>
                <th>Jockey Profile</th>
                <th>License & Experience</th>
                <th>Physical Stats</th>
                <th>Career Record</th>
                <th>Win Strike Rate</th>
                <th>Prize Purse (VND)</th>
                <th>Disciplinary Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredJockeys.length === 0 ? (
                <tr>
                  <td colSpan={8} className="admin-matrix-empty-row">
                    <div className="admin-matrix-empty-state">
                      <Filter size={24} />
                      <strong>No jockeys matching the selected criteria</strong>
                      <p>Try modifying your search query or status filter.</p>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredJockeys.map((j) => (
                  <tr
                    key={j.id}
                    className="admin-matrix-row admin-directory-row"
                    onClick={() => setSelectedJockey(j)}
                  >
                    <td>
                      <div className="admin-profile-cell">
                        <div className="admin-jockey-avatar-box">
                          {j.avatar_url ? (
                            <img src={j.avatar_url} alt={j.name} className="admin-avatar-img" />
                          ) : (
                            <User size={18} />
                          )}
                        </div>
                        <div>
                          <strong className="admin-profile-name">{j.name}</strong>
                          <small className="admin-subtext">{j.email}</small>
                        </div>
                      </div>
                    </td>
                    <td>
                      <code className="admin-profile-code">{j.license_number}</code>
                      <small className="admin-subtext">{j.experience_years} years experience</small>
                    </td>
                    <td>
                      <span>{j.height} cm</span> · <strong>{j.weight_kg} kg</strong>
                    </td>
                    <td>
                      <strong>
                        {j.total_wins} wins / {j.total_races} races
                      </strong>
                    </td>
                    <td>
                      <span className="admin-win-rate-pill">{j.win_rate}</span>
                    </td>
                    <td>
                      <strong className="admin-prize-vnd">{formatVND(j.prize_earned_vnd)}</strong>
                    </td>
                    <td>
                      <span
                        className={`admin-status-pill admin-status-pill--${
                          j.disciplinary_status === "clear" ? "success" : "danger"
                        }`}
                      >
                        {j.disciplinary_status === "clear" ? "Clear" : "Suspended"}
                      </span>
                    </td>
                    <td>
                      <button
                        type="button"
                        className="admin-table-action-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedJockey(j);
                        }}
                      >
                        <Eye size={14} />
                        <span>Profile</span>
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}

        {/* ================= MODE 3: PAIRINGS TABLE ================= */}
        {activeTab === "pairings" && (
          <table className="admin-matrix-table admin-directory-table">
            <thead>
              <tr>
                <th>Tournament & Race</th>
                <th>Horse Assigned</th>
                <th>Jockey Booked</th>
                <th>Race Date</th>
                <th>Booking Status</th>
              </tr>
            </thead>
            <tbody>
              {filteredPairings.length === 0 ? (
                <tr>
                  <td colSpan={5} className="admin-matrix-empty-row">
                    <div className="admin-matrix-empty-state">
                      <Filter size={24} />
                      <strong>No race pairings found</strong>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredPairings.map((p) => (
                  <tr key={p.id} className="admin-matrix-row">
                    <td>
                      <strong>{p.tournament_title}</strong>
                      <small className="admin-subtext">Race #{p.race_number}</small>
                    </td>
                    <td>
                      <div className="admin-profile-cell">
                        <Award size={16} className="admin-icon-accent" />
                        <div>
                          <strong>{p.horse_name}</strong>
                          <code className="admin-profile-code">{p.horse_reg}</code>
                        </div>
                      </div>
                    </td>
                    <td>
                      <div className="admin-profile-cell">
                        <User size={16} />
                        <strong>{p.jockey_name}</strong>
                      </div>
                    </td>
                    <td>
                      <span>{formatDate(p.race_date)}</span>
                    </td>
                    <td>
                      <span className="admin-status-pill admin-status-pill--success">
                        {p.status || "Confirmed"}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}
      </div>

      {/* FOOTER & ACTIONS */}
      <footer className="admin-role-matrix-footer">
        <div className="admin-matrix-footer-info">
          <CheckCircle2 size={15} />
          <span>
            Equine directory synchronized with official veterinary inspections and jockey license records. Click any
            row to open full career statistics.
          </span>
        </div>

        <div className="admin-matrix-quick-links">
          <Link to="/admin/tournament">
            <span>Tournament Registrations</span>
            <ChevronRight size={14} />
          </Link>
        </div>
      </footer>

      {/* ================= MODAL: HORSE PROFILE DETAIL ================= */}
      {selectedHorse && (
        <div
          className="admin-modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-labelledby="horse-modal-title"
          onClick={() => setSelectedHorse(null)}
        >
          <div className="admin-detail-modal" onClick={(e) => e.stopPropagation()}>
            <header className="admin-detail-modal__header">
              <div className="admin-profile-cell">
                <div className="admin-horse-avatar-box admin-horse-avatar-box--large">
                  {selectedHorse.image_url ? (
                    <img src={selectedHorse.image_url} alt={selectedHorse.name} className="admin-avatar-img" />
                  ) : (
                    <Award size={28} />
                  )}
                </div>
                <div>
                  <div className="admin-role-matrix-eyebrow">
                    <Award size={14} />
                    <span>Equine Pedigree Profile</span>
                  </div>
                  <h3 id="horse-modal-title">{selectedHorse.name}</h3>
                  <code className="admin-profile-code">{selectedHorse.registration_number}</code>
                </div>
              </div>
              <button
                type="button"
                className="admin-detail-modal__close"
                onClick={() => setSelectedHorse(null)}
                aria-label="Close modal"
              >
                <X size={18} />
              </button>
            </header>

            {/* KPI Mini Summary */}
            <div className="admin-detail-kpi-grid">
              <div className="admin-detail-kpi-card">
                <span>Official Rating</span>
                <strong>{selectedHorse.current_rating} / 140</strong>
              </div>
              <div className="admin-detail-kpi-card">
                <span>Career Record</span>
                <strong>
                  {selectedHorse.career_wins} Wins ({selectedHorse.career_races} Races)
                </strong>
              </div>
              <div className="admin-detail-kpi-card">
                <span>Win Strike Rate</span>
                <strong>{selectedHorse.win_rate}</strong>
              </div>
              <div className="admin-detail-kpi-card">
                <span>Prize Purse Won</span>
                <strong>{formatVND(selectedHorse.prize_earned_vnd)}</strong>
              </div>
            </div>

            {/* Horse Bio Details Grid */}
            <div className="admin-equine-bio-grid">
              <div className="admin-bio-item">
                <span className="admin-bio-label">Breed</span>
                <strong>{selectedHorse.breed || "Thoroughbred"}</strong>
              </div>
              <div className="admin-bio-item">
                <span className="admin-bio-label">Gender & Color</span>
                <strong>
                  {selectedHorse.gender} · {selectedHorse.color}
                </strong>
              </div>
              <div className="admin-bio-item">
                <span className="admin-bio-label">Body Weight</span>
                <strong>{selectedHorse.weight} kg</strong>
              </div>
              <div className="admin-bio-item">
                <span className="admin-bio-label">Date of Birth</span>
                <strong>{formatDate(selectedHorse.date_of_birth)}</strong>
              </div>
              <div className="admin-bio-item">
                <span className="admin-bio-label">Registered Owner</span>
                <strong>{selectedHorse.owner_name}</strong>
                <small className="admin-subtext">{selectedHorse.owner_email}</small>
              </div>
              <div className="admin-bio-item">
                <span className="admin-bio-label">Health Inspections</span>
                <span className="admin-status-pill admin-status-pill--success">
                  {selectedHorse.health_checks_count} Checks Passed ({selectedHorse.health_status})
                </span>
              </div>
            </div>

            <footer className="admin-detail-modal__footer">
              <span>Status: Active In Roster</span>
              <button
                type="button"
                className="admin-header__button admin-header__button--ghost"
                onClick={() => setSelectedHorse(null)}
              >
                Close
              </button>
            </footer>
          </div>
        </div>
      )}

      {/* ================= MODAL: JOCKEY PROFILE DETAIL ================= */}
      {selectedJockey && (
        <div
          className="admin-modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-labelledby="jockey-modal-title"
          onClick={() => setSelectedJockey(null)}
        >
          <div className="admin-detail-modal" onClick={(e) => e.stopPropagation()}>
            <header className="admin-detail-modal__header">
              <div className="admin-profile-cell">
                <div className="admin-jockey-avatar-box admin-jockey-avatar-box--large">
                  {selectedJockey.avatar_url ? (
                    <img src={selectedJockey.avatar_url} alt={selectedJockey.name} className="admin-avatar-img" />
                  ) : (
                    <User size={28} />
                  )}
                </div>
                <div>
                  <div className="admin-role-matrix-eyebrow">
                    <Trophy size={14} />
                    <span>Jockey Competitive Record</span>
                  </div>
                  <h3 id="jockey-modal-title">{selectedJockey.name}</h3>
                  <code className="admin-profile-code">{selectedJockey.license_number}</code>
                </div>
              </div>
              <button
                type="button"
                className="admin-detail-modal__close"
                onClick={() => setSelectedJockey(null)}
                aria-label="Close modal"
              >
                <X size={18} />
              </button>
            </header>

            {/* KPI Mini Summary */}
            <div className="admin-detail-kpi-grid">
              <div className="admin-detail-kpi-card">
                <span>First-Place Wins</span>
                <strong>{selectedJockey.total_wins} Wins</strong>
              </div>
              <div className="admin-detail-kpi-card">
                <span>Total Races Ridden</span>
                <strong>{selectedJockey.total_races} Rides</strong>
              </div>
              <div className="admin-detail-kpi-card">
                <span>Win Strike Rate</span>
                <strong>{selectedJockey.win_rate}</strong>
              </div>
              <div className="admin-detail-kpi-card">
                <span>Prize Purse Won</span>
                <strong>{formatVND(selectedJockey.prize_earned_vnd)}</strong>
              </div>
            </div>

            {/* Jockey Bio Details Grid */}
            <div className="admin-equine-bio-grid">
              <div className="admin-bio-item">
                <span className="admin-bio-label">Experience</span>
                <strong>{selectedJockey.experience_years} Years Active</strong>
              </div>
              <div className="admin-bio-item">
                <span className="admin-bio-label">Height & Weight</span>
                <strong>
                  {selectedJockey.height} cm · {selectedJockey.weight_kg} kg
                </strong>
              </div>
              <div className="admin-bio-item">
                <span className="admin-bio-label">Account Email & Phone</span>
                <strong>{selectedJockey.email}</strong>
                <small className="admin-subtext">{selectedJockey.phone}</small>
              </div>
              <div className="admin-bio-item">
                <span className="admin-bio-label">Active Bookings</span>
                <strong>{selectedJockey.assigned_races_count} Races Booked</strong>
              </div>
              <div className="admin-bio-item">
                <span className="admin-bio-label">Disciplinary Record</span>
                <span
                  className={`admin-status-pill admin-status-pill--${
                    selectedJockey.disciplinary_status === "clear" ? "success" : "danger"
                  }`}
                >
                  {selectedJockey.disciplinary_status === "clear"
                    ? "Clear Disciplinary Standing"
                    : "Suspended Rider"}
                </span>
              </div>
              <div className="admin-bio-item">
                <span className="admin-bio-label">Recorded Infractions</span>
                <strong>{selectedJockey.violation_count} Logged Violations</strong>
              </div>
            </div>

            <footer className="admin-detail-modal__footer">
              <span>Status: Active Professional License</span>
              <button
                type="button"
                className="admin-header__button admin-header__button--ghost"
                onClick={() => setSelectedJockey(null)}
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
