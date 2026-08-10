import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Check,
  CheckCircle2,
  ExternalLink,
  FileCheck2,
  FileText,
  RefreshCw,
  Search,
  ShieldCheck,
  UserRound,
  X,
} from "lucide-react";
import { adminApi } from "../api/adminApi";
import LoadingSkeleton from "../components/LoadingSkeleton";
import AdminLayout from "./AdminLayout";

const ROLE_LABELS = {
  horse_owner: "Horse owner",
  jockey: "Jockey",
  race_referee: "Race referee",
};

const STATUS_LABELS = {
  pending: "Pending",
  approved: "Approved",
  rejected: "Rejected",
};

const idOf = (application) => String(application?._id || application?.id || "");

function applicantOf(application) {
  const user = application?.user_id || application?.user || {};
  return user && typeof user === "object" ? user : {};
}

function roleLabel(value) {
  return ROLE_LABELS[value] || String(value || "Role access").replaceAll("_", " ");
}

function statusLabel(value) {
  return STATUS_LABELS[value] || String(value || "Unknown");
}

function statusTone(value) {
  if (value === "approved") return "green";
  if (value === "rejected") return "red";
  if (value === "pending") return "amber";
  return "gray";
}

function formatDateTime(value) {
  if (!value) return "Not recorded";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? String(value)
    : date.toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" });
}

function applicationTarget(application) {
  const data = application?.application_data || {};
  return data.stable_name || data.license_number || data.accreditation_body || data.ownership_type || "Role access";
}

function formatValue(value) {
  if (value === undefined || value === null || value === "") return "Not provided";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (Array.isArray(value)) return value.join(", ");
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function isHttpUrl(value) {
  return typeof value === "string" && /^https?:\/\//i.test(value);
}

function displayFieldName(value) {
  return String(value || "")
    .replace(/_public_id$/, "")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function DetailValue({ value, linkLabel = "Open document" }) {
  if (isHttpUrl(value)) {
    return <a className="admin-role-application-link" href={value} rel="noreferrer" target="_blank">{linkLabel}<ExternalLink size={13} aria-hidden="true" /></a>;
  }

  return <>{formatValue(value)}</>;
}

function AdminRoleApplicationsModule() {
  const [applications, setApplications] = useState([]);
  const [filter, setFilter] = useState("all");
  const [roleFilter, setRoleFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const loadApplications = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const response = await adminApi.listRoleApplications();
      const nextApplications = (response.applications || []).slice().sort((first, second) => {
        const pendingFirst = Number(first.status !== "pending") - Number(second.status !== "pending");
        if (pendingFirst !== 0) return pendingFirst;
        return new Date(second.created_at || 0).getTime() - new Date(first.created_at || 0).getTime();
      });

      setApplications(nextApplications);
      setSelectedId((currentId) => (
        nextApplications.some((application) => idOf(application) === currentId)
          ? currentId
          : idOf(nextApplications[0])
      ));
    } catch (apiError) {
      setApplications([]);
      setSelectedId("");
      setError(apiError.message || "Unable to load role applications.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadApplications();
  }, [loadApplications]);

  const counts = useMemo(() => ({
    pending: applications.filter((application) => application.status === "pending").length,
    approved: applications.filter((application) => application.status === "approved").length,
    rejected: applications.filter((application) => application.status === "rejected").length,
  }), [applications]);

  const filteredApplications = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return applications.filter((application) => {
      const applicant = applicantOf(application);
      const applicationData = application.application_data || {};
      const searchableValues = [
        applicant.full_name,
        applicant.email,
        applicant.phone_number,
        roleLabel(application.requested_role),
        applicationTarget(application),
        ...Object.values(applicationData),
      ];

      return (filter === "all" || application.status === filter)
        && (roleFilter === "all" || application.requested_role === roleFilter)
        && (!normalizedQuery || searchableValues.some((value) => formatValue(value).toLowerCase().includes(normalizedQuery)));
    });
  }, [applications, filter, query, roleFilter]);

  const selected = useMemo(
    () => filteredApplications.find((application) => idOf(application) === selectedId) || filteredApplications[0] || null,
    [filteredApplications, selectedId],
  );

  useEffect(() => {
    setNote(selected?.admin_note || "");
  }, [selected?.admin_note, selectedId]);

  const chooseApplication = (application) => {
    setSelectedId(idOf(application));
    setNote(application.admin_note || "");
    setError("");
    setNotice("");
  };

  const completeAction = async (action) => {
    if (!selected || selected.status !== "pending") return;

    const applicationId = idOf(selected);
    setBusyId(applicationId);
    setError("");
    setNotice("");

    try {
      if (action === "approve") await adminApi.approveRoleApplication(applicationId, note);
      if (action === "reject") await adminApi.rejectRoleApplication(applicationId, note);
      setNotice(action === "approve" ? "Role application approved and access granted." : "Role application rejected.");
      await loadApplications();
    } catch (apiError) {
      setError(apiError.message || "Unable to complete this review.");
    } finally {
      setBusyId("");
    }
  };

  const selectedApplicant = applicantOf(selected);
  const selectedData = Object.entries(selected?.application_data || {})
    .filter(([key]) => !key.endsWith("_public_id"));
  const selectedDocuments = selected?.documents || [];
  const isBusy = Boolean(selected && busyId === idOf(selected));

  return (
    <AdminLayout
      title="Role applications"
      eyebrow="Access command"
      description="Verify professional role requests, inspect submitted evidence, and grant access from one review queue."
      actions={(
        <button className="admin-header__button admin-header__button--ghost" disabled={loading} type="button" onClick={loadApplications}>
          <RefreshCw size={16} className={loading ? "admin-competition__spin" : ""} aria-hidden="true" /> Refresh
        </button>
      )}
    >
      <section className="admin-cancellation-metrics" aria-label="Role application summary">
        <article><span className="admin-cancellation-metrics__icon"><FileCheck2 size={18} /></span><div><small>Awaiting review</small><strong>{counts.pending}</strong></div></article>
        <article><span className="admin-cancellation-metrics__icon"><CheckCircle2 size={18} /></span><div><small>Approved</small><strong>{counts.approved}</strong></div></article>
        <article><span className="admin-cancellation-metrics__icon"><X size={18} /></span><div><small>Rejected</small><strong>{counts.rejected}</strong></div></article>
      </section>

      {notice && <div className="admin-live-state" aria-live="polite"><CheckCircle2 size={17} aria-hidden="true" />{notice}</div>}
      {error && <div className="admin-live-state admin-live-state--warning" aria-live="assertive">{error}</div>}

      <section className="admin-cancellation-workspace admin-role-application-workspace">
        <aside className="admin-cancellation-queue" aria-label="Role application queue">
          <header>
            <div><p className="admin-panel__eyebrow">Application queue</p><h2>Review requests</h2></div>
            <span>{filteredApplications.length} shown</span>
          </header>

          <div className="admin-cancellation-tabs" role="tablist" aria-label="Filter applications by status">
            {[['all', 'All'], ['pending', 'Pending'], ['approved', 'Approved'], ['rejected', 'Rejected']].map(([value, label]) => (
              <button aria-selected={filter === value} className={filter === value ? "is-active" : ""} key={value} onClick={() => { setFilter(value); setSelectedId(""); }} role="tab" type="button">{label}</button>
            ))}
          </div>

          <div className="admin-role-application-filter-row">
            <label className="admin-cancellation-search">
              <Search size={16} aria-hidden="true" />
              <span className="sr-only">Search applications</span>
              <input onChange={(event) => setQuery(event.target.value)} placeholder="Search applicant or role" type="search" value={query} />
            </label>
            <label className="admin-role-application-role-filter">
              <span className="sr-only">Filter by requested role</span>
              <select aria-label="Filter by requested role" onChange={(event) => { setRoleFilter(event.target.value); setSelectedId(""); }} value={roleFilter}>
                <option value="all">All roles</option>
                {Object.entries(ROLE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </label>
          </div>

          <div className="admin-cancellation-list">
            {loading ? <LoadingSkeleton ariaLabel="Loading role applications" variant="inline" /> : filteredApplications.map((application) => {
              const applicant = applicantOf(application);
              const applicationId = idOf(application);
              return (
                <button className={`admin-cancellation-row admin-role-application-row ${applicationId === idOf(selected) ? "is-selected" : ""}`} key={applicationId} onClick={() => chooseApplication(application)} type="button">
                  <span className="admin-cancellation-row__top"><strong>{applicant.full_name || applicant.email || "Applicant"}</strong><span className={`admin-cancellation-status is-${statusTone(application.status)}`}>{statusLabel(application.status)}</span></span>
                  <span className="admin-cancellation-row__owner"><UserRound size={14} aria-hidden="true" /> {roleLabel(application.requested_role)}</span>
                  <span className="admin-cancellation-row__race">{applicationTarget(application)}{applicant.email ? ` · ${applicant.email}` : ""}</span>
                  <span className="admin-cancellation-row__bottom"><small>{formatDateTime(application.created_at)}</small><span className="admin-role-application-row__open">Open <ExternalLink size={13} aria-hidden="true" /></span></span>
                </button>
              );
            })}
            {!loading && !filteredApplications.length && <div className="admin-cancellation-empty">No applications match this view.</div>}
          </div>
        </aside>

        <article className="admin-cancellation-detail">
          {!selected ? (
            <div className="admin-cancellation-empty admin-cancellation-empty--detail"><ShieldCheck size={30} aria-hidden="true" /><strong>Select an application to review</strong><span>Applicant details and submitted documents will appear here.</span></div>
          ) : (
            <>
              <header className="admin-cancellation-detail__header">
                <div><p className="admin-panel__eyebrow">Role request</p><h2>{selectedApplicant.full_name || selectedApplicant.email || "Applicant"}</h2><span>{selectedApplicant.email || "Email not recorded"} · {roleLabel(selected.requested_role)}</span></div>
                <span className={`admin-cancellation-status is-${statusTone(selected.status)}`}>{statusLabel(selected.status)}</span>
              </header>

              <div className="admin-cancellation-detail__body">
                <dl className="admin-cancellation-facts admin-role-application-facts">
                  <div><dt>Requested role</dt><dd>{roleLabel(selected.requested_role)}</dd><small>{applicationTarget(selected)}</small></div>
                  <div><dt>Submitted</dt><dd>{formatDateTime(selected.created_at)}</dd><small>{selectedApplicant.email_verified ? "Email verified" : "Email not verified"}</small></div>
                  <div><dt>Applicant phone</dt><dd>{selectedApplicant.phone_number || "Not recorded"}</dd><small>Account: {selectedApplicant.status || "Not recorded"}</small></div>
                  <div><dt>Reviewed</dt><dd>{formatDateTime(selected.reviewed_at)}</dd><small>{selected.reviewed_by?.full_name || "No reviewer recorded"}</small></div>
                </dl>

                <section className="admin-role-application-section">
                  <div className="admin-role-application-section__heading"><FileText size={17} aria-hidden="true" /><h3>Application details</h3></div>
                  {selectedData.length ? <dl className="admin-role-application-data">{selectedData.map(([key, value]) => <div key={key}><dt>{displayFieldName(key)}</dt><dd><DetailValue value={value} /></dd></div>)}</dl> : <p className="admin-role-application-muted">No additional application details were submitted.</p>}
                </section>

                <section className="admin-role-application-section">
                  <div className="admin-role-application-section__heading"><FileCheck2 size={17} aria-hidden="true" /><h3>Submitted documents</h3><span>{selectedDocuments.length}</span></div>
                  {selectedDocuments.length ? <div className="admin-role-application-documents">{selectedDocuments.map((document, index) => <article key={`${document.type || "document"}-${index}`}><div><strong>{displayFieldName(document.type || `Document ${index + 1}`)}</strong>{document.note && <small>{document.note}</small>}</div>{document.url ? <a className="admin-role-application-link" href={document.url} rel="noreferrer" target="_blank">View file <ExternalLink size={13} aria-hidden="true" /></a> : <span className="admin-role-application-muted">No file link</span>}</article>)}</div> : <p className="admin-role-application-muted">No standalone documents were submitted.</p>}
                </section>

                {selected.admin_note && <section className="admin-cancellation-record admin-role-application-record"><h3>Review note</h3><p>{selected.admin_note}</p></section>}
              </div>

              {selected.status === "pending" ? (
                <footer className="admin-cancellation-actions admin-role-application-actions">
                  <label className="admin-field"><span>Decision note</span><textarea maxLength="1000" onChange={(event) => setNote(event.target.value)} placeholder="Add context for the applicant (optional)" value={note} /></label>
                  <div><button className="admin-header__button admin-header__button--red" disabled={isBusy} onClick={() => completeAction("reject")} type="button"><X size={16} /> Reject</button><button className="admin-header__button" disabled={isBusy} onClick={() => completeAction("approve")} type="button"><Check size={16} /> {isBusy ? "Saving..." : "Approve role"}</button></div>
                </footer>
              ) : (
                <footer className="admin-cancellation-actions admin-role-application-actions--closed"><CheckCircle2 size={18} aria-hidden="true" /><div><strong>Review complete</strong><span>This application has already been {selected.status}.</span></div></footer>
              )}
            </>
          )}
        </article>
      </section>
    </AdminLayout>
  );
}

export default AdminRoleApplicationsModule;
