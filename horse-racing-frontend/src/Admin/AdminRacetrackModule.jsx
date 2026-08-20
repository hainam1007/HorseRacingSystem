import { useCallback, useEffect, useMemo, useState } from "react";
import { Archive, Check, MapPin, Pencil, Plus, RefreshCw, Search, X } from "lucide-react";
import { adminApi } from "../api/adminApi";
import AdminLayout from "./AdminLayout";

const breedOptions = ["Thoroughbred", "Warmblood", "Arabian", "Quarter Horse", "Standardbred", "Other"];

const emptyForm = {
  name: "",
  code: "",
  address: "",
  province: "",
  status: "draft",
  rule_type: "horse_weight_range",
  min_kg: "",
  max_kg: "",
  ballast_allowed: false,
  min_years: "",
  max_years: "",
  allowed_values: ["Thoroughbred"],
};

function idOf(value) {
  return String(value?.id || value?._id || value || "");
}

function titleCase(value) {
  return String(value || "unknown").replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function statusTone(status) {
  if (status === "active") return "green";
  if (status === "draft") return "gray";
  return "amber";
}

function racetrackRule(track) {
  return track?.eligibility_rule || {};
}

function describeRule(rule) {
  if (rule?.type === "horse_weight_range") {
    const range = [rule.min_kg, rule.max_kg].every((value) => value !== "" && value !== undefined && value !== null)
      ? `${rule.min_kg}–${rule.max_kg} kg`
      : "Weight range pending";
    return `${range}${rule.ballast_allowed ? " · Ballast permitted" : " · No ballast"}`;
  }
  if (rule?.type === "horse_age_range") {
    const range = [rule.min_years, rule.max_years].every((value) => value !== "" && value !== undefined && value !== null)
      ? `${rule.min_years}–${rule.max_years} years`
      : "Age range pending";
    return range;
  }
  if (rule?.type === "horse_breed") {
    return rule.allowed_values?.length ? rule.allowed_values.join(", ") : "Breed selection pending";
  }
  return "Rule not configured";
}

function formFor(track) {
  if (!track) return { ...emptyForm, allowed_values: [...emptyForm.allowed_values] };
  const rule = racetrackRule(track);
  return {
    name: track.name || "",
    code: track.code || "",
    address: track.address || "",
    province: track.province || "",
    status: track.status || "draft",
    rule_type: rule.type || "horse_weight_range",
    min_kg: rule.min_kg ?? "",
    max_kg: rule.max_kg ?? "",
    ballast_allowed: Boolean(rule.ballast_allowed),
    min_years: rule.min_years ?? "",
    max_years: rule.max_years ?? "",
    allowed_values: Array.isArray(rule.allowed_values) && rule.allowed_values.length ? [...rule.allowed_values] : ["Thoroughbred"],
  };
}

function ruleFromForm(form) {
  if (form.rule_type === "horse_weight_range") {
    return {
      schema_version: 1,
      type: form.rule_type,
      min_kg: form.min_kg === "" ? undefined : Number(form.min_kg),
      max_kg: form.max_kg === "" ? undefined : Number(form.max_kg),
      ballast_allowed: form.ballast_allowed,
    };
  }
  if (form.rule_type === "horse_age_range") {
    return {
      schema_version: 1,
      type: form.rule_type,
      min_years: form.min_years === "" ? undefined : Number(form.min_years),
      max_years: form.max_years === "" ? undefined : Number(form.max_years),
    };
  }
  return { schema_version: 1, type: form.rule_type, allowed_values: form.allowed_values };
}

function racetrackPayload(form) {
  const rule = ruleFromForm(form);
  if (!form.name.trim() || !form.code.trim()) throw new Error("Name and code are required.");
  if (rule.type === "horse_weight_range" && (!Number.isFinite(rule.min_kg) || !Number.isFinite(rule.max_kg) || rule.min_kg < 0 || rule.min_kg > rule.max_kg)) {
    throw new Error("Enter a valid weight range where the minimum does not exceed the maximum.");
  }
  if (rule.type === "horse_age_range" && (!Number.isInteger(rule.min_years) || !Number.isInteger(rule.max_years) || rule.min_years < 0 || rule.min_years > rule.max_years)) {
    throw new Error("Enter a valid whole-year age range where the minimum does not exceed the maximum.");
  }
  if (rule.type === "horse_breed" && !rule.allowed_values.length) throw new Error("Select at least one eligible breed.");

  return {
    name: form.name.trim(),
    code: form.code.trim().toUpperCase(),
    address: form.address.trim() || null,
    province: form.province.trim() || null,
    country_code: "VN",
    status: form.status,
    eligibility_rule: rule,
  };
}

function StatusBadge({ value }) {
  return <span className={`admin-status-badge admin-status-badge--${statusTone(value)}`}>{titleCase(value)}</span>;
}

function RuleEditor({ form, onChange }) {
  const displayedBreedOptions = useMemo(
    () => [...new Set([...breedOptions, ...form.allowed_values])],
    [form.allowed_values],
  );
  const toggleBreed = (breed) => {
    const selected = form.allowed_values.includes(breed);
    onChange("allowed_values", selected ? form.allowed_values.filter((item) => item !== breed) : [...form.allowed_values, breed]);
  };
  const preview = describeRule(ruleFromForm(form));

  return (
    <section className="admin-racetrack__rule-editor" aria-labelledby="racetrack-rule-title">
      <div className="admin-racetrack__section-heading">
        <div><h3 id="racetrack-rule-title">Eligibility rule</h3><p>A race snapshots this rule when it is scheduled.</p></div>
        <span>Rule schema v1</span>
      </div>
      <label className="admin-field">
        <span>Rule type *</span>
        <select value={form.rule_type} onChange={(event) => onChange("rule_type", event.target.value)}>
          <option value="horse_weight_range">Horse weight range</option>
          <option value="horse_age_range">Horse age range</option>
          <option value="horse_breed">Horse breed</option>
        </select>
      </label>

      {form.rule_type === "horse_weight_range" && (
        <div className="admin-racetrack__rule-fields">
          <label className="admin-field"><span>Minimum weight (kg) *</span><input required min="0" step="0.1" type="number" value={form.min_kg} onChange={(event) => onChange("min_kg", event.target.value)} /></label>
          <label className="admin-field"><span>Maximum weight (kg) *</span><input required min="0" step="0.1" type="number" value={form.max_kg} onChange={(event) => onChange("max_kg", event.target.value)} /></label>
          <label className="admin-racetrack__check"><input checked={form.ballast_allowed} type="checkbox" onChange={(event) => onChange("ballast_allowed", event.target.checked)} /><span><strong>Ballast permitted</strong><small>Horses below the minimum may qualify with approved ballast.</small></span></label>
        </div>
      )}

      {form.rule_type === "horse_age_range" && (
        <div className="admin-racetrack__rule-fields">
          <label className="admin-field"><span>Minimum age (years) *</span><input required min="0" step="1" type="number" value={form.min_years} onChange={(event) => onChange("min_years", event.target.value)} /></label>
          <label className="admin-field"><span>Maximum age (years) *</span><input required min="0" step="1" type="number" value={form.max_years} onChange={(event) => onChange("max_years", event.target.value)} /></label>
        </div>
      )}

      {form.rule_type === "horse_breed" && (
        <div className="admin-racetrack__breed-options" role="group" aria-label="Eligible horse breeds">
          {displayedBreedOptions.map((breed) => <label key={breed} className="admin-racetrack__breed-option"><input checked={form.allowed_values.includes(breed)} type="checkbox" onChange={() => toggleBreed(breed)} /><span>{breed}</span></label>)}
        </div>
      )}

      <div className="admin-racetrack__rule-preview"><Check size={16} aria-hidden="true" /><div><span>Race form preview</span><strong>{preview}</strong></div></div>
    </section>
  );
}

function RacetrackForm({ form, track, mode, onChange, onSubmit, onCancel, saving }) {
  const hasLinkedRaces = Number(track?.race_count || 0) > 0;
  return (
    <form className="admin-racetrack__form" onSubmit={onSubmit}>
      <div className="admin-racetrack__section-heading">
        <div><h3>Racetrack details</h3><p>Only active racetracks can be selected when creating a race.</p></div>
        <span>Vietnam</span>
      </div>
      <div className="admin-racetrack__form-grid">
        <label className="admin-field admin-racetrack__field--wide"><span>Name *</span><input autoFocus required value={form.name} onChange={(event) => onChange("name", event.target.value)} placeholder="Phu Tho Racetrack" /></label>
        <label className="admin-field"><span>Code *</span><input required disabled={hasLinkedRaces} maxLength="64" value={form.code} onChange={(event) => onChange("code", event.target.value.toUpperCase())} placeholder="PHU_THO" /></label>
        <label className="admin-field"><span>Province / city</span><input value={form.province} onChange={(event) => onChange("province", event.target.value)} placeholder="Ho Chi Minh City" /></label>
        <label className="admin-field admin-racetrack__field--wide"><span>Address</span><input value={form.address} onChange={(event) => onChange("address", event.target.value)} placeholder="Optional street address" /></label>
        <label className="admin-field"><span>Status *</span><select value={form.status} onChange={(event) => onChange("status", event.target.value)}><option value="draft">Draft</option><option value="active">Active</option><option value="inactive">Inactive</option></select></label>
      </div>
      {hasLinkedRaces && <div className="admin-live-state admin-live-state--warning">The racetrack code is locked because it is already used by {track.race_count} race{Number(track.race_count) === 1 ? "" : "s"}.</div>}
      <RuleEditor form={form} onChange={onChange} />
      <div className="admin-tool-card__footer admin-racetrack__form-actions"><button className="admin-header__button" disabled={saving} type="submit">{saving ? "Saving..." : `${mode === "edit" ? "Save changes" : "Create racetrack"}`}</button><button className="admin-header__button admin-header__button--ghost" disabled={saving} type="button" onClick={onCancel}>Cancel</button></div>
    </form>
  );
}

function AdminRacetrackModule() {
  const [racetracks, setRacetracks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [archiveTarget, setArchiveTarget] = useState(null);
  const [archiving, setArchiving] = useState(false);

  const loadRacetracks = useCallback(async (quiet = false) => {
    quiet ? setRefreshing(true) : setLoading(true);
    setError("");
    try {
      const response = await adminApi.listRacetracks({ status: "all" });
      setRacetracks(response.racetracks || []);
    } catch (apiError) {
      setError(apiError.message || "Unable to load racetracks.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { loadRacetracks(); }, [loadRacetracks]);
  useEffect(() => {
    if (!notice) return undefined;
    const timer = window.setTimeout(() => setNotice(""), 4500);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const filteredRacetracks = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return racetracks.filter((track) => {
      const matchesQuery = !normalizedQuery || [track.name, track.code, track.province, describeRule(racetrackRule(track))].join(" ").toLowerCase().includes(normalizedQuery);
      return matchesQuery && (status === "all" || track.status === status);
    });
  }, [query, racetracks, status]);
  const activeCount = racetracks.filter((track) => track.status === "active").length;
  const draftCount = racetracks.filter((track) => track.status === "draft").length;
  const inactiveCount = racetracks.filter((track) => track.status === "inactive").length;

  const openForm = (track = null) => {
    setForm(formFor(track));
    setError("");
    setModal({ mode: track ? "edit" : "create", track });
  };
  const changeField = (field, value) => setForm((current) => ({ ...current, [field]: value }));
  const submitForm = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const payload = racetrackPayload(form);
      const result = modal.mode === "edit"
        ? await adminApi.updateRacetrack(idOf(modal.track), payload)
        : await adminApi.createRacetrack(payload);
      setModal(null);
      setNotice(`${result.racetrack?.name || payload.name} ${modal.mode === "edit" ? "updated" : "created"}.`);
      await loadRacetracks(true);
    } catch (apiError) {
      setError(apiError.message || "Unable to save racetrack.");
    } finally {
      setSaving(false);
    }
  };
  const archiveRacetrack = async () => {
    setArchiving(true);
    setError("");
    try {
      await adminApi.archiveRacetrack(idOf(archiveTarget));
      setArchiveTarget(null);
      setNotice(`${archiveTarget.name} archived. It can no longer be selected for new races.`);
      await loadRacetracks(true);
    } catch (apiError) {
      setError(apiError.message || "Unable to archive racetrack.");
    } finally {
      setArchiving(false);
    }
  };

  return (
    <AdminLayout
      eyebrow="Competition directory"
      title="Racetracks"
      description="Maintain approved venues and the eligibility rule inherited by every race created there."
      actions={<><button className="admin-header__button admin-header__button--ghost" disabled={refreshing} type="button" onClick={() => loadRacetracks(true)}><RefreshCw size={16} className={refreshing ? "is-spinning" : ""} aria-hidden="true" /> Refresh</button><button className="admin-header__button" type="button" onClick={() => openForm()}><Plus size={16} aria-hidden="true" /> New racetrack</button></>}
    >
      <div className="admin-racetrack">
        {error && !modal && <div className="admin-live-state admin-live-state--warning">{error}</div>}
        {notice && <div className="admin-live-state">{notice}</div>}
        <section className="admin-racetrack__metrics" aria-label="Racetrack status overview">
          <div className="admin-metric-card"><span>Total venues</span><strong>{racetracks.length}</strong><small>Configured in the directory</small></div>
          <div className="admin-metric-card"><span>Active</span><strong>{activeCount}</strong><small>Available in the race form</small></div>
          <div className="admin-metric-card"><span>Draft</span><strong>{draftCount}</strong><small>Not yet selectable</small></div>
          <div className="admin-metric-card"><span>Inactive</span><strong>{inactiveCount}</strong><small>Archived or retired</small></div>
        </section>
        <section className="admin-panel admin-racetrack__ledger">
          <div className="admin-panel__header admin-racetrack__ledger-heading"><div><p className="admin-panel__eyebrow">Venue ledger</p><h2>Racetrack catalogue</h2><span>{filteredRacetracks.length} matching record{filteredRacetracks.length === 1 ? "" : "s"}</span></div></div>
          <div className="admin-racetrack__toolbar">
            <label className="admin-racetrack__search"><Search size={16} aria-hidden="true" /><span className="sr-only">Search racetracks</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search name, code, province, or rule" /></label>
            <label className="admin-field admin-racetrack__filter"><span>Status</span><select value={status} onChange={(event) => setStatus(event.target.value)}><option value="all">All statuses</option><option value="active">Active</option><option value="draft">Draft</option><option value="inactive">Inactive</option></select></label>
          </div>
          {loading ? <div className="admin-racetrack__empty">Loading racetracks…</div> : !filteredRacetracks.length ? <div className="admin-racetrack__empty"><MapPin size={28} aria-hidden="true" /><div><h3>No racetracks found</h3><p>Create a racetrack or adjust the current filters.</p></div></div> : <div className="admin-data-table__wrap"><table className="admin-data-table admin-racetrack__table"><thead><tr><th>Racetrack</th><th>Province</th><th>Status</th><th>Current eligibility rule</th><th>Rule version</th><th>Races</th><th>Actions</th></tr></thead><tbody>{filteredRacetracks.map((track) => <tr key={idOf(track)}><td><strong>{track.name}</strong><small>{track.code}</small></td><td>{track.province || "—"}</td><td><StatusBadge value={track.status} /></td><td><span className="admin-racetrack__rule"><strong>{titleCase(racetrackRule(track).type)}</strong><small>{describeRule(racetrackRule(track))}</small></span></td><td>v{track.rule_version || 1}</td><td>{Number(track.race_count || 0)}</td><td><div className="admin-racetrack__row-actions"><button type="button" onClick={() => openForm(track)}><Pencil size={15} aria-hidden="true" /> Edit</button>{track.status !== "inactive" && <button type="button" onClick={() => setArchiveTarget(track)}><Archive size={15} aria-hidden="true" /> Archive</button>}</div></td></tr>)}</tbody></table></div>}
        </section>
      </div>

      {modal && <div className="admin-modal" role="dialog" aria-modal="true" aria-labelledby="racetrack-form-title" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) setModal(null); }}><div className="admin-modal__card admin-racetrack__modal"><div className="admin-panel__header admin-racetrack__modal-header"><div><p className="admin-panel__eyebrow">{modal.mode === "edit" ? "Edit venue" : "New venue"}</p><h2 id="racetrack-form-title">{modal.mode === "edit" ? modal.track.name : "Create racetrack"}</h2></div><button aria-label="Close racetrack form" className="admin-racetrack__modal-close" disabled={saving} type="button" onClick={() => setModal(null)}><X size={18} aria-hidden="true" /></button></div>{error && <div className="admin-live-state admin-live-state--warning">{error}</div>}<RacetrackForm form={form} mode={modal.mode} track={modal.track} onChange={changeField} onSubmit={submitForm} onCancel={() => setModal(null)} saving={saving} /></div></div>}
      {archiveTarget && <div className="admin-modal" role="alertdialog" aria-modal="true" aria-labelledby="racetrack-archive-title" onMouseDown={(event) => { if (event.target === event.currentTarget && !archiving) setArchiveTarget(null); }}><div className="admin-modal__card admin-racetrack__archive"><Archive size={22} aria-hidden="true" /><div><p className="admin-panel__eyebrow">Archive racetrack</p><h2 id="racetrack-archive-title">{archiveTarget.name}</h2><p>Existing races keep their racetrack snapshot. This venue will be unavailable for new races.</p></div><div className="admin-tool-card__footer"><button className="admin-header__button admin-header__button--red" disabled={archiving} type="button" onClick={archiveRacetrack}>{archiving ? "Archiving..." : "Archive"}</button><button className="admin-header__button admin-header__button--ghost" disabled={archiving} type="button" onClick={() => setArchiveTarget(null)}>Cancel</button></div></div></div>}
    </AdminLayout>
  );
}

export default AdminRacetrackModule;
