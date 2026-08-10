import { AlertTriangle, Check, Eye, FileImage, Pencil, Plus, Scale, Trash2, Upload, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { refereeApi } from "../api/refereeApi";
import LoadingSkeleton from "../components/LoadingSkeleton";
import PenaltyDecisionEditor, {
  buildPenaltyFromPolicy,
  penaltiesEqual,
} from "../components/PenaltyDecisionEditor";
import RefereeLayout from "./RefereeLayout";
import { formatStatus } from "./refereeConstants";
import { useRefereeData } from "./useRefereeData";
import { readFileAsDataUri } from "../utils/fileData";

const emptyForm = {
  type: "",
  severity: "minor",
  subjectKind: "Jockey",
  subjectId: "",
  description: "",
  timeMarker: "",
  evidenceUrls: [],
  evidenceFiles: [],
};

const unresolvedStatuses = new Set(["recorded", "under_review"]);
const MAX_EVIDENCE_FILE_SIZE = 10 * 1024 * 1024;
const ALLOWED_EVIDENCE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "video/mp4"]);

function getPolicy(options, type, severity) {
  return options?.penalty_policies?.find((item) => item.violation_type === type && item.severity === severity) || null;
}

function describePenalty(penalty) {
  if (!penalty) return "Pending policy decision";
  const facts = [formatStatus(penalty.type)];
  if (penalty.time_penalty_seconds) facts.push(`+${penalty.time_penalty_seconds}s`);
  if (penalty.position_delta) facts.push(`${penalty.position_delta} position demotion`);
  if (penalty.score_deduction) facts.push(`${penalty.score_deduction} point deduction`);
  if (penalty.suspension_days) facts.push(`${penalty.suspension_days} day suspension`);
  if (penalty.fine_amount) facts.push(`${penalty.fine_amount} fine`);
  if (penalty.disqualified) facts.push("Disqualification");
  return facts.join(" · ");
}

function statusTone(status) {
  if (["confirmed", "resolved"].includes(status)) return "green";
  if (status === "dismissed") return "gray";
  if (status === "under_review") return "amber";
  return "blue";
}

function getDetailSubject(violation) {
  const jockey = violation?.jockey_id;
  const horse = violation?.horse_id;
  return jockey?.user_id?.full_name || jockey?.full_name || horse?.name || "Unlinked subject";
}

function effectivePenalty(violation, policy) {
  return violation.penalty ||
    violation.proposedPenalty ||
    violation.suggestedPenalty ||
    policy?.suggested_penalty ||
    null;
}

function evidenceLinks(violation) {
  const files = violation?.evidence_files || [];
  const urls = violation?.evidence_urls || [];
  return [
    ...files.map((file) => ({
      url: file.url,
      name: file.file_name || "Evidence",
      type: file.type || "",
    })),
    ...urls.map((url, index) => ({
      url,
      name: `Evidence ${index + 1}`,
      type: "",
    })),
  ].filter((item, index, items) =>
    item.url && items.findIndex((candidate) => candidate.url === item.url) === index
  );
}

function ViolationManagement() {
  const { raceId } = useParams();
  const { error, getRace, isLoading, isUnavailable, reload } = useRefereeData();
  const race = getRace(raceId);
  const [options, setOptions] = useState(null);
  const [optionsError, setOptionsError] = useState("");
  const [isOptionsLoading, setIsOptionsLoading] = useState(true);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [preview, setPreview] = useState(null);
  const [previewError, setPreviewError] = useState("");
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const [selectedViolation, setSelectedViolation] = useState(null);
  const [detailError, setDetailError] = useState("");
  const [isDetailLoading, setIsDetailLoading] = useState(false);
  const [decision, setDecision] = useState("");
  const [penaltyDecision, setPenaltyDecision] = useState(null);
  const [deviationReason, setDeviationReason] = useState("");
  const [messages, setMessages] = useState([]);
  const [isSaving, setIsSaving] = useState(false);
  const [decisionAction, setDecisionAction] = useState("");

  const violations = race?.violations || [];
  const participants = useMemo(() => (race?.participants || []).filter((participant) => participant.eligible).map((participant) => ({
    id: form.subjectKind === "Horse" ? participant.horseId : participant.jockeyId,
    horseId: participant.horseId,
    jockeyId: participant.jockeyId,
    name: form.subjectKind === "Horse" ? participant.horseName : participant.jockeyName,
  })).filter((participant) => participant.id), [form.subjectKind, race]);

  const loadOptions = async () => {
    try {
      setIsOptionsLoading(true);
      setOptionsError("");
      const data = await refereeApi.getViolationOptions();
      setOptions(data);
      setForm((current) => ({ ...current, type: current.type || data.violation_types?.[0] || "" }));
    } catch (apiError) {
      setOptions(null);
      setOptionsError(apiError.message || "Unable to load violation policy options.");
    } finally {
      setIsOptionsLoading(false);
    }
  };

  useEffect(() => { loadOptions(); }, []);

  useEffect(() => {
    if (!showForm || !form.type || !form.severity) return undefined;
    let active = true;
    const timer = setTimeout(async () => {
      try {
        setIsPreviewLoading(true);
        setPreviewError("");
        const data = await refereeApi.previewViolationPenalty({ violation_type: form.type, severity: form.severity });
        if (active) setPreview(data.policy || null);
      } catch (apiError) {
        if (active) { setPreview(null); setPreviewError(apiError.message || "Unable to load the system penalty recommendation."); }
      } finally {
        if (active) setIsPreviewLoading(false);
      }
    }, 220);
    return () => { active = false; clearTimeout(timer); };
  }, [form.severity, form.type, showForm]);

  if (isLoading) return <RefereeLayout title="Violations" eyebrow="" description=""><LoadingSkeleton ariaLabel="Loading race violations" rows={5} variant="table" /></RefereeLayout>;
  if (!race) return <RefereeLayout title="Not Found" eyebrow="" description=""><section className="admin-live-state admin-live-state--warning">{error || "Race not found."}</section></RefereeLayout>;

  const addMsg = (message) => setMessages((current) => [message, ...current].slice(0, 4));

  const closeForm = () => {
    setShowForm(false);
    setEditingId("");
    setPreview(null);
    setPreviewError("");
    setForm({ ...emptyForm, type: options?.violation_types?.[0] || "" });
  };

  const openCreateForm = () => {
    setEditingId("");
    setForm({ ...emptyForm, type: options?.violation_types?.[0] || "" });
    setShowForm(true);
  };

  const openEditForm = (violation) => {
    const subjectKind = violation.jockeyId ? "Jockey" : "Horse";
    setEditingId(violation.id);
    setForm({
      type: violation.type,
      severity: violation.severity || "minor",
      subjectKind,
      subjectId: subjectKind === "Jockey" ? violation.jockeyId : violation.horseId,
      description: violation.description || "",
      timeMarker: violation.timeMarker || "",
      evidenceUrls: violation.evidenceUrls || [],
      evidenceFiles: [],
    });
    setShowForm(true);
  };

  const addEvidenceFiles = async (event) => {
    const files = Array.from(event.target.files || []);
    event.target.value = "";

    for (const file of files) {
      if (!ALLOWED_EVIDENCE_TYPES.has(file.type)) {
        addMsg(`${file.name} is not a supported image or MP4 video.`);
        continue;
      }
      if (file.size > MAX_EVIDENCE_FILE_SIZE) {
        addMsg(`${file.name} exceeds the 10 MB evidence limit.`);
        continue;
      }

      try {
        const fileData = await readFileAsDataUri(file);
        setForm((current) => ({
          ...current,
          evidenceFiles: [
            ...current.evidenceFiles,
            {
              file_data: fileData,
              type: file.type,
              file_name: file.name,
            },
          ],
        }));
      } catch (fileError) {
        addMsg(fileError.message || `Unable to read ${file.name}.`);
      }
    }
  };

  const removeEvidenceFile = (index) => {
    setForm((current) => ({
      ...current,
      evidenceFiles: current.evidenceFiles.filter((_, itemIndex) => itemIndex !== index),
    }));
  };

  const removeEvidenceUrl = (url) => {
    setForm((current) => ({
      ...current,
      evidenceUrls: current.evidenceUrls.filter((item) => item !== url),
    }));
  };

  const handleSave = async (event) => {
    event.preventDefault();
    const subject = participants.find((participant) => participant.id === form.subjectId);
    if (!editingId && !subject) return addMsg("Select a horse or jockey before recording the violation.");
    if (!form.description.trim()) return addMsg("Describe the incident before saving.");

    const evidenceFiles = [
      ...form.evidenceUrls.map((url) => ({ url })),
      ...form.evidenceFiles,
    ];
    try {
      setIsSaving(true);
      if (editingId) {
        await refereeApi.updateViolation(editingId, {
          severity: form.severity,
          description: form.description.trim(),
          time_marker: form.timeMarker || undefined,
          evidence_files: evidenceFiles,
        });
      } else {
        await refereeApi.createViolation({
          race_id: race.id,
          horse_id: subject.horseId || undefined,
          jockey_id: form.subjectKind === "Jockey" ? subject.jockeyId || undefined : undefined,
          violation_type: form.type,
          severity: form.severity,
          description: form.description.trim(),
          time_marker: form.timeMarker || undefined,
          evidence_files: evidenceFiles,
        });
      }
      await reload();
      addMsg(editingId ? "Violation details updated." : "Violation recorded with the system penalty recommendation.");
      closeForm();
    } catch (apiError) {
      addMsg(apiError.message || "Unable to save violation.");
    } finally {
      setIsSaving(false);
    }
  };

  const openDetail = async (id) => {
    try {
      setSelectedViolation(null);
      setDecision("");
      setPenaltyDecision(null);
      setDeviationReason("");
      setDetailError("");
      setIsDetailLoading(true);
      const data = await refereeApi.getViolation(id);
      const violation = data.violation || null;
      const policy = violation ? getPolicy(options, violation.violation_type, violation.severity) : null;
      setSelectedViolation(violation);
      setPenaltyDecision(
        violation?.proposed_penalty ||
        violation?.penalty ||
        violation?.suggested_penalty ||
        buildPenaltyFromPolicy(policy)
      );
      setDeviationReason(violation?.deviation_reason || "");
    } catch (apiError) {
      setDetailError(apiError.status === 403 ? "You do not have permission to view this violation." : apiError.message || "Unable to load violation detail.");
    } finally {
      setIsDetailLoading(false);
    }
  };

  const decide = async (action) => {
    if (!decision.trim()) return setDetailError("A decision note is required.");
    if (
      action === "confirm" &&
      detailPolicy &&
      !penaltiesEqual(penaltyDecision, detailPolicy.suggested_penalty) &&
      !deviationReason.trim()
    ) {
      return setDetailError("Explain why the selected penalty differs from policy.");
    }
    try {
      setDecisionAction(action);
      setDetailError("");
      if (action === "confirm") {
        await refereeApi.confirmViolation(selectedViolation._id, {
          decision: decision.trim(),
          penalty: penaltyDecision,
          deviation_reason: deviationReason.trim() || undefined,
        });
        addMsg("Penalty decision confirmed.");
      }
      else {
        await refereeApi.dismissViolation(selectedViolation._id, decision.trim());
        addMsg("Incident dismissed with a recorded decision.");
      }
      await reload();
      setSelectedViolation(null);
    } catch (apiError) {
      setDetailError(apiError.status === 403 ? "This violation belongs to another official." : apiError.message || `Unable to ${action} violation.`);
    } finally {
      setDecisionAction("");
    }
  };

  const unresolved = violations.filter((item) => unresolvedStatuses.has(item.status));
  const resultsLocked = ["confirmed", "published"].includes(race.resultStatus);
  const detailPolicy = selectedViolation ? getPolicy(options, selectedViolation.violation_type, selectedViolation.severity) : null;
  const detailIsUnresolved = selectedViolation && unresolvedStatuses.has(selectedViolation.status);
  const canRefereeDecide = detailIsUnresolved && Boolean(detailPolicy) && !resultsLocked;

  const closeDetail = () => {
    setSelectedViolation(null);
    setDetailError("");
    setDecision("");
    setPenaltyDecision(null);
    setDeviationReason("");
  };

  return <RefereeLayout title="Violation decisions" eyebrow={`Race incident policy | ${race.name}`} description="Record incidents, review the system recommendation, and resolve decisions within Referee authority." actions={<><button className="admin-header__button" type="button" disabled={isOptionsLoading || Boolean(optionsError) || isUnavailable || resultsLocked} onClick={openCreateForm}><Plus aria-hidden="true" size={17} /> New violation</button><Link className="admin-header__button admin-header__button--ghost" to={`/referee/races/${raceId}`}>Race detail</Link></>}>
    {(error || optionsError) && <section className="admin-live-state admin-live-state--warning" role="alert">{error || optionsError} {optionsError && <button className="admin-header__button admin-header__button--ghost" type="button" onClick={loadOptions}>Retry policy</button>}</section>}
    {isUnavailable && <section className="admin-live-state">Participant data is unavailable. Participant-linked violation creation is disabled.</section>}
    {resultsLocked && <section className="admin-live-state">Violation decisions are locked because race results are {formatStatus(race.resultStatus)}.</section>}
    {!!messages.length && <section className="admin-toast-stack" aria-live="polite">{messages.map((message, index) => <div key={`${message}-${index}`} className="admin-toast">{message}</div>)}</section>}

    <section className="referee-violation-summary" aria-label="Violation summary"><article><span>Total records</span><strong>{violations.length}</strong></article><article><span>Awaiting decision</span><strong>{unresolved.length}</strong></article><article><span>Dismissed</span><strong>{violations.filter((item) => item.status === "dismissed").length}</strong></article><article><span>Confirmed</span><strong>{violations.filter((item) => item.status === "confirmed").length}</strong></article></section>

    <section className="admin-panel"><div className="admin-panel__header referee-section-heading"><div><p className="admin-panel__eyebrow">Audit ledger</p><h2>Recorded incidents</h2></div><span>{options?.penalty_policies?.[0]?.policy_version ? `Policy ${options.penalty_policies[0].policy_version}` : "Policy unavailable"}</span></div>
      {violations.length === 0 ? <div className="referee-empty-state"><Scale aria-hidden="true" size={28} /><div><h2>No violations recorded</h2><p>New incidents will appear here with their decision state.</p></div></div> : <div className="admin-data-table__wrap"><table className="admin-data-table"><thead><tr><th>Incident</th><th>Subject</th><th>Severity</th><th>Current penalty</th><th>Status</th><th>Time</th><th>Actions</th></tr></thead><tbody>{violations.map((violation) => { const policy = getPolicy(options, violation.type, violation.severity); return <tr key={violation.id}><td><strong>{formatStatus(violation.type)}</strong><span className="referee-table-subline">{violation.description || "No description"}</span></td><td>{violation.subjectName}</td><td>{formatStatus(violation.severity)}</td><td>{describePenalty(effectivePenalty(violation, policy))}{violation.proposedPenalty && !violation.penalty && <span className="referee-table-subline">Referee proposal</span>}{!violation.proposedPenalty && !violation.penalty && <span className="referee-table-subline">System recommendation</span>}</td><td><span className={`referee-status-badge referee-status-badge--${statusTone(violation.status)}`}>{formatStatus(violation.status)}</span></td><td>{violation.timeMarker || "—"}</td><td><div className="referee-row-actions"><button type="button" aria-label="View violation detail" onClick={() => openDetail(violation.id)}><Eye aria-hidden="true" size={16} /></button>{!resultsLocked && unresolvedStatuses.has(violation.status) && <button type="button" aria-label="Edit unresolved violation" onClick={() => openEditForm(violation)}><Pencil aria-hidden="true" size={15} /></button>}</div></td></tr>; })}</tbody></table></div>}
    </section>

    {showForm && (
      <div className="admin-modal" role="dialog" aria-modal="true" aria-label={editingId ? "Edit violation" : "Record violation"} onClick={(event) => event.target === event.currentTarget && closeForm()}>
        <div className="admin-modal__card referee-violation-modal referee-violation-modal--form">
          <div className="admin-panel__header referee-incident-form__header">
            <p className="admin-panel__eyebrow">{editingId ? "Unresolved record" : "New incident"}</p>
            <h2>{editingId ? "Update violation details" : "Record policy-backed violation"}</h2>
          </div>
          <form className="admin-form-grid referee-incident-form" onSubmit={handleSave}>
            <div className="referee-violation-form-grid referee-incident-form__fields">
              <label className="admin-field"><span>Violation type</span><select disabled={Boolean(editingId)} value={form.type} onChange={(event) => setForm({ ...form, type: event.target.value })}>{options?.violation_types?.map((type) => <option key={type} value={type}>{formatStatus(type)}</option>)}</select></label>
              <label className="admin-field"><span>Severity</span><select value={form.severity} onChange={(event) => setForm({ ...form, severity: event.target.value })}>{options?.severities?.map((severity) => <option key={severity} value={severity}>{formatStatus(severity)}</option>)}</select></label>
              <label className="admin-field"><span>Subject kind</span><select disabled={Boolean(editingId)} value={form.subjectKind} onChange={(event) => setForm({ ...form, subjectKind: event.target.value, subjectId: "" })}><option value="Jockey">Jockey</option><option value="Horse">Horse</option></select></label>
              <label className="admin-field"><span>Subject</span><select disabled={Boolean(editingId)} value={form.subjectId} onChange={(event) => setForm({ ...form, subjectId: event.target.value })}><option value="">Select participant</option>{participants.map((participant) => <option key={participant.id} value={participant.id}>{participant.name}</option>)}</select></label>
              <label className="admin-field"><span>Race time marker</span><input value={form.timeMarker} onChange={(event) => setForm({ ...form, timeMarker: event.target.value })} placeholder="00:01:24" /></label>
            </div>
            <label className="admin-field"><span>Incident description</span><textarea required value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} placeholder="State what happened and the observable facts." /></label>
            <section className="referee-evidence-upload">
              <div className="referee-evidence-upload__heading">
                <div><FileImage size={18} aria-hidden="true" /><span>Evidence</span></div>
                <label className="admin-header__button admin-header__button--ghost">
                  <Upload size={15} aria-hidden="true" /> Add files
                  <input type="file" accept="image/jpeg,image/png,image/webp,video/mp4" multiple onChange={addEvidenceFiles} />
                </label>
              </div>
              <small>Images or MP4 video, up to 10 MB per file.</small>
              {(form.evidenceUrls.length > 0 || form.evidenceFiles.length > 0) && (
                <div className="referee-evidence-upload__list">
                  {form.evidenceUrls.map((url) => <div key={url}><a href={url} target="_blank" rel="noreferrer">Existing evidence</a><button type="button" aria-label="Remove existing evidence" onClick={() => removeEvidenceUrl(url)}><Trash2 size={15} /></button></div>)}
                  {form.evidenceFiles.map((file, index) => <div key={`${file.file_name}-${index}`}><span>{file.file_name}</span><button type="button" aria-label={`Remove ${file.file_name}`} onClick={() => removeEvidenceFile(index)}><Trash2 size={15} /></button></div>)}
                </div>
              )}
            </section>
            <section className="referee-policy-preview" aria-live="polite">
              {isPreviewLoading ? <LoadingSkeleton ariaLabel="Loading penalty preview" variant="inline" /> : previewError ? <p>{previewError}</p> : preview ? <><div><Scale aria-hidden="true" size={19} /><span>System penalty recommendation</span></div><strong>{describePenalty(preview.suggested_penalty)}</strong><p>{preview.suggested_penalty?.note}</p><small>The Referee records the final decision after reviewing the incident.</small></> : <p>Select a type and severity to preview the policy.</p>}
            </section>
            <div className="admin-tool-card__footer referee-incident-form__actions"><button className="admin-header__button admin-header__button--ghost" type="button" onClick={closeForm}>Cancel</button><button className="admin-header__button" disabled={isSaving || isUnavailable || isPreviewLoading || Boolean(previewError)} type="submit">{isSaving ? "Saving..." : editingId ? "Update details" : "Record violation"}</button></div>
          </form>
        </div>
      </div>
    )}

    {(isDetailLoading || detailError || selectedViolation) && (
      <div className="admin-modal" role="dialog" aria-modal="true" aria-label="Violation decision" onClick={(event) => event.target === event.currentTarget && !decisionAction && closeDetail()}>
        <div className="admin-modal__card referee-violation-modal referee-violation-modal--detail">
          {isDetailLoading ? <LoadingSkeleton ariaLabel="Loading violation detail" variant="detail" /> : detailError && !selectedViolation ? <><section className="admin-live-state admin-live-state--warning">{detailError}</section><button className="admin-header__button admin-header__button--ghost" type="button" onClick={closeDetail}>Close</button></> : selectedViolation && (
            <>
              <header className="referee-violation-modal__header">
                <div className="referee-violation-modal__header-main">
                  <div className="referee-violation-modal__case-mark" aria-hidden="true"><Scale size={19} /></div>
                  <div>
                  <p className="admin-panel__eyebrow">Decision workspace <span className="referee-violation-modal__case-id">Case {String(selectedViolation._id || selectedViolation.id || "").slice(-8).toUpperCase()}</span></p>
                  <div className="referee-violation-modal__title">
                    <h2>{formatStatus(selectedViolation.violation_type)}</h2>
                    <span className={`referee-status-badge referee-status-badge--${selectedViolation.severity === "critical" ? "red" : "amber"}`}>{formatStatus(selectedViolation.severity)}</span>
                  </div>
                  </div>
                </div>
                <div className="referee-violation-modal__header-actions">
                  <span className={`referee-violation-modal__status referee-violation-modal__status--${statusTone(selectedViolation.status)}`}><span aria-hidden="true" />{formatStatus(selectedViolation.status)}</span>
                  <button className="referee-violation-modal__close" disabled={Boolean(decisionAction)} type="button" aria-label="Close violation detail" onClick={closeDetail}><X aria-hidden="true" size={18} /></button>
                </div>
              </header>

              <div className="referee-violation-modal__body">
                <aside className="referee-violation-modal__context">
                  <div className="referee-violation-context__lead">
                    <span>Subject under review</span>
                    <strong>{getDetailSubject(selectedViolation)}</strong>
                    <small>{selectedViolation.time_marker ? `Observed at ${selectedViolation.time_marker}` : "Race time not recorded"}</small>
                  </div>
                  <section>
                    <h3>Incident context</h3>
                    <dl className="referee-violation-facts">
                      <div><dt>Subject</dt><dd>{getDetailSubject(selectedViolation)}</dd></div>
                      <div><dt>Race time</dt><dd>{selectedViolation.time_marker || "Not recorded"}</dd></div>
                      <div><dt>Severity</dt><dd>{formatStatus(selectedViolation.severity)}</dd></div>
                      <div><dt>Status</dt><dd>{formatStatus(selectedViolation.status)}</dd></div>
                    </dl>
                  </section>
                  <section>
                    <h3>Official observation</h3>
                    <p className="referee-violation-description">{selectedViolation.description || "No incident description."}</p>
                    {selectedViolation.decision && <blockquote>{selectedViolation.decision}</blockquote>}
                  </section>
                  <section>
                    <h3>Evidence</h3>
                    {evidenceLinks(selectedViolation).length > 0 ? (
                      <div className="referee-violation-evidence">
                        {evidenceLinks(selectedViolation).map((item) => (
                          <a href={item.url} key={item.url} rel="noreferrer" target="_blank">
                            {item.type.startsWith("image/") ? <img alt="" src={item.url} /> : <span><FileImage aria-hidden="true" size={22} /></span>}
                            <strong>{item.name}</strong>
                          </a>
                        ))}
                      </div>
                    ) : <p className="referee-violation-empty-copy">No evidence attached.</p>}
                  </section>
                </aside>

                <main className="referee-violation-modal__decision">
                  <header className="referee-decision-heading">
                    <div>
                      <p className="admin-panel__eyebrow">Final review</p>
                      <h3>Resolve this incident</h3>
                    </div>
                    <span>Policy-guided decision</span>
                  </header>
                  <section className="referee-penalty-audit">
                    <div><span>System recommendation</span><strong>{describePenalty(selectedViolation.suggested_penalty || detailPolicy?.suggested_penalty)}</strong></div>
                    {selectedViolation.proposed_penalty && <div><span>Referee proposal</span><strong>{describePenalty(selectedViolation.proposed_penalty)}</strong></div>}
                    {selectedViolation.penalty && <div><span>Final penalty</span><strong>{describePenalty(selectedViolation.penalty)}</strong></div>}
                    {selectedViolation.deviation_reason && <div><span>Reason for adjustment</span><p>{selectedViolation.deviation_reason}</p></div>}
                  </section>
                  {detailPolicy && penaltyDecision && <PenaltyDecisionEditor policy={detailPolicy} value={penaltyDecision} onChange={setPenaltyDecision} deviationReason={deviationReason} onDeviationReasonChange={setDeviationReason} disabled={!canRefereeDecide || Boolean(decisionAction)} reviewer="referee" />}
                  {canRefereeDecide && <label className="admin-field referee-violation-decision-note"><span>Decision note <b>Required</b></span><textarea value={decision} onChange={(event) => setDecision(event.target.value)} placeholder="Record the evidence and reasoning behind the final decision." /></label>}
                  {canRefereeDecide && <section className="referee-final-decision-note"><Check aria-hidden="true" size={17} /><span>Once confirmed, this penalty becomes the official decision for the race result.</span></section>}
                  {detailError && <section className="admin-live-state admin-live-state--warning">{detailError}</section>}
                  {detailIsUnresolved && resultsLocked && <section className="referee-final-decision-note referee-final-decision-note--locked"><AlertTriangle aria-hidden="true" size={17} /><span>Decisions are locked because the race result is {formatStatus(race.resultStatus)}.</span></section>}
                  {detailIsUnresolved && !detailPolicy && <section className="referee-final-decision-note referee-final-decision-note--locked"><AlertTriangle aria-hidden="true" size={17} /><span>Penalty guidance is unavailable. Reload the page before deciding.</span></section>}
                </main>
              </div>

              <footer className="referee-violation-modal__footer">
                <div className="referee-violation-modal__footer-note">{canRefereeDecide ? <><span className="referee-violation-modal__footer-dot" aria-hidden="true" />Changes are logged to the race record</> : "Read-only decision record"}</div>
                <div>{canRefereeDecide && <button className="admin-header__button admin-header__button--red" disabled={Boolean(decisionAction)} type="button" onClick={() => decide("dismiss")}><X aria-hidden="true" size={16} />{decisionAction === "dismiss" ? "Dismissing..." : "Dismiss incident"}</button>}</div>
                <div>
                  <button className="admin-header__button admin-header__button--ghost" disabled={Boolean(decisionAction)} type="button" onClick={closeDetail}>Close</button>
                  {canRefereeDecide && <button className="admin-header__button" disabled={Boolean(decisionAction)} type="button" onClick={() => decide("confirm")}><Check aria-hidden="true" size={16} />{decisionAction === "confirm" ? "Confirming..." : "Confirm penalty"}</button>}
                </div>
              </footer>
            </>
          )}
        </div>
      </div>
    )}
  </RefereeLayout>;
}

export default ViolationManagement;

