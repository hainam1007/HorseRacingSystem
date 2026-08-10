import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  BadgeCheck,
  BriefcaseBusiness,
  ClipboardCheck,
  Eye,
  FileText,
  Loader2,
  Pencil,
  Send,
  ShieldCheck,
  UserRoundCheck,
} from "lucide-react";
import LoadingSkeleton from "../../components/LoadingSkeleton.jsx";
import { roleApplicationApi } from "../../api/roleApplicationApi";
import { useAuth } from "../../auth/AuthContext";
import { getRoleLabel } from "../../auth/roleRoutes";
import { readFileAsDataUri } from "../../utils/fileData";

const applicationRoles = [
  {
    value: "horse_owner",
    label: "Horse Owner",
    icon: BriefcaseBusiness,
    summary: "Register horses, manage stable details, and coordinate race participation.",
  },
  {
    value: "jockey",
    label: "Jockey",
    icon: UserRoundCheck,
    summary: "Receive owner invitations, confirm assignments, and track athlete performance.",
  },
  {
    value: "race_referee",
    label: "Race Referee",
    icon: ShieldCheck,
    summary: "Inspect horses, monitor races, record violations, and submit official reports.",
  },
];

const initialForms = {
  horse_owner: {
    stable_name: "",
    address: "",
    license_number: "",
    ownership_type: "individual",
    tax_id: "",
    identity_document: null,
    owner_license_document: null,
    horse_ownership_proof: null,
  },
  jockey: {
    license_number: "",
    height: "",
    weight_kg: "",
    experience_years: "",
    medical_clearance: null,
    racing_license_document: null,
    riding_certificate: null,
    identity_document: null,
  },
  race_referee: {
    license_number: "",
    experience_years: "",
    accreditation_body: "",
    previous_official_role: "",
    rules_training_certificate: null,
    background_check: null,
    identity_document: null,
  },
};

const statusLabels = {
  pending: "Pending",
  approved: "Approved",
  rejected: "Rejected",
};

function normalizeApplications(data) {
  return Array.isArray(data?.applications) ? data.applications : [];
}

function getRoleOption(role) {
  return applicationRoles.find((item) => item.value === role) || applicationRoles[0];
}

function hasPendingApplication(applications, role) {
  return applications.some((application) => (
    application.requested_role === role && application.status === "pending"
  ));
}

function hasApprovedApplication(applications, role) {
  return applications.some((application) => (
    application.requested_role === role && application.status === "approved"
  ));
}

function getLatestRoleApplication(applications, role) {
  return applications
    .filter((application) => application.requested_role === role)
    .sort((left, right) => new Date(right.created_at || 0) - new Date(left.created_at || 0))[0] || null;
}

function hydrateFormFromApplication(role, application) {
  const applicationData = application?.application_data || {};
  const baseForm = initialForms[role] || {};

  return Object.keys(baseForm).reduce((nextForm, fieldName) => {
    const currentValue = baseForm[fieldName];

    if (currentValue === null) {
      nextForm[fieldName] = null;
      return nextForm;
    }

    nextForm[fieldName] = applicationData[fieldName] ?? currentValue;
    return nextForm;
  }, {});
}

function Field({ label, children, hint }) {
  return (
    <label className="role-application-field">
      <span>{label}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  );
}

function FileField({ label, file, onChange, required }) {
  return (
    <Field label={label}>
      <span className={`role-application-file ${file ? "has-file" : ""}`}>
        <input
          accept="application/pdf,image/*"
          onChange={(event) => onChange(event.target.files?.[0] || null)}
          required={required}
          type="file"
        />
        <span className="role-application-file__button">Choose file</span>
        <span className="role-application-file__name">{file?.name || "No file selected"}</span>
      </span>
    </Field>
  );
}

function ApplicationHistory({ applications, isLoading, error, onViewApplication }) {
  if (isLoading) {
    return <LoadingSkeleton ariaLabel="Loading role applications" rows={3} variant="list" />;
  }

  if (error) {
    return (
      <div className="role-application-state role-application-state--error">
        <FileText size={20} />
        <span>{error}</span>
      </div>
    );
  }

  if (!applications.length) {
    return (
      <div className="role-application-empty">
        <ClipboardCheck size={24} />
        <strong>No applications yet</strong>
        <span>Submit a role request when you are ready to unlock a professional workspace.</span>
      </div>
    );
  }

  return (
    <div className="role-application-list">
      {applications.map((application) => (
        <article className="role-application-row" key={application._id}>
          <span className={`role-application-status role-application-status--${application.status}`}>
            {statusLabels[application.status] || application.status}
          </span>
          <div>
            <strong>{getRoleLabel(application.requested_role)}</strong>
            <small>
              Submitted {application.created_at ? new Date(application.created_at).toLocaleDateString() : "recently"}
            </small>
          </div>
          {application.admin_note && <p>{application.admin_note}</p>}
          <button
            className="role-application-row__action"
            onClick={() => onViewApplication(application)}
            type="button"
          >
            <Eye size={15} />
            View / edit
          </button>
        </article>
      ))}
    </div>
  );
}

function RoleSpecificFields({ role, form, updateField }) {
  if (role === "horse_owner") {
    return (
      <>
        <Field label="Stable name">
          <input value={form.stable_name} onChange={(event) => updateField("stable_name", event.target.value)} required />
        </Field>
        <Field label="Stable address">
          <input value={form.address} onChange={(event) => updateField("address", event.target.value)} required />
        </Field>
        <Field label="Owner license number">
          <input value={form.license_number} onChange={(event) => updateField("license_number", event.target.value)} required />
        </Field>
        <Field label="Ownership type">
          <select value={form.ownership_type} onChange={(event) => updateField("ownership_type", event.target.value)} required>
            <option value="individual">Individual</option>
            <option value="company">Company</option>
            <option value="stable">Stable</option>
            <option value="partnership">Partnership</option>
          </select>
        </Field>
        <Field label="Tax ID">
          <input value={form.tax_id} onChange={(event) => updateField("tax_id", event.target.value)} />
        </Field>
        <FileField
          file={form.identity_document}
          label="Identity document"
          onChange={(file) => updateField("identity_document", file)}
        />
        <FileField
          file={form.owner_license_document}
          label="Owner license document"
          onChange={(file) => updateField("owner_license_document", file)}
        />
        <FileField
          file={form.horse_ownership_proof}
          label="Horse ownership proof"
          onChange={(file) => updateField("horse_ownership_proof", file)}
        />
      </>
    );
  }

  if (role === "jockey") {
    return (
      <>
        <Field label="Jockey license number">
          <input value={form.license_number} onChange={(event) => updateField("license_number", event.target.value)} required />
        </Field>
        <Field label="Height (cm)">
          <input min="1" type="number" value={form.height} onChange={(event) => updateField("height", event.target.value)} required />
        </Field>
        <Field label="Weight (kg)">
          <input min="30" max="100" step="0.1" type="number" value={form.weight_kg} onChange={(event) => updateField("weight_kg", event.target.value)} required />
        </Field>
        <Field label="Experience years">
          <input min="0" type="number" value={form.experience_years} onChange={(event) => updateField("experience_years", event.target.value)} required />
        </Field>
        <FileField
          file={form.medical_clearance}
          label="Medical clearance"
          onChange={(file) => updateField("medical_clearance", file)}
          required
        />
        <FileField
          file={form.racing_license_document}
          label="Racing license document"
          onChange={(file) => updateField("racing_license_document", file)}
          required
        />
        <FileField
          file={form.riding_certificate}
          label="Riding certificate"
          onChange={(file) => updateField("riding_certificate", file)}
        />
        <FileField
          file={form.identity_document}
          label="Identity document"
          onChange={(file) => updateField("identity_document", file)}
        />
      </>
    );
  }

  return (
    <>
      <Field label="Referee license number">
        <input value={form.license_number} onChange={(event) => updateField("license_number", event.target.value)} required />
      </Field>
      <Field label="Experience years">
        <input min="0" type="number" value={form.experience_years} onChange={(event) => updateField("experience_years", event.target.value)} required />
      </Field>
      <Field label="Accreditation body">
        <input value={form.accreditation_body} onChange={(event) => updateField("accreditation_body", event.target.value)} required />
      </Field>
      <Field label="Previous official role">
        <input value={form.previous_official_role} onChange={(event) => updateField("previous_official_role", event.target.value)} />
      </Field>
      <FileField
        file={form.rules_training_certificate}
        label="Rules training certificate"
        onChange={(file) => updateField("rules_training_certificate", file)}
        required
      />
      <FileField
        file={form.background_check}
        label="Background check"
        onChange={(file) => updateField("background_check", file)}
        required
      />
      <FileField
        file={form.identity_document}
        label="Identity document"
        onChange={(file) => updateField("identity_document", file)}
      />
    </>
  );
}

async function buildApplicationPayload(role, form) {
  if (role === "horse_owner") {
    return {
      stable_name: form.stable_name.trim(),
      address: form.address.trim(),
      license_number: form.license_number.trim(),
      ownership_type: form.ownership_type,
      tax_id: form.tax_id.trim() || undefined,
      identity_document_file_data: await readFileAsDataUri(form.identity_document),
      owner_license_document_file_data: await readFileAsDataUri(form.owner_license_document),
      horse_ownership_proof_file_data: await readFileAsDataUri(form.horse_ownership_proof),
    };
  }

  if (role === "jockey") {
    return {
      license_number: form.license_number.trim(),
      height: Number(form.height),
      weight_kg: Number(form.weight_kg),
      experience_years: Number(form.experience_years),
      medical_clearance_file_data: await readFileAsDataUri(form.medical_clearance),
      racing_license_document_file_data: await readFileAsDataUri(form.racing_license_document),
      riding_certificate_file_data: await readFileAsDataUri(form.riding_certificate),
      identity_document_file_data: await readFileAsDataUri(form.identity_document),
    };
  }

  return {
    license_number: form.license_number.trim(),
    experience_years: Number(form.experience_years),
    accreditation_body: form.accreditation_body.trim(),
    previous_official_role: form.previous_official_role.trim() || undefined,
    rules_training_certificate_file_data: await readFileAsDataUri(form.rules_training_certificate),
    background_check_file_data: await readFileAsDataUri(form.background_check),
    identity_document_file_data: await readFileAsDataUri(form.identity_document),
  };
}

function RoleApplications() {
  const auth = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const initialRole = applicationRoles.some((role) => role.value === searchParams.get("role"))
    ? searchParams.get("role")
    : "horse_owner";
  const [selectedRole, setSelectedRole] = useState(initialRole);
  const [forms, setForms] = useState(initialForms);
  const [applications, setApplications] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [formError, setFormError] = useState("");
  const [success, setSuccess] = useState("");

  const selectedRoleOption = getRoleOption(selectedRole);
  const Icon = selectedRoleOption.icon;
  const alreadyHasRole = auth.roles.includes(selectedRole);
  const hasPending = hasPendingApplication(applications, selectedRole);
  const hasApproved = hasApprovedApplication(applications, selectedRole);
  const selectedApplication = getLatestRoleApplication(applications, selectedRole);
  const canSubmit = !alreadyHasRole && !hasApproved;
  const submitLabel = hasPending ? "Resubmit application" : "Submit application";

  const stats = useMemo(() => ({
    pending: applications.filter((item) => item.status === "pending").length,
    approved: applications.filter((item) => item.status === "approved").length,
    rejected: applications.filter((item) => item.status === "rejected").length,
  }), [applications]);

  useEffect(() => {
    setSearchParams({ role: selectedRole }, { replace: true });
  }, [selectedRole, setSearchParams]);

  useEffect(() => {
    let cancelled = false;

    async function loadApplications() {
      setIsLoading(true);
      setLoadError("");

      try {
        const data = await roleApplicationApi.listMine();
        if (!cancelled) {
          setApplications(normalizeApplications(data));
        }
      } catch (error) {
        if (!cancelled) {
          setLoadError(error.message || "Unable to load your role applications.");
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    loadApplications();

    return () => {
      cancelled = true;
    };
  }, []);

  const updateFormField = (field, value) => {
    setFormError("");
    setSuccess("");
    setForms((current) => ({
      ...current,
      [selectedRole]: {
        ...current[selectedRole],
        [field]: value,
      },
    }));
  };

  const viewApplication = (application) => {
    const nextRole = application.requested_role;

    setSelectedRole(nextRole);
    setFormError("");
    setSuccess("");
    setForms((current) => ({
      ...current,
      [nextRole]: hydrateFormFromApplication(nextRole, application),
    }));
  };

  const fillSelectedApplication = () => {
    if (selectedApplication) {
      viewApplication(selectedApplication);
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (!canSubmit) {
      setFormError("This role already has an active or approved request.");
      return;
    }

    setIsSubmitting(true);
    setFormError("");
    setSuccess("");

    try {
      const payload = await buildApplicationPayload(selectedRole, forms[selectedRole]);
      await roleApplicationApi.apply(selectedRole, payload);
      const data = await roleApplicationApi.listMine();
      setApplications(normalizeApplications(data));
      setSuccess(`${selectedRoleOption.label} application ${hasPending ? "resubmitted" : "submitted"}. Admin review is now pending.`);
      setForms((current) => ({
        ...current,
        [selectedRole]: initialForms[selectedRole],
      }));
    } catch (error) {
      setFormError(error.message || "Unable to submit your role application.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <section className="role-application-page" aria-label="Role application">
      <div className="role-application-hero">
        <div>
          <p className="role-application-eyebrow">Role Access</p>
          <h1>Apply for a professional racing workspace</h1>
          <p>
            New accounts start as spectators. Submit the documents for the role you need,
            then an admin can approve access to the matching workspace.
          </p>
        </div>

        <div className="role-application-hero__panel">
          <BadgeCheck size={24} />
          <strong>{auth.user?.full_name || "Verified account"}</strong>
          <span>{auth.user?.email || "Ready for role review"}</span>
        </div>
      </div>

      <div className="role-application-stats" aria-label="Application status summary">
        <article>
          <strong>{stats.pending}</strong>
          <span>Pending</span>
        </article>
        <article>
          <strong>{stats.approved}</strong>
          <span>Approved</span>
        </article>
        <article>
          <strong>{stats.rejected}</strong>
          <span>Rejected</span>
        </article>
      </div>

      <div className="role-application-layout">
        <aside className="role-application-panel role-application-panel--roles">
          <div className="role-application-panel__header">
            <h2>Choose role</h2>
            <p>Pick one professional role request at a time.</p>
          </div>

          <div className="role-application-role-list">
            {applicationRoles.map((role) => {
              const RoleIcon = role.icon;
              const isActive = selectedRole === role.value;
              const isLocked = auth.roles.includes(role.value);
              return (
                <button
                  className={`role-application-role ${isActive ? "is-active" : ""}`}
                  key={role.value}
                  onClick={() => {
                    setSelectedRole(role.value);
                    setFormError("");
                    setSuccess("");
                  }}
                  type="button"
                >
                  <span><RoleIcon size={18} /></span>
                  <span>
                    <strong>{role.label}</strong>
                    <small>{isLocked ? "Already granted" : role.summary}</small>
                  </span>
                </button>
              );
            })}
          </div>
        </aside>

        <form className="role-application-panel role-application-form" onSubmit={handleSubmit}>
          <div className="role-application-panel__header role-application-form__header">
            <div>
              <span className="role-application-form__icon"><Icon size={20} /></span>
              <h2>{selectedRoleOption.label} request</h2>
              <p>{selectedRoleOption.summary}</p>
            </div>
            {hasPending && <span className="role-application-status role-application-status--pending">Pending</span>}
            {alreadyHasRole && <span className="role-application-status role-application-status--approved">Granted</span>}
          </div>

          {!canSubmit && (
            <div className="role-application-note">
              This role is already approved for your account.
            </div>
          )}

          {canSubmit && selectedApplication && (
            <div className="role-application-note role-application-note--editable">
              <div>
                <strong>{hasPending ? "Pending application is editable." : "Previous application found."}</strong>
                <span>Review the saved details, update any field, and send it again when ready.</span>
              </div>
              <button type="button" onClick={fillSelectedApplication}>
                <Pencil size={15} />
                Load details
              </button>
            </div>
          )}

          <div className="role-application-form__grid">
            <RoleSpecificFields form={forms[selectedRole]} role={selectedRole} updateField={updateFormField} />
          </div>

          {formError && <p className="auth-message auth-message--error">{formError}</p>}
          {success && <p className="auth-message auth-message--success">{success}</p>}

          <div className="role-application-form__actions">
            <button className="role-application-submit" disabled={isSubmitting || !canSubmit} type="submit">
              {isSubmitting ? <Loader2 size={18} /> : <Send size={18} />}
              {isSubmitting ? "Submitting..." : submitLabel}
            </button>
          </div>
        </form>

        <aside className="role-application-panel role-application-panel--history">
          <div className="role-application-panel__header">
            <h2>Review history</h2>
            <p>Track every professional access request from this account.</p>
          </div>
          <ApplicationHistory
            applications={applications}
            error={loadError}
            isLoading={isLoading}
            onViewApplication={viewApplication}
          />
        </aside>
      </div>
    </section>
  );
}

export default RoleApplications;
