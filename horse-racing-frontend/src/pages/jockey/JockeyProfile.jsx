import {
  Award,
  BadgeCheck,
  CalendarDays,
  Clock3,
  Home,
  Mail,
  MapPin,
  Phone,
  Trophy,
  UserRound,
  AlertTriangle,
  CheckCircle2,
  Edit3,
} from "lucide-react";
import { useEffect, useState } from "react";
import LoadingSkeleton from "../../components/LoadingSkeleton.jsx";
import {
  jockeyPortraits,
} from "./jockeyData";
import { useJockeyApiData } from "./useJockeyApiData";

const statusClass = (status) => {
  if (["Accepted", "Confirmed", "Published", "Available"].includes(status)) {
    return "jockey-badge--green";
  }
  if (["Rejected", "Expired"].includes(status)) {
    return "jockey-badge--muted";
  }
  return "jockey-badge--amber";
};

function JockeyProfile() {
  const { assignments, error, isLoading, profile, results, schedule, updateProfile, violations } = useJockeyApiData();
  const [form, setForm] = useState({ height: "", weight: "", experienceYears: "", licenseNumber: "" });
  const [saveMessage, setSaveMessage] = useState("");
  const [isSaveError, setIsSaveError] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const nextRace = schedule[0];
  const latestResult = results[0];
  const confirmedAssignments = assignments.filter((assignment) => assignment.status === "Accepted").length;
  const activityItems = [
    ...assignments.slice(0, 3).map((assignment) => ({
      title: `${assignment.horse} is ${assignment.status.toLowerCase()}.`,
      meta: assignment.race,
    })),
    ...(latestResult ? [{
      title: `${latestResult.race} result was published.`,
      meta: latestResult.prize,
    }] : []),
    ...(nextRace ? [{
      title: `${nextRace.race} is on your schedule.`,
      meta: nextRace.time,
    }] : []),
  ].slice(0, 4);

  useEffect(() => {
    setForm({
      height: profile.height,
      weight: profile.weight,
      experienceYears: profile.experienceYears,
      licenseNumber: profile.licenseNumber,
    });
  }, [profile.experienceYears, profile.height, profile.licenseNumber, profile.weight]);

  const updateField = (field, value) => {
    setSaveMessage("");
    setIsSaveError(false);
    setForm((current) => ({ ...current, [field]: value }));
  };

  const handleProfileSubmit = async (event) => {
    event.preventDefault();
    setSaveMessage("");
    setIsSaveError(false);
    setIsSaving(true);

    try {
      await updateProfile({
        height: Number(form.height),
        weight_kg: Number(form.weight),
        experience_years: Number(form.experienceYears),
        license_number: form.licenseNumber.trim(),
      });
      setSaveMessage("Athlete profile saved to API.");
    } catch (apiError) {
      setIsSaveError(true);
      setSaveMessage(apiError.message || "Unable to save jockey profile.");
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return <div className="jockey-profile-page"><LoadingSkeleton ariaLabel="Loading jockey profile" variant="detail" /></div>;
  }

  return (
    <div className="jockey-profile-page">
      {error && (
        <div className={`jockey-sync-note ${error ? "jockey-sync-note--warning" : ""}`}>
          {error}
        </div>
      )}
      <section className="jockey-profile-hero">
        <div className="jockey-profile-hero__portrait">
          <img src={jockeyPortraits[0]} alt={`${profile.name} jockey portrait`} />
          <span className={`jockey-badge ${statusClass(profile.status)}`}><BadgeCheck size={14} /> {profile.status}</span>
        </div>

        <div className="jockey-profile-hero__copy">
          <p className="jockey-kicker">Athlete profile</p>
          <h1>{profile.name}</h1>
          <p>{profile.license} riding in the {profile.weightClass}, connected with {profile.stableConnection} for the current season.</p>
          <div className="jockey-profile-hero__tags">
            <span><UserRound size={14} /> {profile.id}</span>
            <span><MapPin size={14} /> {profile.location}</span>
            <span><CalendarDays size={14} /> {profile.season}</span>
          </div>
        </div>

        <aside className="jockey-profile-hero__panel">
          <span className="jockey-kicker">Next availability</span>
          <strong>{profile.availability}</strong>
          <p>{nextRace ? `${nextRace.race} / ${nextRace.horse}` : "No scheduled race"}</p>
        </aside>
      </section>

      <section className="jockey-profile-stats" aria-label="Jockey profile performance summary">
        {[
          { label: "Win rate", value: profile.winRate, note: "Season form", icon: Trophy },
          { label: "Podium rate", value: profile.podiumRate, note: "Top-three pace", icon: Award },
          { label: "Earnings", value: profile.earnings, note: "Published purse", icon: BadgeCheck },
          { label: "Confirmed", value: confirmedAssignments, note: "Horse pairings", icon: Home },
        ].map((item) => {
          const Icon = item.icon;
          return (
            <article className="jockey-profile-stat" key={item.label}>
              <Icon size={18} />
              <span>{item.label}</span>
              <strong>{item.value}</strong>
              <small>{item.note}</small>
            </article>
          );
        })}
      </section>

      <section className="jockey-profile-layout">
        <article className="jockey-profile-card jockey-profile-contact">
          <div className="jockey-profile-card__header">
            <div>
              <span className="jockey-kicker">Contact</span>
              <h2>Rider details</h2>
            </div>
            <UserRound size={20} />
          </div>

          <div className="jockey-profile-detail-list">
            <div><Mail size={16} /><span>Email</span><strong>{profile.email}</strong></div>
            <div><Phone size={16} /><span>Phone</span><strong>{profile.phone}</strong></div>
            <div><MapPin size={16} /><span>Base</span><strong>{profile.location}</strong></div>
            <div><Home size={16} /><span>Stable</span><strong>{profile.stableConnection}</strong></div>
          </div>
        </article>

        <article className="jockey-profile-card jockey-profile-license">
          <div className="jockey-profile-card__header">
            <div>
              <span className="jockey-kicker">License and form</span>
              <h2>Race credentials</h2>
            </div>
            <BadgeCheck size={20} />
          </div>

          <div className="jockey-profile-license__grid">
            <div><span>License</span><strong>{profile.license}</strong></div>
            <div><span>Weight class</span><strong>{profile.weightClass}</strong></div>
            <div><span>Season</span><strong>{profile.season}</strong></div>
            <div><span>Status</span><strong>{profile.status}</strong></div>
          </div>
        </article>

        <article className="jockey-profile-card jockey-profile-next">
          <div className="jockey-profile-card__header">
            <div>
              <span className="jockey-kicker">Next race</span>
              <h2>{nextRace?.race || "No scheduled race"}</h2>
            </div>
            {nextRace && <span className={`jockey-badge ${statusClass(nextRace.status)}`}>{nextRace.status}</span>}
          </div>

          {nextRace ? (
            <div className="jockey-profile-next__body">
              <div className="jockey-date-block">
                <span>{nextRace.time.split(", ")[0]}</span>
                <strong>{nextRace.time.split(", ")[1] || "TBA"}</strong>
              </div>
              <div>
                <strong>{nextRace.horse}</strong>
                <span>{nextRace.tournament} / {nextRace.round}</span>
                <small><MapPin size={13} /> {nextRace.venue}</small>
              </div>
            </div>
          ) : (
            <div className="jockey-profile-empty">Accepted assignments will create your next race card.</div>
          )}
        </article>

        <article className="jockey-profile-card jockey-profile-result">
          <div className="jockey-profile-card__header">
            <div>
              <span className="jockey-kicker">Latest result</span>
              <h2>{latestResult?.race || "No published result"}</h2>
            </div>
            <Trophy size={20} />
          </div>

          {latestResult ? (
            <div className="jockey-profile-result__metrics">
              <div><span>Finish</span><strong>#{latestResult.position}</strong></div>
              <div><span>Time</span><strong>{latestResult.time}</strong></div>
              <div><span>Prize</span><strong>{latestResult.prize}</strong></div>
            </div>
          ) : (
            <div className="jockey-profile-empty">Results will appear after race publication.</div>
          )}
        </article>

        <article className="jockey-profile-card jockey-profile-activity">
          <div className="jockey-profile-card__header">
            <div>
              <span className="jockey-kicker">Activity</span>
              <h2>Profile notifications</h2>
            </div>
            <Clock3 size={20} />
          </div>

          <div className="jockey-profile-activity__list">
            {activityItems.map((item, index) => (
              <div className="jockey-profile-activity__item" key={`${item.title}-${index}`}>
                <span>{index + 1}</span>
                <div>
                  <strong>{item.title}</strong>
                  <small>{item.meta}</small>
                </div>
              </div>
            ))}
            {!activityItems.length && <div className="jockey-profile-empty">No current profile activity.</div>}
          </div>
        </article>

        <article className="jockey-profile-card jockey-profile-edit">
          <div className="jockey-profile-card__header">
            <div>
              <span className="jockey-kicker">Athlete settings</span>
              <h2>Update racing profile</h2>
            </div>
            <Edit3 size={20} />
          </div>

          <form className="jockey-profile-form" onSubmit={handleProfileSubmit}>
            <label>Height (cm)<input min="1" type="number" value={form.height} onChange={(event) => updateField("height", event.target.value)} required /></label>
            <label>Weight (kg)<input min="30" max="100" step="0.1" type="number" value={form.weight} onChange={(event) => updateField("weight", event.target.value)} required /></label>
            <label>Experience (years)<input min="0" type="number" value={form.experienceYears} onChange={(event) => updateField("experienceYears", event.target.value)} required /></label>
            <label>License number<input value={form.licenseNumber} onChange={(event) => updateField("licenseNumber", event.target.value)} required /></label>
            <div className="jockey-profile-form__actions">
              {saveMessage && <span className={isSaveError ? "jockey-form-message jockey-form-message--error" : "jockey-form-message"}>{!isSaveError && <CheckCircle2 size={16} />}{saveMessage}</span>}
              <button className="jockey-button jockey-button--primary" disabled={isSaving} type="submit">{isSaving ? "Saving..." : "Save Profile"}</button>
            </div>
          </form>
        </article>

        <article className="jockey-profile-card jockey-profile-violations">
          <div className="jockey-profile-card__header">
            <div>
              <span className="jockey-kicker">Race conduct</span>
              <h2>Recorded violations</h2>
            </div>
            <AlertTriangle size={20} />
          </div>

          <div className="jockey-violation-list">
            {violations.map((violation) => (
              <div className="jockey-violation-item" key={violation.id}>
                <div className="jockey-violation-item__header">
                  <div><strong>{violation.type}</strong><small>{violation.date} / {violation.race}</small></div>
                  <span className="jockey-badge jockey-badge--amber">{violation.status}</span>
                </div>
                <p>{violation.description}</p>
                <div className="jockey-violation-item__meta">
                  <span>Horse <strong>{violation.horse}</strong></span>
                  <span>Penalty <strong>{violation.penalty}</strong></span>
                  <span>Referee <strong>{violation.referee}</strong></span>
                </div>
              </div>
            ))}
            {!violations.length && <div className="jockey-profile-empty">No recorded violations.</div>}
          </div>
        </article>
      </section>
    </div>
  );
}

export default JockeyProfile;
