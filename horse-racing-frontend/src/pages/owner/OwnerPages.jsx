import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  ArrowRight,
  Award,
  BadgeCheck,
  CalendarDays,
  CheckCircle2,
  Check,
  ChevronDown,
  ClipboardCheck,
  CreditCard,
  Edit3,
  Eye,
  FileText,
  Filter,
  Flag,
  HeartPulse,
  Info,
  Mail,
  MapPin,
  MessageSquareText,
  Phone,
  Plus,
  RotateCcw,
  Save,
  Search,
  Send,
  ShieldCheck,
  Trophy,
  Upload,
  UserRound,
  UsersRound,
  X,
} from "lucide-react";
import LoadingSkeleton from "../../components/LoadingSkeleton.jsx";
import { ownerApi } from "../../api/ownerApi";
import { readFileAsDataUri } from "../../utils/fileData";
import { canRequestRegistrationCancellation, findAcceptedPrimaryAssignment, findPrimaryAssignmentForRegistration, toHorsePayload, toOwnerJockey, toOwnerProfilePayload, toOwnerRaceOption, toOwnerScheduleEntry } from "./ownerAdapters";
import { useOwnerCancellationTickets, useOwnerHorse, useOwnerHorseApprovalStatus, useOwnerHorses, useOwnerJockeyAssignments, useOwnerJockeys, useOwnerPrizeAwards, useOwnerProfile, useOwnerRegistrations, useOwnerTournaments } from "./useOwnerData";

const statusClass = (status) => {
  if (["Ready", "Available", "Approved", "Assigned", "Accepted", "Standby confirmed", "Confirmed", "Published", "Won", "Verified", "Paid"].includes(status)) {
    return "owner-badge--green";
  }
  if (["Rejected", "Closed", "Cancelled", "Meet rejected", "Appointment rejected", "Terms rejected", "Contract rejected", "Replaced", "Disqualified"].includes(status)) {
    return "owner-badge--muted";
  }
  return "owner-badge--amber";
};

const formatMoney = (value, currency = "VND") => {
  const amount = Number(value || 0);

  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `${amount.toLocaleString("en-US")} ${currency}`;
  }
};

const getTodayInputValue = () => {
  const today = new Date();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");

  return `${today.getFullYear()}-${month}-${day}`;
};

const FactPills = ({ facts, emptyText = "No optional profile data recorded yet." }) => {
  if (!facts?.length) {
    return <div className="owner-fact-empty">{emptyText}</div>;
  }

  return (
    <div className="owner-roster-card__facts">
      {facts.map((fact) => (
        <span key={fact.label}>
          <small>{fact.label}</small>
          <strong>{fact.value}</strong>
        </span>
      ))}
    </div>
  );
};

const formatInvitationDate = (value) => {
  if (!value) return "Not scheduled";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
};

const toLocalDateTimeInputValue = (date = new Date()) => {
  const timezoneOffsetMs = date.getTimezoneOffset() * 60 * 1000;
  return new Date(date.getTime() - timezoneOffsetMs).toISOString().slice(0, 16);
};

const getValidDate = (value) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const isJockeyUnavailableForRace = (jockey) => Boolean(
  jockey && (jockey.availableForRace === false || String(jockey.availabilityReason || "").trim())
);

const getJockeyAvailabilityReason = (jockey) => {
  const reason = String(jockey?.availabilityReason || "").trim();
  return reason || "This Jockey is already committed for the selected race.";
};

const isMongoObjectId = (value) => /^[a-f\d]{24}$/i.test(String(value || ""));
const isUuidLike = (value) => /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(String(value || ""));

// Keep an owner's open invitation workspace in sync with jockey responses without
// interrupting the form they may be completing. This also works when the jockey
// responds from a different browser or device, where client-only events cannot help.
const ASSIGNMENT_REFRESH_INTERVAL_MS = 5000;

const compactRecordCode = (prefix, value) => {
  if (!value) return prefix;
  if (isMongoObjectId(value) || isUuidLike(value)) return `${prefix}-${String(value).slice(-6).toUpperCase()}`;
  return value;
};

const imageIndexForId = (value, length) => {
  const hash = Array.from(String(value || "horse")).reduce((total, character) => total + character.charCodeAt(0), 0);
  return hash % length;
};

const assignmentStatusLabel = (status) => ({
  meeting_invited: "Appointment invitation sent",
  meeting_accepted: "Appointment accepted",
  meeting_rejected: "Appointment rejected",
  terms_pending_confirmation: "Terms awaiting jockey",
  standby_terms_pending_confirmation: "Standby terms awaiting jockey",
  standby_confirmed: "Standby confirmed",
  terms_agreed: "Terms confirmed",
  terms_rejected: "Terms rejected",
  contract_uploaded: "Contract awaiting jockey",
  contract_rejected: "Contract rejected",
  accepted: "Accepted",
  replaced: "Replaced",
  cancelled: "Cancelled",
}[status] || status || "Unknown");

const assignmentStageLabel = (status) => ({
  meeting_invited: "Invite",
  meeting_accepted: "Appointment",
  terms_pending_confirmation: "Terms",
  standby_terms_pending_confirmation: "Standby terms",
  standby_confirmed: "Standby",
  terms_agreed: "Terms",
  terms_rejected: "Terms",
  contract_uploaded: "Contract",
  contract_rejected: "Contract",
  accepted: "Accepted",
  meeting_rejected: "Closed",
  replaced: "Closed",
  cancelled: "Closed",
}[status] || "Pending");

const activeAssignmentStatuses = [
  "meeting_invited",
  "meeting_accepted",
  "terms_pending_confirmation",
  "standby_terms_pending_confirmation",
  "standby_confirmed",
  "terms_agreed",
  "terms_rejected",
  "contract_uploaded",
  "accepted",
];

const lockedRaceStatuses = [
  "starting",
  "started",
  "running",
  "ongoing",
  "in_progress",
  "completed",
  "finished",
  "cancelled",
  "archived",
];

const normalizeAssignmentRecord = (item) => {
  if (!item) return item;

  if (item.status === "pending") {
    return { ...item, source_status: item.status, status: "meeting_invited" };
  }
  if (item.status === "rejected") {
    return { ...item, source_status: item.status, status: "meeting_rejected" };
  }
  if (item.assignment_type === "backup" && item.status === "terms_pending_confirmation") {
    return { ...item, source_status: item.status, status: "standby_terms_pending_confirmation" };
  }
  if (item.assignment_type === "backup" && ["terms_agreed", "contract_uploaded", "accepted"].includes(item.status)) {
    return { ...item, source_status: item.status, status: "standby_confirmed" };
  }
  return item;
};

const isAssignmentRaceLocked = (item) => {
  const raceStatus = String(item?.race_id?.status || item?.race_status || "").toLowerCase();
  return lockedRaceStatuses.includes(raceStatus);
};

const withdrawableAssignmentStatuses = [
  "meeting_accepted",
  "terms_pending_confirmation",
  "standby_terms_pending_confirmation",
  "terms_agreed",
  "terms_rejected",
  "contract_uploaded",
];

const assignmentPartyName = (party, fallback) => {
  if (!party) return fallback;
  if (typeof party === "string") return fallback;
  return party.name || party.user_id?.full_name || party.user_id?.email || fallback;
};

const PageHeader = ({ eyebrow, title, copy, action }) => (
  <section className="owner-page-header">
    <div>
      <p className="owner-eyebrow">{eyebrow}</p>
      <h1>{title}</h1>
      <p>{copy}</p>
    </div>
    {action}
  </section>
);

const StatStrip = ({ items }) => (
  <section className="owner-stats owner-stats--compact" aria-label="Page summary">
    {items.map((item) => {
      const Icon = item.icon;
      return (
        <article className="owner-stat-card" key={item.label}>
          <div className="owner-stat-card__icon"><Icon size={20} /></div>
          <span>{item.label}</span>
          <strong>{item.value}</strong>
          <small>{item.note}</small>
        </article>
      );
    })}
  </section>
);

const FormSelect = ({ label, value, options, onChange }) => {
  const [open, setOpen] = useState(false);

  return (
    <label className="owner-form-select" onBlur={(event) => {
      if (!event.currentTarget.contains(event.relatedTarget)) {
        setOpen(false);
      }
    }}>
      <span>{label}</span>
      <button
        aria-expanded={open}
        aria-haspopup="listbox"
        className="owner-form-select__trigger"
        onClick={() => setOpen((current) => !current)}
        type="button"
      >
        <span>{value}</span>
        <ChevronDown size={17} />
      </button>
      <div className={`owner-form-select__menu ${open ? "is-open" : ""}`} role="listbox">
        {options.map((option) => (
          <button
            aria-selected={option === value}
            className={option === value ? "is-selected" : ""}
            key={option}
            onClick={() => {
              onChange(option);
              setOpen(false);
            }}
            role="option"
            type="button"
          >
            <span>{option}</span>
            {option === value && <Check size={15} />}
          </button>
        ))}
      </div>
    </label>
  );
};

const horseRosterImages = [
  "https://i.pinimg.com/736x/16/b4/e0/16b4e0814c679b1a64548914e499497d.jpg",
  "https://i.pinimg.com/736x/28/b6/ab/28b6ab0f95a9f5945b17ba17a3800ae8.jpg",
  "https://i.pinimg.com/736x/94/98/ab/9498ab5a8136f433c8d716fec64a7556.jpg",
  "https://i.pinimg.com/1200x/0b/9c/f0/0b9cf065f5a0823c9870113e206bfbd6.jpg",
];

const horseRosterHeroImage = "https://equusmagazine.com/wp-content/uploads/migrations/equus/row-of-horses-in-stalls.jpg";
const scheduleHeroImage = "https://i.pinimg.com/1200x/ae/08/50/ae0850e67c950abd7e962008bc7ae3fb.jpg";
const resultsHeroImage = "https://i.pinimg.com/1200x/30/d4/ec/30d4ec1fb8d7efed15adf856c338efe6.jpg";
const profileFallbackAvatar = "https://avatarhub.edu.vn/wp-content/uploads/2025/12/avatar-mac-dinh-cua-fb-4.jpg";
const profileStableImage = "https://i.pinimg.com/1200x/a9/46/9e/a9469ee3363098f154678502a9eeef9b.jpg";
const jockeyImages = [
  "https://i.pinimg.com/1200x/3f/55/e7/3f55e7e4639c7c2ee3cdbcf489a6d5e2.jpg",
  "https://i.pinimg.com/736x/d1/dd/44/d1dd4409201964373f28d16d633fc569.jpg",
  "https://i.pinimg.com/736x/3b/1d/d1/3b1dd18d6fa76acd8ccebb7cdc580324.jpg",
  "https://i.pinimg.com/1200x/00/b2/be/00b2be2f7811cfb0a83ae76b43671681.jpg",
  "https://i.pinimg.com/1200x/08/90/20/0890207bd0afe2601b672277b40e912f.jpg",
];

function OwnerHorses() {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("All");
  const { horses, isLoading, error } = useOwnerHorses();
  const firstHorse = horses[0];
  const statusOptions = ["All", ...Array.from(new Set(horses.map((horse) => horse.status)))];

  const filteredHorses = horses.filter((horse) => {
    const text = `${horse.name} ${horse.registrationNumber} ${horse.breed} ${horse.gender} ${horse.color} ${horse.status}`.toLowerCase();
    return text.includes(query.toLowerCase()) && (status === "All" || horse.status === status);
  });

  if (isLoading) {
    return <div className="owner-horses-page"><LoadingSkeleton ariaLabel="Loading stable horses" rows={6} variant="cards" /></div>;
  }

  return (
    <div className="owner-horses-page">
      <section className="owner-horses-hero">
        <img src={horseRosterHeroImage} alt="Stable corridor for horse owner roster" />
        <div className="owner-horses-hero__copy">
          <p className="owner-eyebrow">Stable roster</p>
          <h1>Manage horse profiles with race-day context.</h1>
          <p>Search, review, and update every horse profile before registration, jockey assignment, or race confirmation.</p>
          <div className="owner-hero__actions">
            <Link className="owner-button owner-button--primary" to="/owner/horses/new"><Plus size={18} /> Add Horse</Link>
            <Link className="owner-button" to="/owner/registrations">Register tournament</Link>
          </div>
        </div>
        <aside className="owner-horses-hero__panel">
          <span className="owner-badge owner-badge--green"><BadgeCheck size={14} /> {horses.filter((horse) => horse.status === "Ready").length} active profiles</span>
          <strong>{firstHorse?.name || "No horses yet"}</strong>
          <p>{firstHorse?.healthNote || "Create the first horse profile to begin managing your stable."}</p>
        </aside>
      </section>

      <StatStrip
        items={[
          { label: "Stable horses", value: horses.length, note: "Registered profiles", icon: HeartPulse },
          { label: "Active profiles", value: horses.filter((horse) => horse.status === "Ready").length, note: "Current horse status", icon: BadgeCheck },
          { label: "Health notes", value: horses.filter((horse) => horse.healthNote).length, note: "Profiles with vet context", icon: ClipboardCheck },
          { label: "Images", value: horses.filter((horse) => horse.imageUrl).length, note: "Uploaded horse media", icon: FileText },
        ]}
      />

      {error && <div className="owner-empty owner-empty--error">{error}</div>}

      <div className="owner-toolbar">
        <label className="owner-search">
          <Search size={17} />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search horse, code, breed..." />
        </label>
        <label className="owner-select">
          <Filter size={17} />
          <select value={status} onChange={(event) => setStatus(event.target.value)}>
            {statusOptions.map((option) => <option key={option}>{option}</option>)}
          </select>
        </label>
      </div>

      <section className="owner-roster-grid">
        {filteredHorses.map((horse, index) => (
          <article className="owner-roster-card" key={horse.id}>
            <Link className="owner-roster-card__media" to={`/owner/horses/${horse.id}`}>
              <img src={horse.imageUrl || horseRosterImages[index % horseRosterImages.length]} alt={`${horse.name} profile`} />
              <span className={`owner-badge ${statusClass(horse.status)}`}>{horse.status}</span>
            </Link>
            <div className="owner-roster-card__body">
              <div className="owner-roster-card__title">
                <div>
                  <span className="owner-kicker">{horse.registrationNumber || compactRecordCode("Horse", horse.id)}</span>
                  <h2>{horse.name}</h2>
                </div>
                <span className={`owner-roster-card__status ${statusClass(horse.status)}`}>{horse.status}</span>
              </div>

              <FactPills facts={horse.facts} />

              {horse.healthNote
                ? <p className="owner-roster-card__note"><HeartPulse size={15} /> {horse.healthNote}</p>
                : <div className="owner-fact-empty owner-fact-empty--note"><HeartPulse size={15} /> No health status recorded.</div>}

              <div className="owner-roster-card__actions">
                <Link className="owner-roster-action owner-roster-action--primary" to={`/owner/horses/${horse.id}`}>View</Link>
                <Link className="owner-roster-action" to={`/owner/horses/${horse.id}/edit`}>Edit</Link>
                <Link className="owner-roster-action" to="/owner/registrations">Register</Link>
              </div>
            </div>
          </article>
        ))}
      </section>

      {filteredHorses.length === 0 && <div className="owner-empty">No horses match this filter.</div>}
    </div>
  );
}

function OwnerHorseForm({ mode = "new" }) {
  const { horseId } = useParams();
  const isEdit = mode === "edit";
  const navigate = useNavigate();
  const { horse: existingHorse, isLoading, error: loadError } = useOwnerHorse(isEdit ? horseId : null);
  const horseIndex = imageIndexForId(existingHorse?.id || horseId, horseRosterImages.length);
  const horseImage = horseRosterImages[Math.max(horseIndex, 0) % horseRosterImages.length];
  const todayInputValue = getTodayInputValue();
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [form, setForm] = useState({
    name: "",
    registrationNumber: "",
    breed: "Thoroughbred",
    dateOfBirth: "",
    weight: "",
    status: "Ready",
    healthNote: "",
    imageFile: null,
    imageFileName: "",
  });

  useEffect(() => {
    if (!existingHorse) return;

    setForm({
      name: existingHorse.name,
      registrationNumber: existingHorse.registrationNumber,
      breed: existingHorse.breed || "Other",
      dateOfBirth: existingHorse.dateOfBirth,
      weight: existingHorse.weight,
      status: existingHorse.status,
      healthNote: existingHorse.healthNote,
      imageFile: null,
      imageFileName: "",
    });
  }, [existingHorse]);

  const updateField = (field, value) => {
    setSaved(false);
    setError("");
    setForm((current) => ({ ...current, [field]: value }));
  };

  const actionPath = isEdit && existingHorse ? `/owner/horses/${existingHorse.id}` : "/owner/horses";

  const updateImageFile = (file) => {
    setSaved(false);
    setError("");
    setForm((current) => ({
      ...current,
      imageFile: file,
      imageFileName: file?.name || "",
    }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (!form.name.trim()) {
      setError("Horse name is required.");
      return;
    }

    if (!form.registrationNumber.trim()) {
      setError("Registration number is required.");
      return;
    }

    if (form.dateOfBirth && form.dateOfBirth > todayInputValue) {
      setError("Date of birth cannot be in the future.");
      return;
    }

    setIsSubmitting(true);
    setError("");
    setSaved(false);

    try {
      const payload = toHorsePayload(form);
      const imageFileData = form.imageFile ? await readFileAsDataUri(form.imageFile) : "";

      if (isEdit && existingHorse) {
        await ownerApi.updateHorse(existingHorse.id, payload);
        if (imageFileData) {
          await ownerApi.updateHorseMedia(existingHorse.id, { image_file_data: imageFileData });
        }
        setSaved(true);
      } else {
        if (imageFileData) {
          payload.image_file_data = imageFileData;
        }
        const data = await ownerApi.createHorse(payload);
        navigate(`/owner/horses/${data.horse._id}`, { replace: true });
      }
    } catch (apiError) {
      setError(apiError.message || "Unable to save horse profile.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isEdit && isLoading) {
    return <div className="owner-horse-form-page"><LoadingSkeleton ariaLabel="Loading horse profile" variant="detail" /></div>;
  }

  if (isEdit && loadError) {
    return <div className="owner-empty owner-empty--error">{loadError}</div>;
  }

  return (
    <div className="owner-horse-form-page">
      <section className="owner-horse-form-hero">
        <div className="owner-horse-form-hero__copy">
          <Link className="owner-detail-back" to={actionPath}>Back to {isEdit ? "profile" : "horses"}</Link>
          <p className="owner-eyebrow">{isEdit ? `${existingHorse?.registrationNumber} profile` : "New horse profile"}</p>
          <h1>{isEdit ? `Edit ${existingHorse?.name}` : "Create a race-ready horse file"}</h1>
          <p>Update the details owners, admins, and referees can read from the horse profile contract.</p>
        </div>
        <aside className="owner-horse-form-preview" aria-label="Horse profile preview">
          <img src={existingHorse?.imageUrl || horseImage} alt={`${isEdit ? existingHorse?.name : "New horse"} profile preview`} />
          <div className="owner-horse-form-preview__card">
            <span className={`owner-badge ${statusClass(form.status)}`}>{form.status}</span>
            <strong>{form.name || "Unnamed horse"}</strong>
            <small>{form.registrationNumber || "No registration"} / {form.breed}</small>
          </div>
        </aside>
      </section>

      <form className="owner-horse-form-shell" onSubmit={handleSubmit}>
        <div className="owner-form-main">
          <section className="owner-form-section">
            <div className="owner-form-section__header">
              <span className="owner-kicker">Identity</span>
              <h2>Horse details</h2>
            </div>
            <div className="owner-form-grid">
              <label>Name<input value={form.name} onChange={(event) => updateField("name", event.target.value)} required /></label>
              <label>Registration number<input value={form.registrationNumber} onChange={(event) => updateField("registrationNumber", event.target.value)} required /></label>
              <FormSelect label="Breed" value={form.breed} options={["Thoroughbred", "Warmblood", "Arabian", "Quarter Horse", "Standardbred", "Other"]} onChange={(value) => updateField("breed", value)} />
              <label>Date of birth<input type="date" max={todayInputValue} value={form.dateOfBirth} onChange={(event) => updateField("dateOfBirth", event.target.value)} /></label>
              <label>Weight<input value={form.weight} onChange={(event) => updateField("weight", event.target.value)} /></label>
              <label className="owner-form-span owner-profile-image-field">
                <span className="owner-profile-image-field__title">Profile image</span>
                <input className="owner-profile-image-field__input" accept="image/*" type="file" onChange={(event) => updateImageFile(event.target.files?.[0] || null)} />
                {form.imageFileName && <small className="owner-form-hint">Selected: {form.imageFileName}</small>}
              </label>
            </div>
          </section>

          <section className="owner-form-section">
            <div className="owner-form-section__header">
              <span className="owner-kicker">Profile state</span>
              <h2>Owner visibility</h2>
            </div>
            <div className="owner-form-grid">
              <FormSelect label="Status" value={form.status} options={["Ready", "Needs review", "Closed"]} onChange={(value) => updateField("status", value)} />
            </div>
          </section>

          <section className="owner-form-section">
            <div className="owner-form-section__header">
              <span className="owner-kicker">Health notes</span>
              <h2>Referee and vet context</h2>
            </div>
            <label className="owner-form-note">Health note<textarea value={form.healthNote} onChange={(event) => updateField("healthNote", event.target.value)} placeholder="Add referee, vet, or readiness notes..." /></label>
          </section>

          <div className="owner-form-actions">
            {saved && <span className="owner-success"><CheckCircle2 size={16} /> Profile saved.</span>}
            {error && <span className="owner-success owner-success--error">{error}</span>}
            <Link className="owner-button" to={actionPath}>Cancel</Link>
            <button className="owner-button owner-button--primary" disabled={isSubmitting} type="submit">
              {isSubmitting ? "Saving..." : isEdit ? "Save Changes" : "Create Horse"}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}

function OwnerHorseDetail() {
  const { horseId } = useParams();
  const { horse, isLoading, error } = useOwnerHorse(horseId);
  const { approvalStatus, error: approvalError, isLoading: approvalLoading } = useOwnerHorseApprovalStatus(horseId);
  const navigate = useNavigate();
  const [actionMessage, setActionMessage] = useState("");
  const [isDeactivating, setIsDeactivating] = useState(false);

  if (isLoading) {
    return <div className="owner-horse-detail-page"><LoadingSkeleton ariaLabel="Loading horse profile" variant="detail" /></div>;
  }

  if (error || !horse) {
    return <div className="owner-empty owner-empty--error">{error || "Horse not found."}</div>;
  }

  const horseImage = horseRosterImages[imageIndexForId(horse.id, horseRosterImages.length)];
  const registrations = approvalStatus?.registrations || [];
  const schedule = registrations.map(toOwnerScheduleEntry);
  const summaryFacts = [
    horse.age !== "Not set" ? { label: "Age", value: `${horse.age} yrs`, icon: HeartPulse } : null,
    horse.breed ? { label: "Breed", value: horse.breed, icon: Flag } : null,
    horse.weight ? { label: "Weight", value: horse.weight, icon: Award } : null,
    { label: "Rating", value: horse.currentRating, icon: Trophy },
    registrations.length ? { label: "Registrations", value: registrations.length, icon: ClipboardCheck } : null,
  ].filter(Boolean);

  const handleDeactivate = async () => {
    if (!window.confirm(`Deactivate ${horse.name}?`)) return;

    setIsDeactivating(true);
    setActionMessage("");

    try {
      await ownerApi.deactivateHorse(horse.id);
      navigate("/owner/horses", { replace: true });
    } catch (apiError) {
      setActionMessage(apiError.message || "Unable to deactivate horse.");
    } finally {
      setIsDeactivating(false);
    }
  };

  return (
    <div className="owner-horse-detail-page">
      <section className="owner-detail-hero">
        <div className="owner-detail-hero__copy">
          <Link className="owner-detail-back" to="/owner/horses">Back to horses</Link>
          <p className="owner-eyebrow">{horse.registrationNumber || compactRecordCode("Horse", horse.id)}{horse.breed ? ` / ${horse.breed}` : ""}</p>
          <h1>{horse.name}</h1>
          <p>{horse.healthNote || "No health status recorded for this horse yet."}</p>
          <div className="owner-hero__actions">
            <Link className="owner-button owner-button--primary" to={`/owner/horses/${horse.id}/edit`}><Edit3 size={18} /> Edit Profile</Link>
            <Link className="owner-button" to="/owner/registrations">Register Tournament</Link>
            <Link className="owner-button" to="/owner/jockeys">Assign Jockey</Link>
            <button className="owner-button" disabled={isDeactivating} type="button" onClick={handleDeactivate}>
              {isDeactivating ? "Deactivating..." : "Deactivate"}
            </button>
          </div>
          {actionMessage && <p className="owner-success owner-success--error">{actionMessage}</p>}
        </div>
        <aside className="owner-detail-hero__media">
          <img src={horse.imageUrl || horseImage} alt={`${horse.name} horse profile`} />
          <div className="owner-detail-photo-card">
            <span className={`owner-badge ${statusClass(horse.status)}`}>{horse.status}</span>
            <strong>{horse.registrationNumber || compactRecordCode("Horse", horse.id)}</strong>
            <small>{horse.facts.length ? horse.facts.map((fact) => fact.value).join(" / ") : "Optional profile details not recorded."}</small>
          </div>
        </aside>
      </section>

      <section className="owner-detail-summary" aria-label="Horse summary">
        {summaryFacts.map((item) => {
          const Icon = item.icon;
          return (
            <article className="owner-detail-summary__item" key={item.label}>
              <Icon size={18} />
              <span>{item.label}</span>
              <strong>{item.value}</strong>
            </article>
          );
        })}
        {summaryFacts.length === 0 && <div className="owner-empty owner-empty--compact">No optional horse profile facts have been recorded yet.</div>}
      </section>

      <section className="owner-detail-main">
        <article className="owner-card owner-detail-focus">
          <div className="owner-card__header">
            <div>
              <span className="owner-kicker">Race context</span>
              <h2>Next owner decisions</h2>
            </div>
            <CalendarDays size={20} />
          </div>
          <div className="owner-detail-decision-grid">
            <div>
              <span>Profile status</span>
              <strong>{horse.status}</strong>
              <small>Status comes from the horse record.</small>
            </div>
            <div>
              <span>Registration state</span>
              <strong>{registrations[0]?.status ?? "Not submitted"}</strong>
              <small>{registrations[0]?.note ?? "Create a tournament entry when ready."}</small>
            </div>
            <div>
              <span>Next race</span>
              <strong>{schedule[0]?.race || "Not scheduled"}</strong>
              <small>{schedule[0] ? `${schedule[0].date} / ${schedule[0].tournament}` : "Approved registrations create schedule context."}</small>
            </div>
          </div>
        </article>

        <article className="owner-card">
          <div className="owner-card__header">
            <div>
              <span className="owner-kicker">Approval status</span>
              <h2>Race readiness</h2>
            </div>
            <ShieldCheck size={20} />
          </div>
          {approvalLoading && <LoadingSkeleton ariaLabel="Loading approval status" variant="inline" />}
          {approvalError && <div className="owner-empty owner-empty--compact owner-empty--error">{approvalError}</div>}
          {approvalStatus && (
            <div className="owner-detail-summary" style={{ gridTemplateColumns: "repeat(3, minmax(0, 1fr))" }}>
              <div className="owner-detail-summary__item">
                <ShieldCheck size={18} />
                <span>Ready</span>
                <strong>{approvalStatus.readyToRace ? "Yes" : "No"}</strong>
              </div>
              <div className="owner-detail-summary__item">
                <ClipboardCheck size={18} />
                <span>Registrations</span>
                <strong>{approvalStatus.registrations.length}</strong>
              </div>
              <div className="owner-detail-summary__item">
                <HeartPulse size={18} />
                <span>Checks</span>
                <strong>{approvalStatus.checks.length}</strong>
              </div>
            </div>
          )}
        </article>

        <article className="owner-card">
          <div className="owner-card__header">
            <div>
              <span className="owner-kicker">Approvals</span>
              <h2>Registrations</h2>
            </div>
            <ClipboardCheck size={20} />
          </div>
          <div className="owner-detail-registration-list">
            {registrations.map((item) => (
              <div className="owner-detail-registration" key={item.id}>
                <span>{item.id}</span>
                <div>
                  <strong>{item.tournament}</strong>
                  <small>{item.submitted} / {item.note}</small>
                </div>
                <span className={`owner-badge ${statusClass(item.status)}`}>{item.status}</span>
              </div>
            ))}
            {registrations.length === 0 && <div className="owner-empty owner-empty--compact">No registrations yet.</div>}
          </div>
        </article>
      </section>

      <section className="owner-detail-main owner-detail-main--lower">
        <article className="owner-card">
          <div className="owner-card__header">
            <div>
              <span className="owner-kicker">Calendar</span>
              <h2>Upcoming races</h2>
            </div>
            <CalendarDays size={20} />
          </div>
          <div className="owner-detail-race-list">
            {schedule.map((race) => (
              <div className="owner-detail-race" key={race.id}>
                <div className="owner-detail-race__time"><CalendarDays size={16} /><span>{race.time}</span></div>
                <div>
                  <h3>{race.race}</h3>
                  <span>{race.tournament} / {race.round}</span>
                  <small><MapPin size={13} /> {race.venue}</small>
                </div>
                <span className={`owner-badge ${statusClass(race.status)}`}>{race.status}</span>
              </div>
            ))}
            {schedule.length === 0 && <div className="owner-empty owner-empty--compact">No upcoming races.</div>}
          </div>
        </article>

        <article className="owner-card owner-detail-results">
          <div className="owner-card__header">
            <div>
              <span className="owner-kicker">Performance</span>
              <h2>Recent results</h2>
            </div>
            <Trophy size={20} />
          </div>
          <div className="owner-empty owner-empty--compact" role="status">
            Published results are not available for Horse Owners yet.
          </div>
        </article>
      </section>
    </div>
  );
}

function OwnerRegistrations() {
  const { horses: liveHorses, isLoading: horsesLoading, error: horsesError } = useOwnerHorses();
  const { tournaments: liveTournaments, isLoading: tournamentsLoading, error: tournamentsError } = useOwnerTournaments();
  const {
    registrations: liveRegistrations,
    isLoading: registrationsLoading,
    error: registrationsError,
    reload: reloadRegistrations,
  } = useOwnerRegistrations();
  const {
    tickets: cancellationTickets,
    isLoading: cancellationTicketsLoading,
    error: cancellationTicketsError,
    reload: reloadCancellationTickets,
  } = useOwnerCancellationTickets();
  const horses = liveHorses;
  const tournaments = liveTournaments;
  const registrations = liveRegistrations;
  const approvedCount = registrations.filter((item) => item.status === "Approved").length;
  const [races, setRaces] = useState([]);
  const [racesLoading, setRacesLoading] = useState(false);
  const [activeTab, setActiveTab] = useState("register");
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [cancellationRegistration, setCancellationRegistration] = useState(null);
  const [cancellationReason, setCancellationReason] = useState("");
  const [cancellationSubmitting, setCancellationSubmitting] = useState(false);
  const [confirmingRefundId, setConfirmingRefundId] = useState("");
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [horseQuery, setHorseQuery] = useState("");
  const [tournamentQuery, setTournamentQuery] = useState("");
  const [entriesQuery, setEntriesQuery] = useState("");
  const [detailsRace, setDetailsRace] = useState(null);
  const [entry, setEntry] = useState({
    horseId: "",
    tournamentId: "",
    raceId: "",
    note: "",
  });
  const selectedHorse = horses.find((horse) => horse.id === entry.horseId) ?? null;
  const selectedTournament = tournaments.find((tournament) => tournament.id === entry.tournamentId) ?? null;
  const selectedRace = races.find((race) => race.id === entry.raceId) ?? null;
  const filteredHorses = horses.filter((horse) => (
    `${horse.name} ${horse.registrationNumber} ${horse.breed} ${horse.gender} ${horse.color} ${horse.status}`
      .toLowerCase()
      .includes(horseQuery.trim().toLowerCase())
  ));
  const filteredTournaments = tournaments.filter((tournament) => (
    `${tournament.name} ${tournament.location} ${tournament.date} ${tournament.status}`
      .toLowerCase()
      .includes(tournamentQuery.trim().toLowerCase())
  ));
  const filteredRegistrations = registrations.filter((registration) => (
    `${registration.id} ${registration.horse} ${registration.tournament} ${registration.race} ${registration.status} ${registration.submitted} ${registration.note}`
      .toLowerCase()
      .includes(entriesQuery.trim().toLowerCase())
  ));
  const tournamentPrizePool = selectedTournament?.prizePool || races.reduce((total, race) => total + Number(race.prizePool || 0), 0);
  const tournamentPrizeCurrency = selectedTournament?.prizeCurrency || selectedRace?.prizeCurrency || "VND";
  const registrationFeeVnd = Number(selectedRace?.entryFeeVnd || 0);
  const registrationFeeCurrency = selectedRace?.entryFeeCurrency || "VND";

  useEffect(() => {
    let cancelled = false;

    async function loadRaces() {
      if (!selectedTournament?.id) {
        setRaces([]);
        return;
      }

      setRaces([]);
      setEntry((current) => ({ ...current, raceId: "" }));
      setRacesLoading(true);
      setError("");

      try {
        const data = await ownerApi.getTournamentRaces(selectedTournament.id);
        if (!cancelled) {
          const nextRaces = (data.races || []).map(toOwnerRaceOption);
          setRaces(nextRaces);
        }
      } catch (apiError) {
        if (!cancelled) {
          setRaces([]);
          setError(apiError.message || "Unable to load races for tournament.");
        }
      } finally {
        if (!cancelled) {
          setRacesLoading(false);
        }
      }
    }

    loadRaces();

    return () => {
      cancelled = true;
    };
  }, [selectedTournament?.id]);

  useEffect(() => {
    if (!detailsRace) return undefined;

    const handleKeyDown = (event) => {
      if (event.key === "Escape") setDetailsRace(null);
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [detailsRace]);

  const updateEntry = (field, value) => {
    setSaved(false);
    setError("");
    if (["horseId", "tournamentId", "raceId"].includes(field)) {
      setTermsAccepted(false);
    }
    setEntry((current) => ({ ...current, [field]: value }));
  };

  const selectTournament = (tournamentId) => {
    setSaved(false);
    setError("");
    setTermsAccepted(false);
    setEntry((current) => ({ ...current, tournamentId, raceId: "" }));
  };

  const isHorseEligible = (horse) => {
    const sourceStatus = String(horse?.raw?.status || "").toLowerCase();
    return sourceStatus ? sourceStatus === "active" : horse?.status === "Ready";
  };

  const getRaceEntryState = (race) => {
    const alreadyEntered = selectedHorse && registrations.some((registration) => (
      String(registration.horseId) === String(selectedHorse.id)
      && String(registration.raceId) === String(race.id)
      && !["Cancelled", "Rejected"].includes(registration.status)
    ));

    if (alreadyEntered) {
      return { available: false, label: "Already entered", reason: `${selectedHorse.name} already has an active entry in this race.` };
    }
    if (race.registrationAvailable) {
      return { available: true, label: "Open", reason: "Available for registration." };
    }

    const reason = race.registrationUnavailableReason || "Registration is not available for this race.";
    const normalizedReason = reason.toLowerCase();
    if (race.remainingSlots === 0 || normalizedReason.includes("full") || normalizedReason.includes("capacity")) {
      return { available: false, label: "Full", reason };
    }
    if (normalizedReason.includes("lock") || normalizedReason.includes("closed") || normalizedReason.includes("deadline")) {
      return { available: false, label: "Entries closed", reason };
    }
    return { available: false, label: "Unavailable", reason };
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSaved(false);
    setError("");

    if (!selectedHorse?.id) {
      setError("Select a horse before submitting.");
      return;
    }

    if (!selectedRace?.id) {
      setError("Select an open race before submitting.");
      return;
    }

    if (!termsAccepted) {
      setError("Confirm the entry and pre-race inspection terms before submitting.");
      return;
    }

    setIsSubmitting(true);

    try {
      const result = await ownerApi.registerHorseForRace({
        horse_id: selectedHorse.id,
        race_id: selectedRace.id,
        note: entry.note,
        payment_method: "VNPAY",
      });

      if (result.payment_url) {
        window.location.assign(result.payment_url);
        return;
      }

      const [, raceData] = await Promise.all([
        reloadRegistrations(),
        ownerApi.getTournamentRaces(selectedTournament.id),
      ]);
      const nextRaces = (raceData.races || []).map(toOwnerRaceOption);
      setRaces(nextRaces);
      setEntry((current) => ({
        ...current,
        raceId: "",
        note: "",
      }));
      setTermsAccepted(false);
      setSaved(true);
      setActiveTab("entries");
    } catch (apiError) {
      setError(apiError.message || "Unable to submit race registration.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const openCancellationRequest = (registration) => {
    setSaved(false);
    setError("");
    if (!canRequestRegistrationCancellation(registration)) {
      setError("This race has already started and the registration can no longer be cancelled.");
      return;
    }
    setCancellationReason("");
    setCancellationRegistration(registration);
  };

  const submitCancellationRequest = async (event) => {
    event.preventDefault();
    if (!cancellationRegistration) return;
    if (!canRequestRegistrationCancellation(cancellationRegistration)) {
      setCancellationRegistration(null);
      setCancellationReason("");
      setError("This race has already started and the registration can no longer be cancelled.");
      return;
    }
    if (!cancellationReason.trim()) {
      setError("Please provide a cancellation reason.");
      return;
    }
    setCancellationSubmitting(true);
    setError("");
    try {
      await ownerApi.createCancellationTicket(cancellationRegistration.id, cancellationReason.trim());
      await reloadCancellationTickets();
      setCancellationRegistration(null);
      setCancellationReason("");
      setSaved(true);
    } catch (apiError) {
      setError(apiError.message || "Unable to submit cancellation request.");
    } finally {
      setCancellationSubmitting(false);
    }
  };

  const confirmRefundReceipt = async (ticket) => {
    setConfirmingRefundId(ticket._id);
    setError("");
    try {
      await ownerApi.confirmRefundReceipt(ticket._id);
      await Promise.all([reloadCancellationTickets(), reloadRegistrations()]);
      setSaved(true);
    } catch (apiError) {
      setError(apiError.message || "Unable to confirm refund receipt.");
    } finally {
      setConfirmingRefundId("");
    }
  };

  const cancellationTicketFor = (registrationId) => cancellationTickets.find((ticket) => (
    String(ticket.registration_id?._id || ticket.registration_id || "") === String(registrationId)
  ));

  if (horsesLoading || tournamentsLoading || registrationsLoading || cancellationTicketsLoading) {
    return <div className="owner-registration-page"><LoadingSkeleton ariaLabel="Loading registration workspace" variant="page" /></div>;
  }

  const selectedRaceState = selectedRace ? getRaceEntryState(selectedRace) : null;
  const canSubmit = Boolean(
    selectedHorse?.id
    && isHorseEligible(selectedHorse)
    && selectedTournament?.id
    && selectedRace?.id
    && selectedRaceState?.available
    && termsAccepted
  );
  const submissionBlockReason = (() => {
    if (!selectedHorse?.id) return "Select an eligible horse to continue.";
    if (!isHorseEligible(selectedHorse)) return "The selected horse is not active.";
    if (!selectedTournament?.id) return "Choose a tournament to continue.";
    if (racesLoading) return "The race programme is still loading.";
    if (!selectedRace?.id) return "Choose an open race to continue.";
    if (!selectedRaceState?.available) {
      return selectedRaceState?.reason || "The selected race is not accepting entries.";
    }
    if (!termsAccepted) return "Accept the entry and pre-race inspection conditions.";
    return "";
  })();

  return (
    <div className="owner-registration-page">
      {(horsesError || tournamentsError || registrationsError || cancellationTicketsError) && (
        <section className="admin-live-state admin-live-state--warning" aria-live="polite">
          {horsesError || tournamentsError || registrationsError || cancellationTicketsError}
        </section>
      )}

      {!horsesError && !tournamentsError && !registrationsError && (!horses.length || !tournaments.length) && (
        <section className="admin-live-state" aria-live="polite">
          {!horses.length
            ? "Add an active horse profile before submitting a race registration."
            : "No tournaments are currently available for registration."}
        </section>
      )}

      <section className="owner-entry-header">
        <div>
          <p className="owner-eyebrow">Tournament entries</p>
          <h1>Race Registration</h1>
          <p>Choose an eligible horse, compare available races, then review the entry before payment.</p>
        </div>
        <span className="owner-badge owner-badge--green"><ClipboardCheck size={14} /> {approvedCount} confirmed</span>
      </section>

      <div className="owner-entry-tabs" role="tablist" aria-label="Race registration views">
        <button aria-selected={activeTab === "register"} className={activeTab === "register" ? "is-active" : ""} onClick={() => setActiveTab("register")} role="tab" type="button">
          Register for a race
        </button>
        <button aria-selected={activeTab === "entries"} className={activeTab === "entries" ? "is-active" : ""} onClick={() => setActiveTab("entries")} role="tab" type="button">
          My entries <span>{registrations.length}</span>
        </button>
      </div>

      {activeTab === "register" && (
      <section className="owner-registration-workspace">
        <form className="owner-entry-workspace" onSubmit={handleSubmit}>
          <div className="owner-entry-main">
          <section className="owner-entry-section" aria-labelledby="choose-horse-heading">
            <div className="owner-entry-section__header">
              <span className={`owner-entry-step${selectedHorse ? " is-complete" : ""}`}>1</span>
              <div>
                <span className="owner-kicker">Choose horse</span>
                <h2 id="choose-horse-heading">Select the horse you want to enter</h2>
                <p className="owner-entry-section__description">Choose one active horse from your stable. The selected profile will be paired with the race below.</p>
              </div>
            </div>
            <div className="owner-entry-horse-toolbar">
              <label className="owner-entry-search">
                <Search size={17} aria-hidden="true" />
                <input
                  aria-label="Search horses by name"
                  onChange={(event) => setHorseQuery(event.target.value)}
                  placeholder="Search by horse name or registration number"
                  type="search"
                  value={horseQuery}
                />
                {horseQuery && (
                  <button aria-label="Clear horse search" onClick={() => setHorseQuery("")} type="button">
                    <X size={15} />
                  </button>
                )}
              </label>
              <span className="owner-entry-results"><strong>{filteredHorses.length}</strong> of {horses.length} horses</span>
            </div>
            <div className="owner-entry-horse-list" role="listbox" aria-label="Eligible horses">
              {filteredHorses.map((horse) => {
                const eligible = isHorseEligible(horse);
                const selected = selectedHorse?.id === horse.id;
                return (
                  <button
                    aria-disabled={!eligible}
                    aria-selected={selected}
                    className={`owner-entry-horse${selected ? " is-selected" : ""}${!eligible ? " is-unavailable" : ""}`}
                    key={horse.id}
                    onClick={() => eligible && updateEntry("horseId", horse.id)}
                    role="option"
                    type="button"
                  >
                    <span className="owner-entry-horse__marker" aria-hidden="true">{selected ? <Check size={15} /> : null}</span>
                    <span className="owner-entry-horse__identity">
                      <strong>{horse.name}</strong>
                      <small>{horse.registrationNumber || compactRecordCode("Horse", horse.id)}</small>
                    </span>
                    <span className="owner-entry-horse__facts">
                      {horse.facts.filter((fact) => fact.label !== "Rating").slice(0, 5).map((fact) => (
                        <span key={fact.label}><small>{fact.label}</small>{fact.value}</span>
                      ))}
                    </span>
                    <span className={`owner-badge ${eligible ? "owner-badge--green" : "owner-badge--muted"}`}>{eligible ? "Eligible" : "Inactive"}</span>
                  </button>
                );
              })}
              {!horses.length && <div className="owner-empty owner-empty--compact">No horse profiles are available.</div>}
              {!!horses.length && !filteredHorses.length && <div className="owner-entry-empty-search"><Search size={18} /><strong>No horses found</strong><span>Try a different name or registration number.</span></div>}
            </div>
          </section>

          <section className="owner-entry-section owner-tournament-browser" aria-labelledby="choose-race-heading">
            <div className="owner-tournament-browser__header">
              <div>
                <span className={`owner-entry-step${selectedRace ? " is-complete" : ""}`}>2</span>
                <span className="owner-kicker">Choose race</span>
                <h3 id="choose-race-heading">Choose a tournament, then compare its races</h3>
                <p>Review the race conditions, available places, entry fee and prize before selecting.</p>
              </div>
              <div className="owner-tournament-browser__tools">
                <div className="owner-tournament-search__label">
                  <span>Find a tournament</span>
                  <strong>{filteredTournaments.length} available</strong>
                </div>
                <label className="owner-tournament-search">
                  <Search size={17} aria-hidden="true" />
                  <input
                    aria-label="Search tournaments"
                    onChange={(event) => setTournamentQuery(event.target.value)}
                    placeholder="Search by name or venue"
                    type="search"
                    value={tournamentQuery}
                  />
                  {tournamentQuery && (
                    <button aria-label="Clear tournament search" onClick={() => setTournamentQuery("")} type="button">
                      <X size={15} />
                    </button>
                  )}
                </label>
              </div>
            </div>
            <div className="owner-tournament-list">
              {filteredTournaments.map((tournament) => (
                <button
                  aria-pressed={selectedTournament?.id === tournament.id}
                  className={`owner-tournament-choice${selectedTournament?.id === tournament.id ? " is-selected" : ""}`}
                  key={tournament.id}
                  onClick={() => selectTournament(tournament.id)}
                  type="button"
                >
                  <span className="owner-tournament-choice__top">
                    <span className="owner-registration__id">{compactRecordCode("TOUR", tournament.id)}</span>
                    <span className={`owner-badge ${statusClass(tournament.status)}`}>{tournament.status}</span>
                  </span>
                  <strong>{tournament.name}</strong>
                  <span className="owner-tournament-choice__meta">
                    <span><CalendarDays size={14} /> {tournament.date || "Dates pending"}</span>
                    <span><MapPin size={14} /> {tournament.location || "Venue pending"}</span>
                  </span>
                  <span className="owner-tournament-choice__footer">
                    <span>{tournament.raceCount ? `${tournament.raceCount} races` : "Race programme available"}</span>
                    <span>{tournament.prizePool > 0 ? `${formatMoney(tournament.prizePool, tournament.prizeCurrency)} total prizes` : "Race prizes pending"}</span>
                  </span>
                </button>
              ))}
            </div>
            {!filteredTournaments.length && (
              <div className="owner-empty owner-empty--compact">No tournaments match "{tournamentQuery}".</div>
            )}
          </section>

          {!selectedTournament && (
            <div className="owner-entry-guidance"><Flag size={18} /> Choose a tournament to view its race programme.</div>
          )}
          {selectedTournament && <section className="owner-race-picker" aria-label="Race choices">
            <div className="owner-race-picker__header">
              <div>
                <span className="owner-kicker">Race programme</span>
                <h3>{selectedTournament?.name || "No tournament selected"}</h3>
                {selectedTournament?.description && <p>{selectedTournament.description}</p>}
              </div>
              <span className={`owner-badge ${statusClass(selectedTournament?.status)}`}>{selectedTournament?.status || "Unavailable"}</span>
            </div>

            <div className="owner-tournament-context">
              {selectedTournament?.location && <div><span>Tournament location</span><strong>{selectedTournament.location}</strong></div>}
              {selectedTournament?.date && <div><span>Tournament dates</span><strong>{selectedTournament.date}</strong></div>}
              <div><span>Total race prizes</span><strong>{tournamentPrizePool > 0 ? formatMoney(tournamentPrizePool, tournamentPrizeCurrency) : "Not configured"}</strong></div>
              <div><span>Selected race fee</span><strong>{registrationFeeVnd > 0 ? formatMoney(registrationFeeVnd, registrationFeeCurrency) : "No fee calculated"}</strong></div>
              <div><span>Race options</span><strong>{racesLoading ? "Loading" : races.length}</strong></div>
            </div>

            {racesLoading && <LoadingSkeleton ariaLabel="Loading tournament races" variant="inline" />}
            {!racesLoading && races.length === 0 && <div className="owner-empty owner-empty--compact">This tournament does not have a race programme yet.</div>}
            {!racesLoading && races.length > 0 && (
              <div className="owner-race-choice-list" role="listbox" aria-label={`${selectedTournament.name} races`}>
                <div className="owner-entry-race-head" aria-hidden="true">
                  <span>Race and schedule</span>
                  <span>Conditions, entry and prize</span>
                  <span>Status</span>
                </div>
                {races.map((race) => {
                  const raceState = getRaceEntryState(race);
                  const selected = selectedRace?.id === race.id;
                  return (
                    <article className={`owner-race-choice${selected ? " is-selected" : ""}${!raceState.available ? " is-unavailable" : ""}`} key={race.id}>
                      <button
                        aria-disabled={!raceState.available}
                        aria-selected={selected}
                        className="owner-race-choice__select"
                        onClick={() => raceState.available && updateEntry("raceId", race.id)}
                        role="option"
                        type="button"
                      >
                        <div className="owner-race-choice__main">
                          <span className="owner-registration__id">{compactRecordCode("RACE", race.id)}</span>
                          <strong>{race.name}</strong>
                          <small>{[race.round, race.date, race.clock, race.location].filter(Boolean).join(" / ") || "Schedule unavailable"}</small>
                        </div>
                        <div className="owner-race-choice__facts">
                          <span><Flag size={13} /> {[race.raceClass, race.surface].filter(Boolean).join(" / ") || "Class pending"}</span>
                          <span><MapPin size={13} /> {[race.course, race.going, race.distance].filter(Boolean).join(" / ") || "Conditions pending"}</span>
                          <span><UsersRound size={13} /> {race.remainingSlots === null ? "No participant limit" : `${race.remainingSlots} places left`}</span>
                          <span><CreditCard size={13} /> {race.entryFeeVnd > 0 ? formatMoney(race.entryFeeVnd, race.entryFeeCurrency) : "No entry fee"}</span>
                          <span><Trophy size={13} /> {race.prizePool > 0 ? formatMoney(race.prizePool, race.prizeCurrency) : "Prize pending"}</span>
                          <span><CalendarDays size={13} /> {race.registrationLock ? `Closes ${race.registrationLock}` : "Deadline pending"}</span>
                        </div>
                        <span className={`owner-badge ${raceState.available ? "owner-badge--green" : "owner-badge--muted"}`}>{raceState.label}</span>
                      </button>
                      <div className="owner-race-choice__footer">
                        <span>{raceState.reason}</span>
                        <button aria-label={`View details for ${race.name}`} onClick={() => setDetailsRace(race)} title="View race details" type="button">
                          <Eye size={15} aria-hidden="true" /> Details
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </section>}

          </div>

          <aside className="owner-entry-review" aria-labelledby="review-entry-heading">
            <div className="owner-entry-review__header">
              <div>
                <span className="owner-kicker">Step 3</span>
                <h2 id="review-entry-heading">Review and payment</h2>
              </div>
              <CreditCard size={20} />
            </div>

            <ol className="owner-entry-progress">
              <li className={selectedHorse ? "is-complete" : ""}><span>{selectedHorse ? <Check size={13} /> : "1"}</span> Horse selected</li>
              <li className={selectedRace ? "is-complete" : ""}><span>{selectedRace ? <Check size={13} /> : "2"}</span> Race selected</li>
              <li className={termsAccepted ? "is-complete" : ""}><span>{termsAccepted ? <Check size={13} /> : "3"}</span> Terms accepted</li>
            </ol>

            <div className="owner-entry-review__summary">
              <div><span>Horse</span><strong>{selectedHorse?.name || "Not selected"}</strong><small>{selectedHorse?.registrationNumber || "Choose an eligible horse"}</small></div>
              <div><span>Race</span><strong>{selectedRace?.name || "Not selected"}</strong><small>{selectedTournament?.name || "Choose a tournament and race"}</small></div>
              <div><span>Schedule</span><strong>{selectedRace ? `${selectedRace.date} / ${selectedRace.clock}` : "Not selected"}</strong><small>{selectedRace?.location || "Venue pending"}</small></div>
            </div>

            <div className="owner-entry-review__total">
              <span>Entry fee</span>
              <strong>{selectedRace ? formatMoney(registrationFeeVnd, registrationFeeCurrency) : "--"}</strong>
              <small>{registrationFeeVnd > 0 ? "Payment through VNPay" : "No payment required"}</small>
            </div>

            <label className="owner-entry-note">
              <span>Owner note <small>Optional</small></span>
              <textarea value={entry.note} onChange={(event) => updateEntry("note", event.target.value)} placeholder="Add race preparation or scheduling notes..." />
            </label>

            <div className="owner-entry-notice">
              <Info size={17} />
              <p>The entry fee is non-refundable if the horse fails or misses the pre-race inspection. An eligible primary jockey is still required before race start.</p>
            </div>

            <label className="owner-registration-terms">
              <input checked={termsAccepted} onChange={(event) => { setTermsAccepted(event.target.checked); setError(""); }} type="checkbox" />
              <span>I have reviewed the horse, race, payment and pre-race inspection conditions.</span>
            </label>

            {saved && <span className="owner-success"><CheckCircle2 size={16} /> Entry confirmed. Confirmation email queued.</span>}
            {error && <span className="owner-success owner-success--error">{error}</span>}
            <button
              aria-busy={isSubmitting}
              className="owner-button owner-button--primary owner-entry-submit"
              disabled={isSubmitting || racesLoading || !canSubmit}
              type="submit"
            >
              {isSubmitting ? "Preparing payment..." : registrationFeeVnd > 0 ? "Continue to VNPay" : "Confirm entry"}
            </button>
            {!canSubmit && !error && <small className="owner-entry-review__hint">{submissionBlockReason}</small>}
          </aside>
        </form>

      </section>
      )}

      {activeTab === "entries" && <article className="owner-registration-board" role="tabpanel">
        <div className="owner-card__header">
          <div>
            <span className="owner-kicker">My entries</span>
            <h2>Race registration history</h2>
          </div>
          <ClipboardCheck size={20} />
        </div>
        <div className="owner-entry-horse-toolbar owner-registration-search-toolbar">
          <label className="owner-entry-search">
            <Search size={17} aria-hidden="true" />
            <input
              aria-label="Search registration entries"
              onChange={(event) => setEntriesQuery(event.target.value)}
              placeholder="Search horse, tournament, race or status"
              type="search"
              value={entriesQuery}
            />
            {entriesQuery && (
              <button aria-label="Clear entries search" onClick={() => setEntriesQuery("")} type="button">
                <X size={15} />
              </button>
            )}
          </label>
          <span className="owner-entry-results"><strong>{filteredRegistrations.length}</strong> of {registrations.length} entries</span>
        </div>
        <div className="owner-registration-list owner-registration-list--board">
          {filteredRegistrations.map((item) => (
            <div className="owner-registration owner-registration--rich" key={item.id}>
              <time className="owner-registration__date">{item.submitted}</time>
              <div className="owner-registration__content">
                <div className="owner-registration__headline">
                  <span className="owner-registration__id">{compactRecordCode("REG", item.id)}</span>
                  <div className="owner-registration__body">
                    <strong>{item.horse}</strong>
                    <small>{item.tournament}</small>
                  </div>
                </div>
                <small className="owner-registration__note">{item.race ? `${item.race} / ${item.note}` : item.note}</small>
                <div className="owner-registration__payment">
                  <CreditCard size={14} />
                  <span>{item.entryFeeVnd > 0 ? `${item.paymentStatus} / ${formatMoney(item.entryFeeVnd, "VND")}` : "No fee required"}</span>
                </div>
              </div>
              <div className="owner-registration__actions">
                <span className={`owner-badge ${statusClass(item.status)}`}>{item.status}</span>
                {cancellationTicketFor(item.id) && (
                  <span className="owner-registration__request-status">
                    Request: {String(cancellationTicketFor(item.id).status || "").replaceAll("_", " ")}
                    <small>Refund: {String(cancellationTicketFor(item.id).refund_status || "").replaceAll("_", " ")}</small>
                  </span>
                )}
                {canRequestRegistrationCancellation(item) && !cancellationTicketFor(item.id) && (
                  <button
                    className="owner-button"
                    onClick={() => openCancellationRequest(item)}
                    type="button"
                  >
                    Request cancellation
                  </button>
                )}
                {cancellationTicketFor(item.id)?.refund_status === "awaiting_owner_confirmation" && (
                  <button
                    className="owner-button owner-button--primary"
                    disabled={confirmingRefundId === cancellationTicketFor(item.id)._id}
                    onClick={() => confirmRefundReceipt(cancellationTicketFor(item.id))}
                    type="button"
                  >
                    {confirmingRefundId === cancellationTicketFor(item.id)._id ? "Confirming..." : "Confirm refund received"}
                  </button>
                )}
              </div>
            </div>
          ))}
          {registrations.length === 0 && (
            <div className="owner-empty owner-empty--compact" role="status">
              No race registrations have been submitted yet.
            </div>
          )}
          {!!registrations.length && !filteredRegistrations.length && (
            <div className="owner-entry-empty-search" role="status">
              <Search size={18} />
              <strong>No entries found</strong>
              <span>Try a horse, tournament, race or status.</span>
            </div>
          )}
        </div>
      </article>}

      {cancellationRegistration && (
        <div className="owner-entry-dialog-backdrop" onMouseDown={(event) => event.target === event.currentTarget && !cancellationSubmitting && setCancellationRegistration(null)}>
          <form aria-labelledby="cancellation-request-title" aria-modal="true" className="owner-entry-dialog owner-cancellation-dialog" onSubmit={submitCancellationRequest} role="dialog">
            <div className="owner-entry-dialog__header">
              <div>
                <span className="owner-kicker">Cancellation request</span>
                <h2 id="cancellation-request-title">{cancellationRegistration.race}</h2>
              </div>
              <button aria-label="Close cancellation request" disabled={cancellationSubmitting} onClick={() => setCancellationRegistration(null)} title="Close" type="button"><X size={19} /></button>
            </div>
            <div className="owner-entry-dialog__facts">
              <div><span>Horse</span><strong>{cancellationRegistration.horse}</strong></div>
              <div><span>Refund requested</span><strong>{formatMoney(cancellationRegistration.entryFeeVnd, "VND")}</strong></div>
            </div>
            <label className="owner-entry-note">
              <span>Reason *</span>
              <textarea
                autoFocus
                maxLength="1000"
                onChange={(event) => { setCancellationReason(event.target.value); setError(""); }}
                placeholder="Explain why this race entry needs to be cancelled..."
                required
                value={cancellationReason}
              />
              <small>{cancellationReason.length}/1000 characters</small>
            </label>
            <div className="owner-entry-notice">
              <Info size={17} />
              <p>The request must be approved before the tournament starts. A paid entry is refunded only after approval, and you will confirm when the funds arrive.</p>
            </div>
            {error && <span className="owner-success owner-success--error">{error}</span>}
            <div className="owner-cancellation-dialog__actions">
              <button className="owner-button owner-button--primary" disabled={cancellationSubmitting || !cancellationReason.trim()} type="submit">{cancellationSubmitting ? "Submitting..." : "Submit request"}</button>
              <button className="owner-button" disabled={cancellationSubmitting} onClick={() => setCancellationRegistration(null)} type="button">Keep entry</button>
            </div>
          </form>
        </div>
      )}

      {detailsRace && (
        <div className="owner-entry-dialog-backdrop" onMouseDown={(event) => event.target === event.currentTarget && setDetailsRace(null)}>
          <section aria-labelledby="race-detail-dialog-title" aria-modal="true" className="owner-entry-dialog" role="dialog">
            <div className="owner-entry-dialog__header">
              <div>
                <span className="owner-kicker">{selectedTournament?.name || "Race programme"}</span>
                <h2 id="race-detail-dialog-title">{detailsRace.name}</h2>
              </div>
              <button aria-label="Close race details" onClick={() => setDetailsRace(null)} title="Close" type="button"><X size={19} /></button>
            </div>
            <div className="owner-entry-dialog__facts">
              <div><span>Date and time</span><strong>{detailsRace.date || "Pending"} / {detailsRace.clock || "Pending"}</strong></div>
              <div><span>Venue</span><strong>{detailsRace.location || "Pending"}</strong></div>
              <div><span>Round</span><strong>{detailsRace.round || "Pending"}</strong></div>
              <div><span>Distance</span><strong>{detailsRace.distance || "Pending"}</strong></div>
              <div><span>Class</span><strong>{detailsRace.raceClass || "Pending"}</strong></div>
              <div><span>Surface and going</span><strong>{[detailsRace.surface, detailsRace.going].filter(Boolean).join(" / ") || "Pending"}</strong></div>
              <div><span>Places</span><strong>{detailsRace.remainingSlots === null ? "No limit" : `${detailsRace.remainingSlots} remaining`}</strong></div>
              <div><span>Entry fee</span><strong>{detailsRace.entryFeeVnd > 0 ? formatMoney(detailsRace.entryFeeVnd, detailsRace.entryFeeCurrency) : "No fee"}</strong></div>
              <div><span>Prize</span><strong>{detailsRace.prizePool > 0 ? formatMoney(detailsRace.prizePool, detailsRace.prizeCurrency) : "Pending"}</strong></div>
              <div><span>Entry deadline</span><strong>{detailsRace.registrationLock || "Pending"}</strong></div>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

function OwnerRaceDetail() {
  const { tournamentId, raceId } = useParams();
  const { tournaments, isLoading: tournamentsLoading, error: tournamentsError } = useOwnerTournaments();
  const [race, setRace] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const tournament = tournaments.find((item) => String(item.id) === String(tournamentId));

  useEffect(() => {
    let cancelled = false;

    async function loadRace() {
      setIsLoading(true);
      setError("");

      try {
        const data = await ownerApi.getTournamentRaces(tournamentId);
        const nextRace = (data.races || [])
          .map(toOwnerRaceOption)
          .find((item) => String(item.id) === String(raceId));

        if (!cancelled) {
          setRace(nextRace || null);
          if (!nextRace) setError("Race information is unavailable.");
        }
      } catch (apiError) {
        if (!cancelled) setError(apiError.message || "Unable to load race information.");
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    loadRace();
    return () => {
      cancelled = true;
    };
  }, [raceId, tournamentId]);

  if (isLoading || tournamentsLoading) {
    return <div className="owner-race-detail-page"><LoadingSkeleton ariaLabel="Loading race details" variant="detail" /></div>;
  }

  if (error || tournamentsError || !race) {
    return (
      <div className="owner-race-detail-page">
        <Link className="owner-detail-back" to="/owner/registrations">Back to registration</Link>
        <div className="owner-empty owner-empty--error">{error || tournamentsError || "Race information is unavailable."}</div>
      </div>
    );
  }

  return (
    <div className="owner-race-detail-page">
      <Link className="owner-detail-back" to="/owner/registrations">Back to registration</Link>
      <header className="owner-race-detail-hero">
        <div>
          <p className="owner-eyebrow">{tournament?.name || "Tournament race"}</p>
          <h1>{race.name}</h1>
          <p>{[race.round, race.date, race.clock].filter(Boolean).join(" · ") || "Schedule pending"}</p>
        </div>
        <span className={`owner-badge ${statusClass(race.status)}`}>{race.status}</span>
      </header>

      <section className="owner-race-detail-facts" aria-label="Race information">
        <article><MapPin size={18} /><span>Venue</span><strong>{race.location || tournament?.location || "Pending"}</strong></article>
        <article><Flag size={18} /><span>Distance</span><strong>{race.distance || "Pending"}</strong></article>
        <article><UsersRound size={18} /><span>Capacity</span><strong>{race.remainingSlots === null ? race.maxParticipants || "Open" : `${race.remainingSlots} spots left`}</strong></article>
        <article><Trophy size={18} /><span>Race prize</span><strong>{race.prizePool > 0 ? formatMoney(race.prizePool, race.prizeCurrency) : "Pending"}</strong></article>
        <article><CreditCard size={18} /><span>Entry fee</span><strong>{race.entryFeeVnd > 0 ? formatMoney(race.entryFeeVnd, race.entryFeeCurrency) : "No fee"}</strong></article>
        <article><CalendarDays size={18} /><span>Registration lock</span><strong>{race.registrationLock || "Not configured"}</strong></article>
      </section>

      <section className="owner-race-detail-entry">
        <div>
          <span className="owner-kicker">Registration status</span>
          <h2>{race.registrationAvailable ? "This race is accepting entries" : "Registration is closed"}</h2>
          <p>{race.registrationAvailable
            ? "Return to the registration workspace to select a horse and confirm payment."
            : race.registrationUnavailableReason || "You can still review this race, but a new horse entry cannot be submitted."}</p>
        </div>
        {race.registrationAvailable && <Link className="owner-button owner-button--primary" to="/owner/registrations">Register a horse</Link>}
      </section>
    </div>
  );
}

function OwnerJockeys() {
  const { jockeys: liveJockeys, isLoading, error, reload: reloadJockeys } = useOwnerJockeys();
  const { horses: liveHorses, isLoading: horsesLoading, error: horsesError } = useOwnerHorses();
  const {
    registrations: liveRegistrations,
    isLoading: registrationsLoading,
    error: registrationsError,
  } = useOwnerRegistrations();
  const [localStatuses, setLocalStatuses] = useState({});
  const [selectedJockeyId, setSelectedJockeyId] = useState("");
  const [selectedJockeyDetail, setSelectedJockeyDetail] = useState(null);
  const [activeInviteStep, setActiveInviteStep] = useState(1);
  const [jockeySearch, setJockeySearch] = useState("");
  const [negotiationFilter, setNegotiationFilter] = useState("All");
  const [jockeyPreview, setJockeyPreview] = useState(null);
  const [jockeyPreviewPosition, setJockeyPreviewPosition] = useState(null);
  const [detailLoadingId, setDetailLoadingId] = useState("");
  const [jockeyAvailability, setJockeyAvailability] = useState({});
  const jockeyRaceContextRef = useRef("");
  const [assignmentSaved, setAssignmentSaved] = useState(false);
  const [assignmentError, setAssignmentError] = useState("");
  const [appointmentMinimum, setAppointmentMinimum] = useState(
    () => toLocalDateTimeInputValue(new Date(Date.now() + 60 * 1000))
  );
  const [pendingInvitation, setPendingInvitation] = useState(null);
  const [invitationToast, setInvitationToast] = useState(null);
  const [existingAssignments, setExistingAssignments] = useState([]);
  const [assignmentsLoading, setAssignmentsLoading] = useState(true);
  const [isAssigning, setIsAssigning] = useState(false);
  const [workflowDrafts, setWorkflowDrafts] = useState({});
  const [workflowActionId, setWorkflowActionId] = useState("");
  const [cancelAssignmentId, setCancelAssignmentId] = useState("");
  const [workflowMessage, setWorkflowMessage] = useState("");
  const [isWorkflowOpen, setIsWorkflowOpen] = useState(true);
  const [selectedWorkflowId, setSelectedWorkflowId] = useState("");
  const [assignment, setAssignment] = useState({
    assignmentType: "primary",
    registrationId: "",
    message: "",
    meetingTitle: "",
    meetingTime: "",
    locationName: "",
    address: "",
    city: "",
    district: "",
    ward: "",
    mapUrl: "",
    contactName: "",
    contactPhone: "",
  });
  const jockeys = liveJockeys
    .map((jockey, index) => ({
      ...jockey,
      ...(jockeyAvailability[jockey.id] || {}),
      status: localStatuses[jockey.id] || jockey.status,
      demoOrder: index,
    }))
    .sort((left, right) => {
      const priority = (name) => {
        const normalized = String(name || "").toLowerCase();
        if (normalized.includes("alpha")) return 0;
        if (normalized.includes("belta") || normalized.includes("beta") || normalized.includes("bravo")) return 1;
        return 2;
      };
      return priority(left.name) - priority(right.name) || left.demoOrder - right.demoOrder;
    });
  const horses = liveHorses;
  const updateStatus = (id, status) => setLocalStatuses((current) => ({ ...current, [id]: status }));
  const selectedJockey = jockeys.find((jockey) => jockey.id === selectedJockeyId);
  const visibleJockeys = jockeys.filter((jockey) => {
    const searchValue = jockeySearch.trim().toLowerCase();
    if (!searchValue) return true;
    return [jockey.name, jockey.licenseNumber, jockey.status]
      .some((value) => String(value || "").toLowerCase().includes(searchValue));
  });
  const availableJockeyCount = jockeys.filter((jockey) => !isJockeyUnavailableForRace(jockey)).length;

  const getAssignmentsForRegistration = (registration) => existingAssignments.filter((item) => {
    const horseId = item.horse_id?._id || item.horse_id?.id || item.horse_id;
    const raceId = item.race_id?._id || item.race_id?.id || item.race_id;
    return String(horseId) === String(registration?.horseId) && String(raceId) === String(registration?.raceId);
  });
  const isActiveAssignment = (item) => activeAssignmentStatuses.includes(item.status);
  const findPrimaryAssignmentForRegistration = (registration) => getAssignmentsForRegistration(registration)
    .find((item) => (item.assignment_type || "primary") === "primary" && isActiveAssignment(item));
  const findAcceptedPrimaryAssignmentForRegistration = (registration) => getAssignmentsForRegistration(registration)
    .find((item) => (item.assignment_type || "primary") === "primary" && item.status === "accepted");
  const getBackupAssignmentsForRegistration = (registration) => getAssignmentsForRegistration(registration)
    .filter((item) => item.assignment_type === "backup" && isActiveAssignment(item));

  const approvedRaceEntries = liveRegistrations.filter((item) => item.status === "Approved" && item.horseId && item.raceId);
  const isBackupInvitation = assignment.assignmentType === "backup";
  const assignableRaceEntries = approvedRaceEntries.filter((item) => isBackupInvitation
    ? Boolean(findAcceptedPrimaryAssignmentForRegistration(item)) && getBackupAssignmentsForRegistration(item).length === 0
    : !findPrimaryAssignmentForRegistration(item));
  const selectedEntry = assignableRaceEntries.find((item) => item.id === assignment.registrationId) ?? null;
  const selectedHorse = selectedEntry
    ? horses.find((horse) => String(horse.id) === String(selectedEntry.horseId)) ?? { id: selectedEntry.horseId, name: selectedEntry.horse }
    : null;
  const selectedRace = selectedEntry
    ? {
      id: selectedEntry.raceId,
      name: selectedEntry.race,
      tournament: selectedEntry.tournament,
      raceDate: selectedEntry.raceDate,
    }
    : null;
  const existingAssignment = selectedEntry ? findPrimaryAssignmentForRegistration(selectedEntry) : null;
  const acceptedPrimaryAssignment = selectedEntry ? findAcceptedPrimaryAssignmentForRegistration(selectedEntry) : null;
  const backupAssignments = selectedEntry ? getBackupAssignmentsForRegistration(selectedEntry) : [];
  const raceStartDate = getValidDate(selectedEntry?.raceDate);
  const appointmentDate = getValidDate(assignment.meetingTime);
  const appointmentMaximum = raceStartDate
    ? toLocalDateTimeInputValue(new Date(raceStartDate.getTime() - 60 * 1000))
    : undefined;
  const appointmentIsFuture = Boolean(appointmentDate && appointmentDate > new Date());
  const appointmentIsBeforeRace = Boolean(appointmentDate && raceStartDate && appointmentDate < raceStartDate);
  const selectedJockeyUnavailable = isJockeyUnavailableForRace(selectedJockey);
  const appointmentReadiness = !selectedEntry
    ? { ready: false, message: "Choose a race entry before scheduling the appointment." }
    : !raceStartDate
      ? { ready: false, message: "The race start time must be confirmed before an appointment can be arranged." }
      : !assignment.meetingTime
        ? { ready: false, message: `Choose a future time before ${formatInvitationDate(raceStartDate)}.` }
        : !appointmentDate
          ? { ready: false, message: "Choose a valid appointment date and time." }
          : !appointmentIsFuture
            ? { ready: false, message: "Choose a later time. The appointment must be in the future." }
            : !appointmentIsBeforeRace
              ? { ready: false, message: `The appointment must finish before the race starts on ${formatInvitationDate(raceStartDate)}.` }
              : { ready: true, message: `Appointment is scheduled before the race starts on ${formatInvitationDate(raceStartDate)}.` };
  const selectedJockeyDuplicate = selectedEntry && selectedJockey
    ? getAssignmentsForRegistration(selectedEntry).find((item) => {
      const jockeyId = item.jockey_id?._id || item.jockey_id?.id || item.jockey_id;
      return String(jockeyId) === String(selectedJockey.id) && isActiveAssignment(item);
    })
    : null;
  const assignedCount = existingAssignments.filter((item) => ["accepted", "standby_confirmed"].includes(item.status)).length;
  const pendingCount = existingAssignments.filter((item) => [
    "meeting_invited",
    "meeting_accepted",
    "terms_pending_confirmation",
    "standby_terms_pending_confirmation",
    "terms_agreed",
    "terms_rejected",
    "contract_uploaded",
  ].includes(item.status)).length;
  const blockedByNoEntry = !assignmentsLoading && !selectedEntry;
  const invitationLocked = blockedByNoEntry
    || (!isBackupInvitation && Boolean(existingAssignment))
    || (isBackupInvitation && (!acceptedPrimaryAssignment || backupAssignments.length > 0))
    || Boolean(selectedJockeyDuplicate)
    || selectedJockeyUnavailable;
  const selectedWorkflowAssignment = existingAssignments.find((item) => String(item._id) === String(selectedWorkflowId)) || null;
  const invitationRequirements = [
    { complete: Boolean(selectedEntry), label: "Choose a race entry" },
    { complete: Boolean(selectedJockey), label: "Choose a jockey" },
    {
      complete: !selectedJockeyUnavailable,
      label: selectedJockeyUnavailable ? getJockeyAvailabilityReason(selectedJockey) : "Choose an available Jockey",
    },
    { complete: Boolean(assignment.meetingTitle.trim()), label: "Add an appointment title" },
    { complete: Boolean(raceStartDate), label: "Choose a race with a confirmed start time" },
    { complete: appointmentReadiness.ready, label: appointmentReadiness.message },
    { complete: Boolean(assignment.locationName.trim()), label: "Add a venue" },
    { complete: Boolean(assignment.address.trim()), label: "Add the full address" },
  ];
  const firstMissingRequirement = invitationRequirements.find((item) => !item.complete);
  const invitationReady = !firstMissingRequirement && !invitationLocked;
  const negotiationFilters = ["All", "Awaiting jockey", "Terms", "Contract", "Confirmed", "Closed"];
  const visibleAssignments = existingAssignments.filter((item) => {
    if (negotiationFilter === "All") return true;
    const stage = assignmentStageLabel(item.status);
    if (negotiationFilter === "Awaiting jockey") return item.status === "meeting_invited";
    if (negotiationFilter === "Terms") return ["meeting_accepted", "terms_pending_confirmation", "standby_terms_pending_confirmation", "terms_agreed", "terms_rejected"].includes(item.status);
    if (negotiationFilter === "Contract") return item.status === "contract_uploaded";
    if (negotiationFilter === "Confirmed") return ["accepted", "standby_confirmed"].includes(item.status);
    if (negotiationFilter === "Closed") return ["meeting_rejected", "contract_rejected", "replaced", "cancelled"].includes(item.status);
    return stage === negotiationFilter;
  });

  useEffect(() => {
    const raceId = String(selectedEntry?.raceId || "");
    if (jockeyRaceContextRef.current === raceId) return;

    jockeyRaceContextRef.current = raceId;
    setJockeyAvailability({});
    setSelectedJockeyId("");
    setSelectedJockeyDetail(null);
    reloadJockeys(raceId);
  }, [reloadJockeys, selectedEntry?.raceId]);

  useEffect(() => {
    let cancelled = false;
    let isRequestInFlight = false;
    let refreshTimer = null;

    async function loadAssignments({ initial = false } = {}) {
      if (!liveHorses.length) {
        if (initial) setAssignmentsLoading(false);
        return;
      }

      // A focus event can occur while the scheduled refresh is still pending.
      // Keep only one request active so an older response cannot overwrite newer data.
      if (isRequestInFlight) return;
      isRequestInFlight = true;
      if (initial) setAssignmentsLoading(true);

      try {
        const data = await ownerApi.getJockeyAssignments();
        if (!cancelled) setExistingAssignments((data.assignments || []).map(normalizeAssignmentRecord));
      } catch (apiError) {
        if (!cancelled && initial) {
          setAssignmentError(apiError.message || "Unable to load existing jockey assignments.");
        }
      } finally {
        isRequestInFlight = false;
        if (!cancelled && initial) setAssignmentsLoading(false);
      }
    }

    const refreshIfVisible = () => {
      if (document.visibilityState === "visible") loadAssignments();
    };

    const startBackgroundRefresh = () => {
      if (refreshTimer || document.visibilityState !== "visible") return;
      refreshTimer = window.setInterval(refreshIfVisible, ASSIGNMENT_REFRESH_INTERVAL_MS);
    };

    const stopBackgroundRefresh = () => {
      if (!refreshTimer) return;
      window.clearInterval(refreshTimer);
      refreshTimer = null;
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        loadAssignments();
        startBackgroundRefresh();
      } else {
        stopBackgroundRefresh();
      }
    };

    loadAssignments({ initial: true });
    startBackgroundRefresh();
    window.addEventListener("focus", refreshIfVisible);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      cancelled = true;
      stopBackgroundRefresh();
      window.removeEventListener("focus", refreshIfVisible);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [liveHorses.length]);

  const updateAssignment = (field, value) => {
    setAssignmentSaved(false);
    setAssignmentError("");
    setAssignment((current) => ({ ...current, [field]: value }));
  };

  const selectRaceEntry = (entryId) => {
    updateAssignment("registrationId", entryId);
    setActiveInviteStep(2);
  };

  const updateWorkflowDraft = (id, field, value) => {
    setAssignmentError("");
    setWorkflowMessage("");
    setWorkflowDrafts((current) => ({
      ...current,
      [id]: { ...current[id], [field]: value },
    }));
  };

  const replaceAssignment = (updated) => {
    if (!updated?._id) return;
    setExistingAssignments((current) => current.map((item) => String(item._id) === String(updated._id) ? {
      ...item,
      ...normalizeAssignmentRecord(updated),
      race_id: item.race_id,
      horse_id: item.horse_id,
      owner_id: item.owner_id,
      jockey_id: item.jockey_id,
    } : item));
  };

  const submitTerms = async (item) => {
    const id = item._id;
    const draft = workflowDrafts[id] || {};
    const agreedTerms = draft.agreedTerms ?? item.terms?.agreed_terms ?? "";
    const meetingNote = draft.meetingNote ?? item.terms?.meeting_note ?? "";

    if (!agreedTerms.trim()) {
      setAssignmentError("Enter the terms before sending them to the jockey.");
      return;
    }

    setWorkflowActionId(id);
    setAssignmentError("");
    setWorkflowMessage("");
    try {
      const data = await ownerApi.updateJockeyAssignmentTerms(id, {
        agreed_terms: agreedTerms.trim(),
        meeting_note: meetingNote.trim(),
        agreed_at: new Date().toISOString(),
      });
      replaceAssignment(data.assignment);
      setWorkflowMessage(item.assignment_type === "backup"
        ? "Standby terms sent. The backup assignment becomes active after jockey confirmation."
        : "Terms sent to the jockey for confirmation.");
    } catch (apiError) {
      setAssignmentError(apiError.message || "Unable to send terms to the jockey.");
    } finally {
      setWorkflowActionId("");
    }
  };

  const uploadContract = async (item) => {
    const id = item._id;
    const draft = workflowDrafts[id] || {};
    const file = draft.contractFile;
    const allowedTypes = ["application/pdf", "image/jpeg", "image/png", "image/webp"];

    if (!file || !allowedTypes.includes(file.type)) {
      setAssignmentError("Choose a PDF, JPG, PNG, or WEBP contract file.");
      return;
    }
    if (file.size > 7 * 1024 * 1024) {
      setAssignmentError("Contract file must be 7 MB or smaller.");
      return;
    }

    setWorkflowActionId(id);
    setAssignmentError("");
    setWorkflowMessage("");
    try {
      const data = await ownerApi.uploadJockeyAssignmentContract(id, {
        file_data: await readFileAsDataUri(file),
        file_type: file.type,
        file_name: file.name,
      });
      replaceAssignment(data.assignment);
      setWorkflowMessage("Contract sent to the jockey for confirmation.");
    } catch (apiError) {
      setAssignmentError(apiError.message || "Unable to upload the contract.");
    } finally {
      setWorkflowActionId("");
    }
  };

  const selectJockey = async (jockey) => {
    setAssignmentSaved(false);
    setAssignmentError("");

    if (isJockeyUnavailableForRace(jockey)) {
      setAssignmentError(getJockeyAvailabilityReason(jockey));
      return;
    }

    setSelectedJockeyId(jockey.id);
    setSelectedJockeyDetail(null);
    setActiveInviteStep(3);

    if (!liveJockeys.length) {
      setSelectedJockeyDetail(null);
      updateStatus(jockey.id, "Invited");
      return;
    }

    setDetailLoadingId(jockey.id);
    try {
      const data = await ownerApi.getJockey(jockey.id);
      const detail = toOwnerJockey(data.jockey || data, 0);
      const effectiveDetail = {
        ...detail,
        availableForRace: detail.availableForRace ?? jockey.availableForRace,
        availabilityReason: detail.availabilityReason || jockey.availabilityReason,
      };
      setJockeyAvailability((current) => ({
        ...current,
        [jockey.id]: {
          availableForRace: effectiveDetail.availableForRace,
          availabilityReason: effectiveDetail.availabilityReason,
        },
      }));

      if (isJockeyUnavailableForRace(effectiveDetail)) {
        setSelectedJockeyId("");
        setSelectedJockeyDetail(null);
        setActiveInviteStep(2);
        setAssignmentError(getJockeyAvailabilityReason(effectiveDetail));
        return;
      }

      setSelectedJockeyDetail(effectiveDetail);
    } catch (apiError) {
      setAssignmentError(apiError.message || "Unable to load jockey detail.");
      setSelectedJockeyDetail(null);
    } finally {
      setDetailLoadingId("");
    }
  };

  const sendInvitation = async ({ payload, summary }) => {
    setPendingInvitation(null);
    setIsAssigning(true);
    setAssignmentError("");

    try {
      const data = await ownerApi.createJockeyAssignment(payload);
      if (data.assignment) {
        setExistingAssignments((current) => [{
          ...data.assignment,
          assignment_type: data.assignment.assignment_type || summary.assignmentType,
          horse_id: summary.horse,
          race_id: summary.race,
          jockey_id: summary.jockey,
        }, ...current]);
      }
      updateStatus(summary.jockeyId, "Pending");
      setAssignmentSaved(true);
      setWorkflowMessage("Invitation sent. Contract steps unlock after the jockey accepts the offline appointment.");
      setInvitationToast({
        ...summary,
        invitationId: data.assignment?._id ? compactRecordCode("INV", data.assignment._id) : "Pending assignment ID",
      });
    } catch (apiError) {
      setAssignmentError(
        apiError.message
        || "This invitation cannot be sent because the race pairing has changed. Review your selections and try again."
      );
    } finally {
      setIsAssigning(false);
    }
  };

  const cancelJockeyInvitation = async (item) => {
    const id = item._id;
    setWorkflowActionId(id);
    setCancelAssignmentId("");
    setAssignmentError("");
    setWorkflowMessage("");

    try {
      const data = await ownerApi.cancelJockeyAssignment(id);
      replaceAssignment(data.assignment);
      setWorkflowMessage("Jockey invitation cancelled. The race entry is available for another invitation.");
    } catch (apiError) {
      setAssignmentError(apiError.message || "Unable to cancel this jockey invitation.");
    } finally {
      setWorkflowActionId("");
    }
  };

  const requestAssignmentCancellation = async (item) => {
    const id = item._id;
    const reason = (workflowDrafts[id]?.cancellationReason || "").trim();

    if (!reason) {
      setAssignmentError("Enter a reason for ending this jockey contract.");
      return;
    }

    setWorkflowActionId(id);
    setAssignmentError("");
    setWorkflowMessage("");

    try {
      const data = await ownerApi.requestJockeyAssignmentCancellation(id, reason);
      replaceAssignment(data.assignment);
      setWorkflowMessage("Cancellation request sent. The contract remains active until the jockey agrees.");
    } catch (apiError) {
      setAssignmentError(apiError.message || "Unable to request contract cancellation.");
    } finally {
      setWorkflowActionId("");
    }
  };

  const withdrawJockeyAssignment = async (item) => {
    const id = item._id;
    const reason = (workflowDrafts[id]?.withdrawalReason || "").trim();

    if (!reason) {
      setAssignmentError("Enter a reason for withdrawing from this negotiation.");
      return;
    }

    setWorkflowActionId(id);
    setAssignmentError("");
    setWorkflowMessage("");

    try {
      const data = await ownerApi.withdrawJockeyAssignment(id, reason);
      replaceAssignment(data.assignment);
      setWorkflowMessage("Assignment negotiation withdrawn. The other party can view the recorded reason.");
    } catch (apiError) {
      setAssignmentError(apiError.message || "Unable to withdraw this assignment.");
    } finally {
      setWorkflowActionId("");
    }
  };

  const respondToAssignmentCancellation = async (item, decision) => {
    const id = item._id;
    const responseMessage = (workflowDrafts[id]?.cancellationResponse || "").trim();
    setWorkflowActionId(id);
    setAssignmentError("");
    setWorkflowMessage("");

    try {
      const data = await ownerApi.respondToJockeyAssignmentCancellation(id, decision, responseMessage);
      replaceAssignment(data.assignment);
      setWorkflowMessage(decision === "approve"
        ? "Contract cancellation agreed. The primary assignment is now closed."
        : "Cancellation declined. The primary contract remains active.");
    } catch (apiError) {
      setAssignmentError(apiError.message || "Unable to respond to this cancellation request.");
    } finally {
      setWorkflowActionId("");
    }
  };

  const setJockeyPreviewAnchor = (event) => {
    if (!event) return;
    const cardWidth = 540;
    const cardHeight = 360;
    const offset = 16;
    const placeOnRight = event.clientX + offset + cardWidth <= window.innerWidth - 12;
    const placeBelow = event.clientY + offset + cardHeight <= window.innerHeight - 12;

    setJockeyPreviewPosition({
      top: placeBelow ? event.clientY + offset : Math.max(12, event.clientY - cardHeight - offset),
      left: placeOnRight ? event.clientX + offset : Math.max(12, event.clientX - cardWidth - offset),
    });
  };

  const openJockeyInfo = (jockey, event) => {
    setJockeyPreview(jockey);
    setJockeyPreviewAnchor(event);
  };

  const submitAssignment = async (event) => {
    event.preventDefault();
    setAssignmentSaved(false);
    setAssignmentError("");

    if (!liveHorses.length || !liveJockeys.length || !liveRegistrations.length) {
      setAssignmentError("Live horse, approved race registration, and jockey data are required before creating an invitation.");
      return;
    }

    if (!selectedEntry) {
      setAssignmentError(isBackupInvitation
        ? "No approved race entry with an accepted primary Jockey is ready for a backup invitation."
        : "No approved race registration without a primary jockey assignment is available.");
      return;
    }

    if (!selectedHorse?.id || !selectedRace?.id || !selectedJockey?.id) {
      setAssignmentError("Select an approved race entry and jockey before submitting.");
      return;
    }

    if (!assignment.meetingTitle.trim()) {
      setAssignmentError("Appointment title is required.");
      return;
    }

    if (!assignment.meetingTime) {
      setAssignmentError("Appointment time is required.");
      return;
    }

    if (!appointmentDate || !appointmentIsFuture) {
      setAssignmentError("Appointment time must be in the future.");
      return;
    }

    if (!raceStartDate) {
      setAssignmentError("The selected race needs a confirmed start time before an appointment can be arranged.");
      return;
    }

    if (!appointmentIsBeforeRace) {
      setAssignmentError(`Choose an appointment before the race starts on ${formatInvitationDate(raceStartDate)}.`);
      return;
    }

    if (selectedJockeyUnavailable) {
      setAssignmentError(getJockeyAvailabilityReason(selectedJockey));
      return;
    }

    if (!assignment.locationName.trim()) {
      setAssignmentError("Appointment location name is required.");
      return;
    }

    if (!assignment.address.trim()) {
      setAssignmentError("Appointment address is required.");
      return;
    }

    if (assignment.mapUrl.trim() && !/^https?:\/\//i.test(assignment.mapUrl.trim())) {
      setAssignmentError("Map URL must start with http:// or https://.");
      return;
    }

    if (!isBackupInvitation && existingAssignment) {
      setAssignmentError(`This approved race entry already has a ${existingAssignment.status || "current"} jockey assignment.`);
      return;
    }

    if (isBackupInvitation && !acceptedPrimaryAssignment) {
      setAssignmentError("The primary Jockey must accept the assignment before a backup Jockey can be invited.");
      return;
    }

    if (isBackupInvitation && backupAssignments.length > 0) {
      setAssignmentError("This horse already has its optional backup jockey for the selected race.");
      return;
    }

    if (selectedJockeyDuplicate) {
      setAssignmentError(`${selectedJockey.name} already has an active assignment for this horse and race.`);
      return;
    }

    const payload = {
        horse_id: selectedHorse.id,
        race_id: selectedRace.id,
        jockey_id: selectedJockey.id,
        assignment_type: assignment.assignmentType,
        backup_priority: isBackupInvitation ? 1 : undefined,
        invitation_message: assignment.message || (isBackupInvitation
          ? `Please stand by as backup jockey for ${selectedHorse.name} in ${selectedRace.name}.`
          : `Please ride ${selectedHorse.name} in ${selectedRace.name}.`),
        meeting: {
          title: assignment.meetingTitle,
          meeting_time: new Date(assignment.meetingTime).toISOString(),
          location_name: assignment.locationName,
          address: assignment.address,
          city: assignment.city,
          district: assignment.district,
          ward: assignment.ward,
          map_url: assignment.mapUrl,
          contact_name: assignment.contactName,
          contact_phone: assignment.contactPhone,
          note: assignment.message,
        },
      };

    setPendingInvitation({
      payload,
      summary: {
        assignmentType: assignment.assignmentType,
        horse: selectedHorse,
        race: selectedRace,
        jockey: selectedJockey.raw || selectedJockey,
        jockeyId: selectedJockey.id,
        jockeyName: selectedJockeyDetail?.name || selectedJockey.name,
        meetingTitle: assignment.meetingTitle.trim(),
        meetingTime: assignment.meetingTime,
        locationName: assignment.locationName.trim(),
        address: [assignment.address, assignment.ward, assignment.district, assignment.city].filter(Boolean).join(", "),
        message: payload.invitation_message,
      },
    });
  };

  const promoteBackupAssignment = async (item) => {
    const id = item._id;
    const jockeyName = assignmentPartyName(item.jockey_id, "Jockey");
    const horseName = assignmentPartyName(item.horse_id, "Horse");

    setWorkflowActionId(id);
    setAssignmentError("");
    setWorkflowMessage("");
    try {
      const data = await ownerApi.promoteJockeyAssignment(id, `Promote ${jockeyName} from backup to primary for ${horseName}.`);
      replaceAssignment(data.assignment);
      setWorkflowMessage("Backup jockey promoted. Send the new primary terms for jockey confirmation before uploading a contract.");
    } catch (apiError) {
      setAssignmentError(apiError.message || "Unable to promote this backup jockey.");
    } finally {
      setWorkflowActionId("");
    }
  };

  // Selecting a race entry refreshes jockey availability for that race. Keep the
  // workspace mounted while that refresh is in flight so the form does not jump
  // back to its loading state (and lose the user's scroll position).
  if ((isLoading && !liveJockeys.length) || horsesLoading || registrationsLoading || assignmentsLoading) {
    return <div className="owner-jockey-page"><LoadingSkeleton ariaLabel="Loading jockey assignment workspace" rows={6} variant="cards" /></div>;
  }

  return (
    <div className="owner-jockey-page">
      {pendingInvitation && (
        <section className="owner-invitation-toast owner-invitation-toast--confirm owner-invitation-modal" role="dialog" aria-modal="true" aria-labelledby="owner-invitation-confirm-title">
          <div className="owner-invitation-toast__header">
            <div className="owner-invitation-toast__icon"><Send size={18} /></div>
            <div>
              <span className="owner-kicker">Review before sending</span>
              <h2 id="owner-invitation-confirm-title">Send jockey invitation?</h2>
            </div>
            <button className="owner-invitation-toast__close" type="button" onClick={() => setPendingInvitation(null)} aria-label="Cancel invitation confirmation">
              <X size={18} />
            </button>
          </div>
          <div className="owner-invitation-toast__summary">
            <div><span>Jockey</span><strong>{pendingInvitation.summary.jockeyName}</strong></div>
            <div><span>Horse / race</span><strong>{pendingInvitation.summary.horse.name} / {pendingInvitation.summary.race.name}</strong></div>
            <div><span>Appointment</span><strong>{pendingInvitation.summary.meetingTitle}</strong><small>{formatInvitationDate(pendingInvitation.summary.meetingTime)}</small></div>
            <div><span>Location</span><strong>{pendingInvitation.summary.locationName}</strong><small>{pendingInvitation.summary.address}</small></div>
          </div>
          <p className="owner-invitation-toast__note">The Jockey will receive this appointment invitation and can accept or reject it.</p>
          <div className="owner-invitation-toast__actions">
            <button className="owner-button" type="button" onClick={() => setPendingInvitation(null)}>Go back</button>
            <button className="owner-button owner-button--primary" type="button" onClick={() => sendInvitation(pendingInvitation)}>
              <Send size={16} /> Send invitation
            </button>
          </div>
        </section>
      )}

      {invitationToast && (
        <section className="owner-invitation-toast owner-invitation-toast--success" role="status" aria-live="polite" aria-labelledby="owner-invitation-success-title">
          <div className="owner-invitation-toast__header">
            <div className="owner-invitation-toast__icon"><CheckCircle2 size={18} /></div>
            <div>
              <span className="owner-kicker">Invitation sent</span>
              <h2 id="owner-invitation-success-title">{invitationToast.jockeyName} has been invited.</h2>
            </div>
            <button className="owner-invitation-toast__close" type="button" onClick={() => setInvitationToast(null)} aria-label="Dismiss invitation confirmation">
              <X size={18} />
            </button>
          </div>
          <div className="owner-invitation-toast__summary">
            <div><span>Invitation</span><strong>{invitationToast.invitationId}</strong></div>
            <div><span>Assignment</span><strong>{invitationToast.assignmentType === "backup" ? "Backup jockey" : "Primary jockey"}</strong></div>
            <div><span>Horse / race</span><strong>{invitationToast.horse.name} / {invitationToast.race.name}</strong></div>
            <div><span>Appointment</span><strong>{formatInvitationDate(invitationToast.meetingTime)}</strong><small>{invitationToast.locationName} · {invitationToast.address}</small></div>
          </div>
          <p className="owner-invitation-toast__note">Status: awaiting jockey response. Contract steps unlock after the appointment is accepted.</p>
        </section>
      )}

      {(error || horsesError || registrationsError) && (
        <section className="admin-live-state admin-live-state--warning" aria-live="polite">
          {error || horsesError || registrationsError}
        </section>
      )}

      {!error && !horsesError && !registrationsError && (!jockeys.length || !horses.length || !liveRegistrations.length) && (
        <section className="admin-live-state" aria-live="polite">
          {!jockeys.length
            ? "No active jockey profiles are currently available."
            : !horses.length
              ? "Add an active horse profile before creating a jockey invitation."
              : "No confirmed race entries are available. Register a horse for a race before inviting a Jockey."}
        </section>
      )}

      <section className="owner-jockey-header">
        <div>
          <p className="owner-eyebrow">Jockey assignments</p>
          <h1>Coordinate every race pairing.</h1>
          <p>Choose a race entry, invite a suitable Jockey to an in-person appointment, then continue with terms and contract confirmation.</p>
        </div>
        <button
          className="owner-button owner-button--primary"
          onClick={() => document.getElementById("owner-jockey-invitation")?.scrollIntoView({ behavior: "smooth", block: "start" })}
          type="button"
        >
          <Send size={16} /> New invitation
        </button>
      </section>

      <section className="owner-jockey-stats" aria-label="Jockey assignment summary">
        {[
          { label: "Ready entries", value: assignableRaceEntries.length, note: isBackupInvitation ? "Ready for a backup" : "Ready for a primary", icon: ClipboardCheck },
          { label: "Awaiting response", value: pendingCount, note: "Appointments or terms", icon: CalendarDays },
          { label: "Confirmed pairings", value: assignedCount, note: "Primary and standby", icon: BadgeCheck },
        ].map((item) => {
          const Icon = item.icon;
          return (
            <article className="owner-jockey-stat" key={item.label}>
              <Icon size={18} />
              <span>{item.label}</span>
              <strong>{item.value}</strong>
              <small>{item.note}</small>
            </article>
          );
        })}
      </section>

      <section className={`owner-assignment-workflow ${isWorkflowOpen ? "is-open" : ""}`} aria-label="Active Jockey negotiations">
        <button
          aria-expanded={isWorkflowOpen}
          className="owner-assignment-workflow__trigger"
          onClick={() => setIsWorkflowOpen((current) => !current)}
          type="button"
        >
          <span className="owner-assignment-workflow__trigger-icon"><ClipboardCheck size={19} /></span>
          <span className="owner-assignment-workflow__trigger-copy">
            <strong>Active negotiations</strong>
            <small>{pendingCount} in progress / {existingAssignments.length} total</small>
          </span>
          <span className="owner-assignment-workflow__trigger-action">
            {isWorkflowOpen ? "Hide" : "Show"}
            <ChevronDown size={18} />
          </span>
        </button>

        {isWorkflowOpen && (
          <div className="owner-assignment-workflow__body">
            <div className="owner-negotiation-filters" aria-label="Filter negotiations">
              {negotiationFilters.map((filter) => (
                <button
                  className={negotiationFilter === filter ? "is-active" : ""}
                  key={filter}
                  onClick={() => {
                    setNegotiationFilter(filter);
                    setSelectedWorkflowId("");
                    setAssignmentError("");
                    setWorkflowMessage("");
                  }}
                  type="button"
                >
                  {filter}
                </button>
              ))}
            </div>

            {(workflowMessage || assignmentError) && (
              <div className={`owner-workflow-feedback ${assignmentError ? "is-error" : ""}`} aria-live="polite">
                {assignmentError || workflowMessage}
              </div>
            )}

            <div className="owner-assignment-workflow__layout">
              <div className="owner-assignment-workflow__list" aria-label="Jockey invitations">
                {visibleAssignments.map((item) => {
                  const id = item._id;
                  const isSelected = String(id) === String(selectedWorkflowId);
                  const horseName = assignmentPartyName(item.horse_id, "Horse");
                  const raceName = assignmentPartyName(item.race_id, "Race");
                  const jockeyName = assignmentPartyName(item.jockey_id, "Jockey");

                  return (
                    <button
                      aria-pressed={isSelected}
                      className={`owner-assignment-workflow__row ${isSelected ? "is-selected" : ""}`}
                      key={id}
                      onClick={() => {
                        setSelectedWorkflowId(id);
                        setAssignmentError("");
                        setWorkflowMessage("");
                      }}
                      type="button"
                    >
                      <span>
                        <strong>{horseName} / {jockeyName}</strong>
                        <small>{raceName} / {(item.assignment_type || "primary") === "backup" ? `Backup${item.backup_priority ? ` #${item.backup_priority}` : ""}` : "Primary"}</small>
                      </span>
                      <span className={`owner-badge owner-assignment-workflow__stage ${statusClass(assignmentStageLabel(item.status))}`}>{assignmentStageLabel(item.status)}</span>
                    </button>
                  );
                })}

                {!visibleAssignments.length && (
                  <div className="owner-assignment-empty" role="status">
                    <ClipboardCheck size={18} />
                  <div><strong>No negotiations in this view.</strong><span>Choose another filter or create a new in-person appointment invitation.</span></div>
                  </div>
                )}
              </div>

              {selectedWorkflowAssignment ? (() => {
                const item = selectedWorkflowAssignment;
                const id = item._id;
                const draft = workflowDrafts[id] || {};
                const status = item.status;
                const horseName = assignmentPartyName(item.horse_id, "Horse");
                const raceName = assignmentPartyName(item.race_id, "Race");
                const jockeyName = assignmentPartyName(item.jockey_id, "Jockey");
                const isBusy = workflowActionId === id;
                const isBackupAssignment = item.assignment_type === "backup";
                const cancellationRequest = item.cancellation_request;
                const cancellationPending = cancellationRequest?.status === "pending";
                const ownerRequestedCancellation = cancellationRequest?.initiated_by_party === "horse_owner";
                const raceLocked = isAssignmentRaceLocked(item);
                const itemRaceId = item.race_id?._id || item.race_id?.id || item.race_id;
                const itemHorseId = item.horse_id?._id || item.horse_id?.id || item.horse_id;
                const hasActivePrimary = isBackupAssignment && existingAssignments.some((candidate) => {
                  const candidateRaceId = candidate.race_id?._id || candidate.race_id?.id || candidate.race_id;
                  const candidateHorseId = candidate.horse_id?._id || candidate.horse_id?.id || candidate.horse_id;
                  return candidate.assignment_type !== "backup"
                    && activeAssignmentStatuses.includes(candidate.status)
                    && String(candidateRaceId) === String(itemRaceId)
                    && String(candidateHorseId) === String(itemHorseId);
                });

                return (
                  <article className="owner-assignment-workflow__detail">
                    <div className="owner-assignment-workflow__summary">
                      <div>
                        <span className="owner-kicker">{horseName} / {raceName} / {isBackupAssignment ? `Backup${item.backup_priority ? ` #${item.backup_priority}` : ""}` : "Primary"}</span>
                        <h3>{jockeyName}</h3>
                      </div>
                      <span className={`owner-badge ${statusClass(assignmentStatusLabel(status))}`}>{assignmentStatusLabel(status)}</span>
                    </div>

                    <div className="owner-assignment-steps" aria-label={`Assignment status: ${assignmentStatusLabel(status)}`}>
                      <span className={status !== "meeting_invited" ? "is-complete" : "is-current"}>Appointment invite</span>
                      <span className={[
                        "meeting_accepted",
                        "terms_pending_confirmation",
                        "standby_terms_pending_confirmation",
                        "terms_agreed",
                        "terms_rejected",
                        "contract_uploaded",
                        "accepted",
                        "standby_confirmed",
                      ].includes(status) ? "is-complete" : ""}>Appointment accepted</span>
                      <span className={isBackupAssignment
                        ? status === "standby_confirmed" ? "is-complete" : ["meeting_accepted", "standby_terms_pending_confirmation", "terms_rejected"].includes(status) ? "is-current" : ""
                        : ["terms_agreed", "contract_uploaded", "accepted"].includes(status) ? "is-complete" : ["meeting_accepted", "terms_pending_confirmation", "terms_rejected"].includes(status) ? "is-current" : ""}>
                        {isBackupAssignment ? "Standby terms" : "Terms confirmed"}
                      </span>
                      {isBackupAssignment ? (
                        <span className={status === "standby_confirmed" ? "is-complete" : ""}>Standby confirmed</span>
                      ) : (
                        <>
                          <span className={["contract_uploaded", "accepted"].includes(status) ? "is-complete" : status === "terms_agreed" ? "is-current" : ""}>Contract review</span>
                          <span className={status === "accepted" ? "is-complete" : status === "contract_uploaded" ? "is-current" : ""}>Accepted</span>
                        </>
                      )}
                    </div>

                    {raceLocked && activeAssignmentStatuses.includes(status) && (
                      <p className="owner-assignment-workflow__note">The race has started or closed, so this assignment can no longer be changed.</p>
                    )}

                    {!raceLocked && status === "meeting_invited" && (
                      <div className="owner-assignment-workflow__invite-actions">
                        <p className="owner-assignment-workflow__note">Waiting for the jockey to accept or reject the offline appointment invitation.</p>
                        {cancelAssignmentId === id ? (
                          <div className="owner-assignment-workflow__cancel-confirm" role="group" aria-label="Confirm invitation cancellation">
                            <span>Cancel this invitation?</span>
                            <button className="owner-button" disabled={isBusy} onClick={() => setCancelAssignmentId("")} type="button">Keep invitation</button>
                            <button className="owner-button owner-button--danger" disabled={isBusy} onClick={() => cancelJockeyInvitation(item)} type="button">
                              {isBusy ? "Cancelling..." : "Cancel invitation"}
                            </button>
                          </div>
                        ) : (
                          <button className="owner-button owner-button--danger" disabled={isBusy} onClick={() => setCancelAssignmentId(id)} type="button">
                            Cancel invitation
                          </button>
                        )}
                      </div>
                    )}
                    {!raceLocked && ["meeting_accepted", "terms_rejected"].includes(status) && (
                      <div className="owner-assignment-workflow__form">
                        <label className="owner-field owner-field--full">
                          <span>{isBackupAssignment ? "Standby terms" : "Terms for jockey confirmation"} <em>Required</em></span>
                          <textarea maxLength={5000} value={draft.agreedTerms ?? item.terms?.agreed_terms ?? ""} onChange={(event) => updateWorkflowDraft(id, "agreedTerms", event.target.value)} placeholder={isBackupAssignment ? "Record standby window, availability, fee, notice, and replacement conditions." : "Record fee, race scope, preparation, and responsibilities agreed during the appointment."} />
                        </label>
                        <label className="owner-field owner-field--full">
                          <span>Appointment note <small>Optional</small></span>
                          <textarea maxLength={2000} value={draft.meetingNote ?? item.terms?.meeting_note ?? ""} onChange={(event) => updateWorkflowDraft(id, "meetingNote", event.target.value)} placeholder="Add a short appointment summary." />
                        </label>
                        {status === "terms_rejected" && item.terms?.response_message && <p className="owner-assignment-workflow__note">Jockey response: {item.terms.response_message}</p>}
                        <button className="owner-button owner-button--primary" disabled={isBusy} onClick={() => submitTerms(item)} type="button">
                          <Save size={16} /> {isBusy ? "Sending terms..." : status === "terms_rejected" ? "Resend terms to jockey" : "Send terms to jockey"}
                        </button>
                      </div>
                    )}

                    {status === "terms_pending_confirmation" && <p className="owner-assignment-workflow__note">Terms were sent to the jockey. Contract upload unlocks after the jockey confirms them.</p>}
                    {status === "standby_terms_pending_confirmation" && <p className="owner-assignment-workflow__note">Standby terms were sent. This backup becomes confirmed immediately after the jockey accepts them.</p>}

                    {!raceLocked && status === "terms_agreed" && !isBackupAssignment && (
                      <div className="owner-assignment-workflow__form owner-assignment-workflow__form--contract">
                        <div className="owner-assignment-workflow__terms">
                          <span>Terms confirmed by jockey</span>
                          <p>{item.terms?.agreed_terms}</p>
                        </div>
                        <label className={`owner-contract-upload owner-field--full ${draft.contractFile ? "has-file" : ""}`}>
                          <input accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp" type="file" onChange={(event) => updateWorkflowDraft(id, "contractFile", event.target.files?.[0] || null)} />
                          <span className="owner-contract-upload__icon"><Upload size={20} /></span>
                          <span className="owner-contract-upload__copy">
                            <strong>{draft.contractFile?.name || "Choose signed contract"}</strong>
                            <small>PDF, JPG, PNG, or WEBP, up to 7 MB</small>
                          </span>
                          <span className="owner-contract-upload__action">Browse</span>
                        </label>
                        <button className="owner-button owner-button--primary" disabled={isBusy} onClick={() => uploadContract(item)} type="button">
                          <Upload size={16} /> {isBusy ? "Sending contract..." : "Send contract to jockey"}
                        </button>
                      </div>
                    )}

                    {status === "contract_uploaded" && <p className="owner-assignment-workflow__note">Contract sent. The assignment becomes accepted only after the jockey confirms it.</p>}
                    {status === "cancelled" && !item.withdrawal?.reason && item.cancellation_request?.status !== "approved" && (
                      <p className="owner-assignment-workflow__note">This jockey invitation was cancelled and can no longer be accepted.</p>
                    )}
                    {["accepted", "standby_confirmed"].includes(status) && (
                      <div className="owner-assignment-workflow__form owner-assignment-workflow__form--accepted">
                        <div className="owner-assignment-confirmation" role="status">
                          <span className="owner-assignment-confirmation__icon" aria-hidden="true"><CheckCircle2 size={21} strokeWidth={2.4} /></span>
                          <div className="owner-assignment-confirmation__copy">
                            <span className="owner-assignment-confirmation__eyebrow">{isBackupAssignment ? "Standby agreement confirmed" : "Contract accepted"}</span>
                            <strong>{isBackupAssignment ? `${jockeyName} is confirmed as a standby rider.` : `${jockeyName} is confirmed to ride ${horseName}.`}</strong>
                            <span className="owner-assignment-confirmation__meta">{raceName} · {isBackupAssignment ? `Backup${item.backup_priority ? ` #${item.backup_priority}` : ""}` : "Primary assignment"}</span>
                          </div>
                          {!isBackupAssignment && item.contract?.file_url && (
                            <a className="owner-assignment-confirmation__contract" href={item.contract.file_url} rel="noreferrer" target="_blank">
                              <FileText size={16} /> <span>View signed contract</span>
                            </a>
                          )}
                        </div>
                        {isBackupAssignment && !raceLocked && (
                          <>
                            {hasActivePrimary && (
                              <p className="owner-assignment-workflow__note">
                                The current primary contract must end by mutual agreement before this backup can be promoted.
                              </p>
                            )}
                            <button className="owner-button owner-button--primary" disabled={isBusy || hasActivePrimary || cancellationPending} onClick={() => promoteBackupAssignment(item)} type="button">
                              <RotateCcw size={16} /> {isBusy ? "Promoting..." : "Promote to primary"}
                            </button>
                          </>
                        )}
                        {!raceLocked && cancellationPending && ownerRequestedCancellation && (
                          <div className="owner-assignment-workflow__terms">
                            <span>Cancellation awaiting jockey confirmation</span>
                            <p>{cancellationRequest.reason}</p>
                            <small>The {isBackupAssignment ? "standby agreement" : "primary contract"} remains active until the jockey agrees.</small>
                          </div>
                        )}
                        {!raceLocked && cancellationPending && !ownerRequestedCancellation && (
                          <div className="owner-assignment-workflow__form">
                            <div className="owner-assignment-workflow__terms">
                              <span>Jockey requested {isBackupAssignment ? "standby agreement" : "primary contract"} cancellation</span>
                              <p>{cancellationRequest.reason}</p>
                            </div>
                            <label className="owner-field owner-field--full">
                              <span>Response note <small>Optional</small></span>
                              <textarea
                                maxLength={1000}
                                value={draft.cancellationResponse || ""}
                                onChange={(event) => updateWorkflowDraft(id, "cancellationResponse", event.target.value)}
                                placeholder="Record your response for the cancellation audit."
                              />
                            </label>
                            <div className="owner-assignment-workflow__invite-actions">
                              <button className="owner-button" disabled={isBusy} onClick={() => respondToAssignmentCancellation(item, "reject")} type="button">
                                Keep agreement
                              </button>
                              <button className="owner-button owner-button--danger" disabled={isBusy} onClick={() => respondToAssignmentCancellation(item, "approve")} type="button">
                                {isBusy ? "Updating..." : `Agree to end ${isBackupAssignment ? "standby" : "contract"}`}
                              </button>
                            </div>
                          </div>
                        )}
                        {!raceLocked && !cancellationPending && (
                          <div className="owner-assignment-workflow__form">
                            {cancellationRequest?.status === "rejected" && (
                              <p className="owner-assignment-workflow__note">
                                Previous cancellation request was declined. The agreement remains active.
                              </p>
                            )}
                            <label className="owner-field owner-field--full">
                              <span>Reason for ending {isBackupAssignment ? "standby agreement" : "contract"} <em>Required</em></span>
                              <textarea
                                maxLength={1000}
                                value={draft.cancellationReason || ""}
                                onChange={(event) => updateWorkflowDraft(id, "cancellationReason", event.target.value)}
                                placeholder={`Explain why you are asking the jockey to end this ${isBackupAssignment ? "standby agreement" : "primary contract"}.`}
                              />
                            </label>
                            <button className="owner-button owner-button--danger" disabled={isBusy} onClick={() => requestAssignmentCancellation(item)} type="button">
                              {isBusy ? "Sending request..." : "Request mutual cancellation"}
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                    {!raceLocked && withdrawableAssignmentStatuses.includes(status) && (
                      <div className="owner-assignment-workflow__form">
                        <label className="owner-field owner-field--full">
                          <span>Reason for withdrawing <em>Required</em></span>
                          <textarea
                            maxLength={1000}
                            value={draft.withdrawalReason || ""}
                            onChange={(event) => updateWorkflowDraft(id, "withdrawalReason", event.target.value)}
                            placeholder="Explain why this negotiation cannot continue."
                          />
                        </label>
                        <button className="owner-button owner-button--danger" disabled={isBusy} onClick={() => withdrawJockeyAssignment(item)} type="button">
                          {isBusy ? "Withdrawing..." : "Withdraw from negotiation"}
                        </button>
                      </div>
                    )}
                    {status === "replaced" && <p className="owner-assignment-workflow__note">This primary assignment was replaced by a promoted backup jockey.</p>}
                    {status === "meeting_rejected" && <p className="owner-assignment-workflow__note">The jockey declined the offline appointment invitation.</p>}
                    {status === "contract_rejected" && <p className="owner-assignment-workflow__note">The jockey rejected the contract. This assignment was not accepted.</p>}
                    {status === "cancelled" && item.withdrawal?.reason && <p className="owner-assignment-workflow__note">Withdrawn by {item.withdrawal.initiated_by_party === "jockey" ? "jockey" : "horse owner"}: {item.withdrawal.reason}</p>}
                    {status === "cancelled" && !item.withdrawal?.reason && item.cancellation_request?.status === "approved" && (
                      <p className="owner-assignment-workflow__note">
                        Ended by mutual confirmation. Requested by {item.cancellation_request.initiated_by_party === "jockey" ? "jockey" : "horse owner"}: {item.cancellation_request.reason}
                      </p>
                    )}
                    {!isBackupAssignment && item.contract?.file_url && status !== "accepted" && <a className="owner-assignment-contract-link" href={item.contract.file_url} rel="noreferrer" target="_blank"><FileText size={15} /> View uploaded contract</a>}
                  </article>
                );
              })() : (
                <div className="owner-assignment-workflow__placeholder">
                  <ClipboardCheck size={22} />
                  <strong>Select an invitation</strong>
                  <span>Choose one item from the list to view its status, details, and available actions.</span>
                </div>
              )}
            </div>
          </div>
        )}
      </section>

      <form className="owner-registration-form owner-jockey-invite-workspace" id="owner-jockey-invitation" onSubmit={submitAssignment}>
        <div className="owner-card__header">
          <div>
            <span className="owner-kicker">New pairing</span>
            <h2>Create a Jockey invitation</h2>
          </div>
          <Send size={20} />
        </div>

        <nav className="owner-invite-steps" aria-label="Invitation steps">
          {[
            { value: 1, label: "Race entry", icon: Flag },
            { value: 2, label: "Select Jockey", icon: UserRound },
            { value: 3, label: "Appointment and review", icon: CalendarDays },
          ].map((step) => {
            const StepIcon = step.icon;
            return (
              <button
                className={`${activeInviteStep === step.value ? "is-active" : ""} ${activeInviteStep > step.value ? "is-complete" : ""}`}
                key={step.value}
                onClick={() => {
                  setActiveInviteStep(step.value);
                  document.getElementById(`owner-invite-step-${step.value}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
                }}
                type="button"
              >
                <span><StepIcon size={15} /></span>
                <strong>{step.value}. {step.label}</strong>
              </button>
            );
          })}
        </nav>

        <div className="owner-segmented owner-segmented--schedule owner-assignment-type" aria-label="Jockey assignment type">
          {[
            { value: "primary", label: "Primary Jockey" },
            { value: "backup", label: "Backup Jockey" },
          ].map((item) => (
            <button
              className={assignment.assignmentType === item.value ? "owner-segmented__active" : ""}
              key={item.value}
              onClick={() => {
                setAssignment((current) => ({ ...current, assignmentType: item.value, registrationId: "" }));
                setActiveInviteStep(1);
              }}
              type="button"
            >
              {item.label}
            </button>
          ))}
        </div>

        <section className="owner-approved-entry-panel" id="owner-invite-step-1">
          <div className="owner-approved-entry-panel__header">
            <div>
              <span className="owner-kicker">Approved race entries</span>
              <h3>Choose the race slot before selecting a jockey</h3>
            </div>
            <span className="owner-badge owner-badge--green">{assignableRaceEntries.length} {isBackupInvitation ? "backup-ready" : "ready"}</span>
          </div>

          {assignableRaceEntries.length ? (
            <div className="owner-approved-entry-list owner-approved-entry-list--always" role="listbox" aria-label={isBackupInvitation ? "Race entries ready for a backup Jockey" : "Race entries ready for a primary Jockey"}>
              {assignableRaceEntries.map((entry) => {
                const primary = findPrimaryAssignmentForRegistration(entry);
                return (
                  <button
                    aria-selected={selectedEntry?.id === entry.id}
                    className={`owner-approved-entry owner-approved-entry--detailed ${selectedEntry?.id === entry.id ? "is-selected" : ""}`}
                    key={entry.id}
                    onClick={() => selectRaceEntry(entry.id)}
                    role="option"
                    type="button"
                  >
                    <span className="owner-approved-entry__avatar">
                      <img src={horseRosterImages[imageIndexForId(entry.horseId, horseRosterImages.length)]} alt="" />
                    </span>
                    <span className="owner-approved-entry__main">
                      <strong>{entry.horse}</strong>
                      <small>{entry.race} / {entry.tournament}</small>
                    </span>
                    <span className="owner-approved-entry__facts">
                      <small>Race time</small>
                      <strong>{entry.raceDate ? formatInvitationDate(entry.raceDate) : "To be announced"}</strong>
                    </span>
                    <span className="owner-approved-entry__facts">
                      <small>Current pairing</small>
                      <strong>{primary ? assignmentPartyName(primary.jockey_id, "Primary selected") : "No primary yet"}</strong>
                    </span>
                    <span className="owner-approved-entry__check" aria-hidden="true">
                      {selectedEntry?.id === entry.id ? <Check size={16} /> : <ArrowRight size={16} />}
                    </span>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="owner-assignment-empty" role="status">
              <ClipboardCheck size={18} />
              <div>
                <strong>No race entry is ready for a jockey invitation.</strong>
                <span>{isBackupInvitation ? "A backup invitation needs a confirmed race entry with an accepted primary Jockey first." : "The race entry must be confirmed and must not already have a primary Jockey."}</span>
              </div>
            </div>
          )}
        </section>

        <section className="owner-jockey-picker" id="owner-invite-step-2" aria-label="Choose a Jockey">
          <div className="owner-jockey-picker__header">
            <div>
              <span className="owner-kicker">Jockey selection</span>
              <h3>Choose a suitable Jockey</h3>
            </div>
            <span className="owner-badge owner-badge--green">{availableJockeyCount} available</span>
          </div>

          {jockeys.length ? (
            <div className="owner-jockey-browser">
              <label className="owner-jockey-search">
                <Search size={16} />
                <input
                  aria-label="Search Jockeys"
                  onChange={(event) => setJockeySearch(event.target.value)}
                  placeholder="Search by name or license"
                  type="search"
                  value={jockeySearch}
                />
              </label>

              <div className="owner-jockey-picker__list owner-jockey-picker__list--always" role="listbox" aria-label="Jockey selection">
                {visibleJockeys.map((jockey) => {
                  const weight = jockey.raw?.weight_kg ?? jockey.raw?.weight;
                  const expiry = jockey.raw?.license_expiry_date || jockey.raw?.license_expiry;
                  const winRate = Math.round((Number(jockey.wins || 0) / Math.max(Number(jockey.races || 0), 1)) * 100);
                  const isUnavailable = isJockeyUnavailableForRace(jockey);
                  const unavailableReason = isUnavailable ? getJockeyAvailabilityReason(jockey) : "";
                  return (
                    <div
                      className={`owner-jockey-picker__option owner-jockey-picker__option--detailed ${selectedJockey?.id === jockey.id ? "is-selected" : ""} ${isUnavailable ? "is-unavailable" : ""}`}
                      key={jockey.id}
                      role="option"
                      aria-selected={selectedJockey?.id === jockey.id}
                      aria-disabled={isUnavailable}
                    >
                      <button
                        className="owner-jockey-picker__select"
                        disabled={detailLoadingId === jockey.id || isUnavailable}
                        onClick={() => selectJockey(jockey)}
                        type="button"
                      >
                        <span className="owner-jockey-picker__avatar">
                          <img src={jockeyImages[imageIndexForId(jockey.id, jockeyImages.length)]} alt="" />
                        </span>
                        <span className="owner-jockey-picker__copy">
                          <strong>{jockey.name}</strong>
                          <small>{jockey.licenseNumber || "License not recorded"}</small>
                        </span>
                        <span className="owner-jockey-picker__fact">
                          <small>Weight</small>
                          <strong>{weight ? `${weight} kg` : "Not recorded"}</strong>
                        </span>
                        <span className="owner-jockey-picker__fact">
                          <small>Starts / wins</small>
                          <strong>{jockey.races || 0} / {jockey.wins || 0} ({winRate}%)</strong>
                        </span>
                        <span className="owner-jockey-picker__fact">
                          <small>License expiry</small>
                          <strong>{expiry ? new Date(expiry).toLocaleDateString("en-US") : "Not recorded"}</strong>
                        </span>
                        <span className={`owner-badge ${isUnavailable ? "owner-badge--muted" : statusClass(jockey.status)}`}>
                          {isUnavailable ? "Unavailable" : jockey.status}
                        </span>
                        <span className="owner-jockey-picker__selection" aria-hidden="true">
                          {selectedJockey?.id === jockey.id ? <Check size={16} /> : <ArrowRight size={16} />}
                        </span>
                      </button>
                      <button
                        aria-label={`View ${jockey.name} details`}
                        className="owner-jockey-picker__info"
                        onClick={(event) => openJockeyInfo(jockey, event)}
                        title="View Jockey details"
                        type="button"
                      >
                        <Info size={16} />
                      </button>
                      {isUnavailable && (
                        <span className="owner-jockey-picker__availability" role="status">
                          <ShieldCheck size={14} />
                          {unavailableReason}
                        </span>
                      )}
                    </div>
                  );
                })}
                {!visibleJockeys.length && (
                  <div className="owner-assignment-empty" role="status">
                    <Search size={18} />
                    <div><strong>No matching Jockey found.</strong><span>Try another name or license number.</span></div>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="owner-assignment-empty" role="status">
              <UserRound size={18} />
              <div><strong>No active jockey profiles are available for invitation.</strong></div>
            </div>
          )}

          {jockeyPreview && jockeyPreviewPosition && (
            <aside
              className="owner-jockey-card owner-jockey-card--preview"
              role="status"
              style={{ top: jockeyPreviewPosition.top, left: jockeyPreviewPosition.left }}
            >
              <div className="owner-jockey-card__media">
                <img src={jockeyImages[imageIndexForId(jockeyPreview.id, jockeyImages.length)]} alt={`${jockeyPreview.name} jockey profile`} />
                <span className={`owner-badge ${statusClass(jockeyPreview.status)}`}>{jockeyPreview.status}</span>
              </div>
              <div className="owner-jockey-card__body">
                <div className="owner-jockey-card__header">
                  <span className="owner-kicker">{compactRecordCode("License", jockeyPreview.licenseNumber || jockeyPreview.id)}</span>
                  <h2>{jockeyPreview.name}</h2>
                  <button
                    aria-label="Close Jockey details"
                    className="owner-jockey-preview-close"
                    onClick={() => {
                      setJockeyPreview(null);
                      setJockeyPreviewPosition(null);
                    }}
                    title="Close"
                    type="button"
                  >
                    <X size={16} />
                  </button>
                </div>
                <div className="owner-jockey-pairing owner-jockey-pairing--compact">
                  <UserRound size={18} />
                  <div>
                    <span>Current pairing</span>
                    <strong>{jockeyPreview.assignedHorse || "Unassigned"}</strong>
                  </div>
                </div>
                <div className="owner-jockey-metrics">
                  <div><span>Wins</span><strong>{jockeyPreview.wins ?? 0}</strong></div>
                  <div><span>Race starts</span><strong>{jockeyPreview.races ?? 0}</strong></div>
                  <div><span>License</span><strong>{jockeyPreview.licenseNumber || "Not set"}</strong></div>
                </div>
              </div>
            </aside>
          )}
        </section>

        <aside className="owner-invitation-review" aria-label="Invitation review">
          <div className="owner-invitation-review__header">
            <div>
              <span className="owner-kicker">Review</span>
              <h3>Invitation summary</h3>
            </div>
            <span className={`owner-badge ${invitationReady ? "owner-badge--green" : "owner-badge--amber"}`}>
              {invitationReady ? "Ready" : "Incomplete"}
            </span>
          </div>

          <div className="owner-invitation-context">
            <div><span>Assignment</span><strong>{isBackupInvitation ? "Backup Jockey" : "Primary Jockey"}</strong></div>
            <div><span>Horse</span><strong>{selectedHorse?.name || "Not selected"}</strong></div>
            <div><span>Race</span><strong>{selectedRace?.name || "Not selected"}</strong></div>
            <div><span>Jockey</span><strong>{selectedJockeyDetail?.name || selectedJockey?.name || "Not selected"}</strong></div>
            <div><span>Appointment</span><strong>{assignment.meetingTime ? formatInvitationDate(assignment.meetingTime) : "Not scheduled"}</strong></div>
            <div><span>Location</span><strong>{assignment.locationName || "Not selected"}</strong></div>
          </div>

          <div className="owner-invitation-review__flow" aria-label="Pairing process">
            {[
              "Jockey accepts appointment",
              isBackupInvitation ? "Confirm standby terms" : "Agree terms",
              isBackupInvitation ? "Standby pairing is confirmed" : "Upload signed contract",
              !isBackupInvitation && "Jockey confirms contract",
            ].filter(Boolean).map((item, index, items) => (
              <div key={item}>
                <span>{index + 1}</span>
                <strong>{item}</strong>
                {index < items.length - 1 && <ArrowRight size={14} />}
              </div>
            ))}
          </div>

          <p className={`owner-invitation-review__readiness ${invitationReady ? "is-ready" : ""}`}>
            {invitationReady
              ? "Everything is ready for your final review."
              : firstMissingRequirement?.label || (isBackupInvitation ? "This entry is not ready for a backup Jockey." : "This entry already has an active primary Jockey.")}
          </p>

          <button
            className="owner-button owner-button--primary owner-invitation-submit"
            disabled={isAssigning || assignmentsLoading || !invitationReady || detailLoadingId === selectedJockeyId}
            type="submit"
          >
            <Send size={17} />
            {isAssigning ? "Preparing invitation..." : "Review invitation"}
          </button>
        </aside>

        <div className="owner-invitation-fields" id="owner-invite-step-3">
          <fieldset className="owner-invitation-section owner-invitation-section--message">
            <legend><MessageSquareText size={18} /><span>Invitation note</span></legend>
            <label className="owner-field owner-field--full">
              <span>Message <small>Optional</small></span>
              <textarea value={assignment.message} onChange={(event) => updateAssignment("message", event.target.value)} placeholder="Share race preparation, arrival time, or stable notes..." />
            </label>
          </fieldset>

          <fieldset className="owner-invitation-section owner-invitation-section--meeting">
            <legend><MapPin size={18} /><span>Offline appointment</span></legend>
            <div className="owner-invitation-section__grid">
              <label className="owner-field owner-field--appointment-title">
                <span>Appointment title <em>Required</em></span>
                <input required value={assignment.meetingTitle} onChange={(event) => updateAssignment("meetingTitle", event.target.value)} placeholder="Contract discussion at the stable office" />
              </label>
              <label className="owner-field owner-field--appointment-time">
                <span>Appointment time <em>Required</em></span>
                <input
                  required
                  type="datetime-local"
                  min={appointmentMinimum}
                  max={appointmentMaximum}
                  value={assignment.meetingTime}
                  onFocus={() => setAppointmentMinimum(toLocalDateTimeInputValue(new Date(Date.now() + 60 * 1000)))}
                  onChange={(event) => updateAssignment("meetingTime", event.target.value)}
                  aria-describedby="owner-appointment-readiness"
                />
              </label>
              <small
                className={`owner-field-readiness owner-field-readiness--appointment ${appointmentReadiness.ready ? "is-ready" : ""}`}
                id="owner-appointment-readiness"
              >
                {appointmentReadiness.ready ? <CheckCircle2 size={14} /> : <CalendarDays size={14} />}
                {appointmentReadiness.message}
              </small>
              <label className="owner-field owner-field--location-name">
                <span>Location name <em>Required</em></span>
                <input required value={assignment.locationName} onChange={(event) => updateAssignment("locationName", event.target.value)} placeholder="Saigon Racing Club Office" />
              </label>
              <label className="owner-field owner-field--appointment-address">
                <span>Address <em>Required</em></span>
                <input required value={assignment.address} onChange={(event) => updateAssignment("address", event.target.value)} placeholder="123 Nguyen Hue Street" />
              </label>
              <label className="owner-field owner-field--appointment-area">
                <span>City <small>Optional</small></span>
                <input value={assignment.city} onChange={(event) => updateAssignment("city", event.target.value)} placeholder="Ho Chi Minh City" />
              </label>
              <label className="owner-field owner-field--appointment-area">
                <span>District <small>Optional</small></span>
                <input value={assignment.district} onChange={(event) => updateAssignment("district", event.target.value)} placeholder="District 1" />
              </label>
              <label className="owner-field owner-field--appointment-area">
                <span>Ward <small>Optional</small></span>
                <input value={assignment.ward} onChange={(event) => updateAssignment("ward", event.target.value)} placeholder="Ben Nghe" />
              </label>
              <label className="owner-field owner-field--appointment-map">
                <span>Map URL <small>Optional</small></span>
                <input type="url" value={assignment.mapUrl} onChange={(event) => updateAssignment("mapUrl", event.target.value)} placeholder="https://maps.google.com/..." />
              </label>
              <label className="owner-field owner-field--appointment-contact">
                <span>Contact name <small>Optional</small></span>
                <input value={assignment.contactName} onChange={(event) => updateAssignment("contactName", event.target.value)} placeholder="Nguyen Van A" />
              </label>
              <label className="owner-field owner-field--appointment-contact">
                <span>Contact phone <small>Optional</small></span>
                <input value={assignment.contactPhone} onChange={(event) => updateAssignment("contactPhone", event.target.value)} placeholder="+84901234567" />
              </label>
            </div>
          </fieldset>

        </div>

        {blockedByNoEntry && (
          <div className="owner-assignment-conflict" role="status">
            <ClipboardCheck size={16} />
            <span><strong>No eligible race entry.</strong> {isBackupInvitation ? "A backup requires an accepted primary Jockey and the race entry must not already have a backup Jockey." : "A horse needs a confirmed race entry and no existing primary Jockey before you can send an invitation."}</span>
          </div>
        )}

        {!isBackupInvitation && existingAssignment && (
          <div className="owner-assignment-conflict" role="status">
            <ShieldCheck size={16} />
            <span><strong>Primary assignment already exists.</strong> {selectedHorse?.name} already has a {existingAssignment.status || "current"} primary jockey assignment for {selectedRace?.name}.</span>
          </div>
        )}

        {selectedJockeyDuplicate && (
          <div className="owner-assignment-conflict" role="status">
            <ShieldCheck size={16} />
            <span><strong>Jockey already selected.</strong> {selectedJockey?.name} already has an active assignment for this horse and race.</span>
          </div>
        )}

        {selectedJockeyUnavailable && (
          <div className="owner-assignment-conflict" role="status">
            <ShieldCheck size={16} />
            <span><strong>This Jockey cannot be invited to the selected race.</strong> {getJockeyAvailabilityReason(selectedJockey)}</span>
          </div>
        )}

        <div className="owner-form-actions owner-invitation-actions">
          <div className="owner-invitation-feedback" aria-live="polite">
            {assignmentSaved && <span className="owner-success"><CheckCircle2 size={16} /> Invitation sent.</span>}
            {assignmentError && <span className="owner-success owner-success--error">{assignmentError}</span>}
            {!assignmentSaved && !assignmentError && <span>The Jockey reviews the appointment first. Terms and contract actions become available as each stage is confirmed.</span>}
          </div>
        </div>
      </form>

    </div>
  );
}

function OwnerSchedule() {
  const [filter, setFilter] = useState("All");
  const { registrations, isLoading, error } = useOwnerRegistrations();
  const { assignments, isLoading: assignmentsLoading, error: assignmentsError } = useOwnerJockeyAssignments();
  const ownerSchedule = registrations
    .map((registration) => toOwnerScheduleEntry(
      registration,
      findPrimaryAssignmentForRegistration(assignments, registration)
        ?? findAcceptedPrimaryAssignment(assignments, registration)
    ))
    .sort((first, second) => {
      const firstDate = first.date && first.date !== "Date unavailable" ? new Date(first.date).getTime() : Number.POSITIVE_INFINITY;
      const secondDate = second.date && second.date !== "Date unavailable" ? new Date(second.date).getTime() : Number.POSITIVE_INFINITY;
      return firstDate - secondDate;
    });
  const visibleRaces = ownerSchedule.filter((race) => filter === "All" || race.status === filter);
  const confirmedCount = ownerSchedule.filter((race) => race.status === "Confirmed").length;
  const pendingCount = ownerSchedule.filter((race) => race.status === "Pending").length;
  const closedCount = ownerSchedule.filter((race) => race.status === "Closed").length;
  const featuredRace = visibleRaces.find((race) => {
    const timestamp = new Date(`${race.date} ${race.clock}`).getTime();
    return Number.isFinite(timestamp) && timestamp >= Date.now();
  }) ?? visibleRaces[0] ?? ownerSchedule[0];

  if (isLoading || assignmentsLoading) {
    return <div className="owner-schedule-page"><LoadingSkeleton ariaLabel="Loading owner schedule" rows={5} variant="cards" /></div>;
  }

  return (
    <div className="owner-schedule-page">
      <section className="owner-schedule-hero">
        <img src={scheduleHeroImage} alt="Race track at night for owner schedule planning" />
        <div className="owner-schedule-hero__copy">
          <p className="owner-eyebrow">Race calendar</p>
          <h1>Your race calendar, without the clutter.</h1>
          <p>See what runs next, who is riding, and which entries still need attention.</p>
        </div>
        <aside className="owner-schedule-hero__panel">
          {featuredRace ? (
            <>
              <span className="owner-schedule-hero__panel-label"><CalendarDays size={15} /> Next on your calendar</span>
              <span className={`owner-badge ${statusClass(featuredRace.status)}`}>{featuredRace.status}</span>
              <strong>{featuredRace.race}</strong>
              <p>{featuredRace.time} / {featuredRace.venue}</p>
            </>
          ) : (
            <>
              <span className="owner-schedule-hero__panel-label"><CalendarDays size={15} /> Next on your calendar</span>
              <span className="owner-badge">No entries</span>
              <strong>Schedule unavailable</strong>
              <p>Submit a race registration to create an owner schedule entry.</p>
            </>
          )}
        </aside>
      </section>

      <section className="owner-schedule-stats" aria-label="Schedule summary">
        {[
          { label: "All slots", value: ownerSchedule.length, note: "Race windows", icon: CalendarDays },
          { label: "Confirmed", value: confirmedCount, note: "Ready for race day", icon: BadgeCheck },
          { label: "Pending", value: pendingCount, note: "Waiting on admin", icon: ClipboardCheck },
          { label: "Closed", value: closedCount, note: "Rejected or cancelled", icon: Flag },
        ].map((item) => {
          const Icon = item.icon;
          return (
            <article className="owner-schedule-stat" key={item.label}>
              <Icon size={18} />
              <span>{item.label}</span>
              <strong>{item.value}</strong>
              <small>{item.note}</small>
            </article>
          );
        })}
      </section>

      <article className="owner-schedule-board">
        <div className="owner-schedule-board__header">
          <div>
            <span className="owner-kicker">Schedule board</span>
            <h2>{filter === "All" ? "All race slots" : `${filter} race slots`}</h2>
          </div>
          <div className="owner-segmented owner-segmented--schedule">
            {["All", "Confirmed", "Pending", "Closed"].map((item) => (
              <button className={filter === item ? "owner-segmented__active" : ""} key={item} type="button" onClick={() => setFilter(item)}>{item}</button>
            ))}
          </div>
        </div>

        <div className="owner-schedule-list">
          {visibleRaces.map((race) => {
            return (
              <div className="owner-schedule-slot" key={race.id}>
                <div className="owner-schedule-slot__time">
                  <span>{race.date}</span>
                  <strong>{race.clock}</strong>
                </div>
                <div className="owner-schedule-slot__race">
                  <span className="owner-kicker">{race.round && race.round !== "Round unavailable" && !isMongoObjectId(race.round) && !isUuidLike(race.round) ? race.round : "Race day"}</span>
                  <h3>{race.race}</h3>
                  <small><MapPin size={13} /> {race.venue}</small>
                </div>
                <div className="owner-schedule-slot__pairing">
                  <div><span>Horse</span><strong>{race.horse}</strong></div>
                  <div><span>Jockey</span><strong>{race.jockey}</strong></div>
                </div>
                <div className="owner-schedule-slot__status">
                  <span className={`owner-badge ${statusClass(race.status)}`}>{race.status}</span>
                  <small>{race.tournament}</small>
                </div>
              </div>
            );
          })}
          {(error || assignmentsError) && <div className="owner-empty owner-empty--compact owner-empty--error">{error || assignmentsError}</div>}
          {!error && visibleRaces.length === 0 && <div className="owner-empty owner-empty--compact">No race slots match this filter.</div>}
        </div>
      </article>
    </div>
  );
}

function OwnerResults() {
  const { awards, isLoading, error } = useOwnerPrizeAwards();
  const totalOwnerAmount = awards.reduce((total, award) => total + Number(award.ownerAmount || 0), 0);
  const paidOwnerAmount = awards
    .filter((award) => award.awardStatus === "Paid")
    .reduce((total, award) => total + Number(award.ownerAmount || 0), 0);
  const podiumCount = awards.filter((award) => Number(award.position) > 0 && Number(award.position) <= 3).length;
  const penaltyCount = awards.filter((award) => award.penaltyCount > 0 || award.isDisqualified).length;
  const featuredAward = awards[0];

  if (isLoading) {
    return <div className="owner-results-page"><LoadingSkeleton ariaLabel="Loading owner results and prizes" rows={6} variant="cards" /></div>;
  }

  return (
    <div className="owner-results-page">
      {error && <section className="admin-live-state admin-live-state--warning" aria-live="polite">{error}</section>}

      <section className="owner-results-hero">
        <img src={resultsHeroImage} alt="Race trophy display for owner results and prizes" />
        <div className="owner-results-hero__copy">
          <p className="owner-eyebrow">Results and prizes</p>
          <h1>Stable results and prize ledger.</h1>
          <p>Published race finishes, owner prize share, and penalty impact are shown from the official race result.</p>
        </div>
        <aside className="owner-results-hero__panel">
          <span className="owner-badge owner-badge--green"><Trophy size={14} /> Owner share</span>
          <strong>{formatMoney(totalOwnerAmount, featuredAward?.currency || "VND")}</strong>
          <p>{paidOwnerAmount > 0 ? `${formatMoney(paidOwnerAmount, featuredAward?.currency || "VND")} has been marked paid.` : "Awards appear after admin publishes race results."}</p>
        </aside>
      </section>

      <section className="owner-results-stats" aria-label="Results summary">
        {[
          { label: "Owner earnings", value: formatMoney(totalOwnerAmount, featuredAward?.currency || "VND"), note: "Owner share only", icon: Trophy },
          { label: "Prize awards", value: awards.length, note: "Published result awards", icon: Award },
          { label: "Penalty impact", value: penaltyCount, note: "Confirmed race penalties", icon: Flag },
          { label: "Podiums", value: podiumCount, note: "Top-three finishes", icon: BadgeCheck },
        ].map((item) => {
          const Icon = item.icon;
          return (
            <article className="owner-results-stat" key={item.label}>
              <Icon size={18} />
              <span>{item.label}</span>
              <strong>{item.value}</strong>
              <small>{item.note}</small>
            </article>
          );
        })}
      </section>

      <section className="owner-results-layout">
        <article className="owner-results-feature">
          <div>
            <span className="owner-kicker">Latest published award</span>
            <h2>{featuredAward ? `${featuredAward.horseName} finished ${featuredAward.finalPositionLabel}.` : "No published award yet."}</h2>
            <p>{featuredAward ? `${featuredAward.raceName} uses the final official result after penalties are applied.` : "When a race is published, the owner's result and prize share will be listed here."}</p>
          </div>
          <div className="owner-results-feature__facts">
            <div><span>Horse</span><strong>{featuredAward?.horseName || "Unavailable"}</strong></div>
            <div><span>Race</span><strong>{featuredAward?.raceName || "Unavailable"}</strong></div>
            <div><span>Penalty</span><strong>{featuredAward?.penaltySummary || "Unavailable"}</strong></div>
          </div>
        </article>

        <article className="owner-results-board">
          <div className="owner-card__header">
            <div>
              <span className="owner-kicker">Published outcomes</span>
              <h2>Race result ledger</h2>
            </div>
            <Trophy size={20} />
          </div>
          <div className="owner-results-list">
            {awards.length === 0 && (
              <div className="owner-empty" role="status">
                No published prize awards yet. Awards appear after admin publishes race results.
              </div>
            )}
            {awards.map((award) => (
              <div className="owner-results-row" key={award.id}>
                <div className="owner-results-row__date">{award.finalPositionLabel}</div>
                <div className="owner-results-row__main">
                  <h3>{award.horseName}</h3>
                  <small>{award.raceName} / {award.tournamentName}</small>
                  <small>{award.roundName} / {award.date} / {award.jockeyName}</small>
                </div>
                <div className="owner-results-row__metrics">
                  <div><span>Raw</span><strong>{award.rawPositionLabel} / {award.rawTime}</strong></div>
                  <div><span>Final</span><strong>{award.finalPositionLabel} / {award.finalTime}</strong></div>
                  <div><span>Penalty</span><strong>{award.penaltySummary}</strong></div>
                  <div><span>Owner prize</span><strong>{formatMoney(award.ownerAmount, award.currency)}</strong></div>
                  <div><span>Gross prize</span><strong>{formatMoney(award.grossAmount, award.currency)}</strong></div>
                  <div><span>Jockey share</span><strong>{formatMoney(award.jockeyAmount, award.currency)}</strong></div>
                </div>
                <span className={`owner-badge ${statusClass(award.isDisqualified ? "Disqualified" : award.awardStatus)}`}>
                  {award.isDisqualified ? "Disqualified" : award.awardStatus}
                </span>
              </div>
            ))}
          </div>
        </article>
      </section>
    </div>
  );
}

function OwnerProfile() {
  const { profile, isLoading, error, reload } = useOwnerProfile();
  const { awards } = useOwnerPrizeAwards();
  const [form, setForm] = useState({ stable: "", location: "", licenseNumber: "", status: "Ready" });
  const [message, setMessage] = useState("");
  const [saveError, setSaveError] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [avatarPreview, setAvatarPreview] = useState("");
  const [avatarError, setAvatarError] = useState("");

  useEffect(() => {
    if (!profile) return;

    setForm({
      stable: profile.stable,
      location: profile.location,
      licenseNumber: profile.licenseNumber,
      status: profile.status,
    });
  }, [profile]);

  useEffect(() => {
    setAvatarPreview(profile?.avatarUrl || "");
  }, [profile?.avatarUrl]);

  if (isLoading) {
    return <div className="owner-profile-page"><LoadingSkeleton ariaLabel="Loading owner profile" variant="detail" /></div>;
  }

  if (error || !profile) {
    return <div className="owner-empty owner-empty--error">{error || "Owner profile not found."}</div>;
  }

  const updateField = (field, value) => {
    setMessage("");
    setSaveError(false);
    setForm((current) => ({ ...current, [field]: value }));
  };

  const resetProfileForm = () => {
    setMessage("");
    setSaveError(false);
    setForm({
      stable: profile.stable,
      location: profile.location,
      licenseNumber: profile.licenseNumber,
      status: profile.status,
    });
  };
  const ownerPrizeTotal = awards.reduce((total, award) => total + Number(award.ownerAmount || 0), 0);
  const ownerPrizeCurrency = awards[0]?.currency || "VND";

  const handleProfileSubmit = async (event) => {
    event.preventDefault();
    setIsSaving(true);
    setMessage("");
    setSaveError(false);

    try {
      await ownerApi.updateProfile(toOwnerProfilePayload(form));
      await reload();
      setMessage("Profile changes saved.");
    } catch (apiError) {
      setSaveError(true);
      setMessage(apiError.message || "Unable to save owner profile.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleAvatarChange = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setAvatarError("Please choose an image file.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setAvatarError("Avatar must be 5 MB or smaller.");
      return;
    }

    setAvatarError("");
    const reader = new FileReader();
    reader.onload = async () => {
      const imageData = String(reader.result || "");
      setAvatarPreview(imageData);
      try {
        await ownerApi.updateProfile({ avatar_file_data: imageData });
        await reload();
      } catch (apiError) {
        setAvatarError(apiError.message || "Unable to save avatar.");
      }
    };
    reader.readAsDataURL(file);
    event.target.value = "";
  };

  return (
    <div className="owner-profile-page">
      <section className="owner-profile-hero">
        <img src={profileStableImage} alt={`${profile.stable} stable profile background`} />
        <div className="owner-profile-hero__copy">
          <p className="owner-eyebrow">Owner profile</p>
          <h1>{profile.name}</h1>
          <p>{profile.stable}</p>
          <div className="owner-profile-hero__meta">
            <span><MapPin size={15} /> {profile.location}</span>
          </div>
        </div>
        <aside className="owner-profile-card" aria-label="Verified owner identity">
          <label className="owner-profile-avatar-upload" title="Change avatar">
            <img src={avatarPreview || profileFallbackAvatar} alt={`${profile.name} owner avatar`} />
            <span>Change photo</span>
            <input accept="image/*" type="file" onChange={handleAvatarChange} />
          </label>
          <div>
            <span className="owner-badge owner-badge--green"><ShieldCheck size={14} /> Verified Owner</span>
            <strong>{profile.licenseNumber}</strong>
            <small>Owner license</small>
            {avatarError && <small className="owner-form-error">{avatarError}</small>}
          </div>
        </aside>
      </section>

      <section className="owner-profile-stats" aria-label="Owner account summary">
        {[ 
          { label: "Earnings", value: formatMoney(ownerPrizeTotal, ownerPrizeCurrency), note: `${awards.length} prize award${awards.length === 1 ? "" : "s"}`, icon: Award },
        ].map((item) => {
          const Icon = item.icon;
          return (
            <article className="owner-profile-stat" key={item.label}>
              <Icon size={18} />
              <span>{item.label}</span>
              <strong>{item.value}</strong>
              <small>{item.note}</small>
            </article>
          );
        })}
      </section>

      <section className="owner-profile-layout">
        <article className="owner-profile-panel-main">
          <div className="owner-card__header">
            <div>
              <span className="owner-kicker">Owner information</span>
              <h2>Contact and stable identity</h2>
            </div>
            <UserRound size={20} />
          </div>
          <div className="owner-profile-contact-grid">
            <div><span><UserRound size={14} /> Name</span><strong>{profile.name}</strong></div>
            <div><span><ShieldCheck size={14} /> Stable</span><strong>{profile.stable}</strong></div>
            <div><span><Mail size={14} /> Email</span><strong>{profile.email}</strong></div>
            <div><span><Phone size={14} /> Phone</span><strong>{profile.phone}</strong></div>
            <div><span><MapPin size={14} /> Location</span><strong>{profile.location}</strong></div>
            <div><span><BadgeCheck size={14} /> License</span><strong>{profile.licenseNumber}</strong></div>
          </div>
        </article>

        <aside className="owner-profile-verify">
          <div className="owner-card__header">
            <div>
              <span className="owner-kicker">Verification</span>
              <h2>Owner permissions</h2>
            </div>
            <ShieldCheck size={20} />
          </div>
          <div className="owner-profile-verify__body">
            <span className="owner-badge owner-badge--green"><ShieldCheck size={14} /> Verified Owner</span>
            <strong>Verified</strong>
            <p>Account can submit horse registrations, manage jockey assignments, and review prize awards after published race results.</p>
          </div>
        </aside>
      </section>

      <section className="owner-profile-edit-shell">
        <article className="owner-profile-panel-main owner-profile-edit-panel">
          <div className="owner-card__header">
            <div>
              <span className="owner-kicker">Profile settings</span>
              <h2>Edit stable details</h2>
              <p>Keep registration and licensing details current.</p>
            </div>
            <Edit3 size={20} />
          </div>
          <form className="owner-profile-edit-form" onSubmit={handleProfileSubmit}>
            <div className="owner-profile-edit-grid">
              <label className="owner-profile-field">
                <span>Stable name <em>Required</em></span>
                <input autoComplete="organization" maxLength={100} required value={form.stable} onChange={(event) => updateField("stable", event.target.value)} />
                <small>Shown on horse registrations and invitations.</small>
              </label>
              <label className="owner-profile-field">
                <span>Address <em>Required</em></span>
                <input autoComplete="street-address" maxLength={180} required value={form.location} onChange={(event) => updateField("location", event.target.value)} />
                <small>Used as the stable's primary contact location.</small>
              </label>
              <label className="owner-profile-field">
                <span>License number <em>Required</em></span>
                <input maxLength={60} required value={form.licenseNumber} onChange={(event) => updateField("licenseNumber", event.target.value)} />
                <small>Must match the verified owner record.</small>
              </label>
              <FormSelect label="Status" value={form.status} options={["Ready", "Needs review", "Closed"]} onChange={(value) => updateField("status", value)} />
            </div>
            <div className="owner-form-actions owner-profile-edit-actions">
              <div className="owner-profile-save-feedback" aria-live="polite">
                {message && <span className={`owner-success${saveError ? " owner-success--error" : ""}`}>{saveError ? null : <CheckCircle2 size={16} />} {message}</span>}
                {!message && <span>Changes apply to future registrations and jockey invitations.</span>}
              </div>
              <button className="owner-button" disabled={isSaving} type="button" onClick={resetProfileForm}>
                <RotateCcw size={16} /> Reset
              </button>
              <button className="owner-button owner-button--primary" disabled={isSaving} type="submit">
                <Save size={16} /> {isSaving ? "Saving..." : "Save profile"}
              </button>
            </div>
          </form>
        </article>
      </section>

    </div>
  );
}

export {
  OwnerHorseDetail,
  OwnerHorseForm,
  OwnerHorses,
  OwnerJockeys,
  OwnerProfile,
  OwnerRaceDetail,
  OwnerRegistrations,
  OwnerResults,
  OwnerSchedule,
};
