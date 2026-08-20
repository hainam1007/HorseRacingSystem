import { useMemo, useState } from "react";
import {
  CalendarDays,
  CheckCircle2,
  Clock3,
  FileText,
  Link as LinkIcon,
  MapPin,
  Send,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import LoadingSkeleton from "../../components/LoadingSkeleton.jsx";
import {
  horseJockeyImages,
  jockeyActionImages,
} from "./jockeyData";
import { useJockeyApiData } from "./useJockeyApiData";

const statusClass = (status) => {
  if (["Accepted", "Standby confirmed", "Confirmed", "Published", "Available"].includes(status)) {
    return "jockey-badge--green";
  }
  if (["Rejected", "Expired", "Meeting rejected", "Appointment rejected", "Terms rejected", "Contract rejected", "Cancelled"].includes(status)) {
    return "jockey-badge--muted";
  }
  return "jockey-badge--amber";
};

const getStageCopy = (rawStatus, isBackup = false) => ({
  meeting_invited: isBackup
    ? "Review the standby appointment details and respond to the owner's backup invitation."
    : "Review the offline appointment details and respond to the owner's invitation.",
  meeting_accepted: isBackup
    ? "Standby appointment accepted. The owner will send standby terms for your confirmation."
    : "Appointment accepted. The owner will send terms for your confirmation before the contract.",
  terms_pending_confirmation: "Review the terms below. Confirm them before the owner can send the contract.",
  standby_terms_pending_confirmation: "Review the standby terms. Confirming them activates your backup availability.",
  standby_confirmed: "Standby agreement confirmed. You remain available unless both parties agree to end it.",
  terms_agreed: "You confirmed the terms. The owner can now send the contract.",
  terms_rejected: "You requested changes to the terms. Wait for the owner to resend them.",
  contract_uploaded: isBackup
    ? "Review the terms and contract. Confirming accepts the standby assignment or promoted primary contract."
    : "Review the terms and contract. Confirming the contract accepts the assignment.",
  accepted: isBackup ? "Standby assignment accepted. You are available if the primary jockey is replaced." : "Assignment accepted. This horse and race are now confirmed in your plan.",
  replaced: "This assignment was replaced by another jockey assignment.",
  meeting_rejected: "You declined this appointment invitation.",
  contract_rejected: "You rejected this contract. The assignment is not accepted.",
  cancelled: "This assignment has ended. Review the audit note for details.",
}[rawStatus] || "Track this assignment through its appointment and contract stages.");

const getStatusGroup = (rawStatus) => ({
  meeting_invited: "Appointment",
  meeting_accepted: "Appointment",
  terms_pending_confirmation: "Terms",
  standby_terms_pending_confirmation: "Terms",
  standby_confirmed: "Accepted",
  terms_agreed: "Terms",
  terms_rejected: "Terms",
  contract_uploaded: "Contract",
  accepted: "Accepted",
}[rawStatus] || "Closed");

function JockeyInvitations() {
  const [filter, setFilter] = useState("All");
  const [actionError, setActionError] = useState("");
  const [activeActionId, setActiveActionId] = useState("");
  const [cancellationDrafts, setCancellationDrafts] = useState({});
  const {
    error,
    invitations,
    isLoading,
    requestCancellation,
    respondToCancellation,
    respondToContract,
    respondToMeeting,
    respondToTerms,
    withdrawAssignment,
  } = useJockeyApiData();

  const visibleInvitations = useMemo(
    () => invitations.filter((invite) => filter === "All" || getStatusGroup(invite.rawStatus) === filter),
    [filter, invitations]
  );

  const pendingCount = invitations.filter((invite) => invite.rawStatus === "meeting_invited").length;
  const acceptedCount = invitations.filter((invite) => ["accepted", "standby_confirmed"].includes(invite.rawStatus)).length;
  const reviewCount = invitations.filter((invite) => ["terms_pending_confirmation", "standby_terms_pending_confirmation", "contract_uploaded"].includes(invite.rawStatus)).length;
  const featuredInvite = invitations.find((invite) => invite.rawStatus === "meeting_invited") ?? invitations[0];
  const filterCounts = useMemo(() => ["All", "Appointment", "Terms", "Contract", "Accepted", "Closed"].reduce((counts, item) => {
    counts[item] = item === "All"
      ? invitations.length
      : invitations.filter((invite) => getStatusGroup(invite.rawStatus) === item).length;
    return counts;
  }, {}), [invitations]);

  const updateInvitation = async (id, action) => {
    setActionError("");
    setActiveActionId(id);

    try {
      if (action === "accept-appointment" || action === "reject-appointment") {
        await respondToMeeting(id, action === "accept-appointment");
      } else if (action === "confirm-terms" || action === "reject-terms") {
        await respondToTerms(id, action === "confirm-terms");
      } else {
        await respondToContract(id, action === "confirm-contract");
      }
    } catch (apiError) {
      setActionError(apiError.message || "Unable to update this invitation.");
    } finally {
      setActiveActionId("");
    }
  };

  const updateCancellationDraft = (id, field, value) => {
    setActionError("");
    setCancellationDrafts((current) => ({
      ...current,
      [id]: { ...current[id], [field]: value },
    }));
  };

  const submitCancellationRequest = async (invite) => {
    const reason = (cancellationDrafts[invite.id]?.reason || "").trim();

    if (!reason) {
      setActionError("Enter a reason for ending the primary jockey contract.");
      return;
    }

    setActiveActionId(invite.id);
    setActionError("");
    try {
      await requestCancellation(invite.id, reason);
    } catch (apiError) {
      setActionError(apiError.message || "Unable to request contract cancellation.");
    } finally {
      setActiveActionId("");
    }
  };

  const submitCancellationResponse = async (invite, decision) => {
    const responseMessage = (cancellationDrafts[invite.id]?.response || "").trim();
    setActiveActionId(invite.id);
    setActionError("");
    try {
      await respondToCancellation(invite.id, decision, responseMessage);
    } catch (apiError) {
      setActionError(apiError.message || "Unable to respond to this cancellation request.");
    } finally {
      setActiveActionId("");
    }
  };

  const submitWithdrawal = async (invite) => {
    const reason = (cancellationDrafts[invite.id]?.withdrawReason || "").trim();

    if (!reason) {
      setActionError("Enter a reason for withdrawing from this assignment.");
      return;
    }

    setActiveActionId(invite.id);
    setActionError("");
    try {
      await withdrawAssignment(invite.id, reason);
    } catch (apiError) {
      setActionError(apiError.message || "Unable to withdraw from this assignment.");
    } finally {
      setActiveActionId("");
    }
  };

  if (isLoading) {
    return <div className="jockey-invitations-page"><LoadingSkeleton ariaLabel="Loading invitations" rows={4} variant="cards" /></div>;
  }

  return (
    <div className="jockey-invitations-page">
      {(error || actionError) && (
        <div className={`jockey-sync-note ${error || actionError ? "jockey-sync-note--warning" : ""}`}>
          {actionError || error}
        </div>
      )}
      <section className="jockey-invitations-hero">
        <img src={jockeyActionImages[2]} alt="Jockey riding during a race invitation decision" />
        <div className="jockey-invitations-hero__copy">
          <p className="jockey-kicker">Invitation room</p>
          <h1>Accept only the rides that fit race day.</h1>
          <p>Review the horse, meeting details, and race timing before you commit your availability.</p>
          <div className="jockey-invitations-hero__signals" aria-label="Invitation workflow">
            <span><b>01</b> Review the brief</span>
            <span><b>02</b> Meet the owner</span>
            <span><b>03</b> Lock the ride</span>
          </div>
        </div>
        <aside className="jockey-invitations-hero__panel">
          {featuredInvite ? (
            <>
              <span className="jockey-invitations-hero__panel-label">Next decision</span>
              <span className={`jockey-badge ${statusClass(featuredInvite.status)}`}>{featuredInvite.status}</span>
              <strong>{featuredInvite.horse}</strong>
              <p>{featuredInvite.assignmentTypeLabel} / {featuredInvite.race} / {featuredInvite.date}</p>
            </>
          ) : (
            <>
              <span className="jockey-badge jockey-badge--muted">Clear</span>
              <strong>No invitations</strong>
              <p>Owner requests will appear here when a horse is assigned to you.</p>
            </>
          )}
        </aside>
      </section>

      <section className="jockey-invitation-stats" aria-label="Invitation summary">
        {[
          { label: "Appointments", value: pendingCount, note: "Waiting for your response", icon: Send },
          { label: "Reviews", value: reviewCount, note: "Terms or contract to confirm", icon: FileText },
          { label: "Accepted", value: acceptedCount, note: "Added to race plan", icon: CheckCircle2 },
          { label: "Total invites", value: invitations.length, note: "Owner requests", icon: CalendarDays },
        ].map((item) => {
          const Icon = item.icon;
          return (
            <article className="jockey-invitation-stat" key={item.label}>
              <Icon size={18} />
              <span>{item.label}</span>
              <strong>{item.value}</strong>
              <small>{item.note}</small>
            </article>
          );
        })}
      </section>

      <section className="jockey-invitation-board">
        <div className="jockey-invitation-board__header">
          <div className="jockey-invitation-board__heading">
            <div>
              <span className="jockey-kicker">Decision board</span>
              <h2>{filter === "All" ? "All invitations" : `${filter} invitations`}</h2>
            </div>
            <span className="jockey-invitation-board__result-count">
              <i aria-hidden="true" /> {visibleInvitations.length} {visibleInvitations.length === 1 ? "invitation" : "invitations"} in view
            </span>
          </div>
          <div className="jockey-segmented" aria-label="Filter invitations by stage" role="group">
            {["All", "Appointment", "Terms", "Contract", "Accepted", "Closed"].map((item) => (
              <button
                aria-pressed={filter === item}
                className={filter === item ? "jockey-segmented__active" : ""}
                key={item}
                onClick={() => setFilter(item)}
                type="button"
              >
                <span>{item}</span><small>{filterCounts[item]}</small>
              </button>
            ))}
          </div>
        </div>

        <div className="jockey-invitation-list">
          {visibleInvitations.map((invite, index) => (
            <article className="jockey-invitation-card" data-state={getStatusGroup(invite.rawStatus).toLowerCase()} key={invite.id}>
              <div className="jockey-invitation-card__media">
                <img src={horseJockeyImages[index % horseJockeyImages.length]} alt={`${invite.horse} invitation pairing`} />
                <span className={`jockey-badge ${statusClass(invite.status)}`}>{invite.status}</span>
              </div>

              <div className="jockey-invitation-card__body">
                <div className="jockey-invitation-card__title">
                  <div>
                    <span className="jockey-kicker">{invite.id}</span>
                    <h3>{invite.horse}</h3>
                  </div>
                  <div className="jockey-invitation-card__owner">
                    <span>Owner</span>
                    <strong>{invite.owner}</strong>
                  </div>
                </div>

                <p>{invite.note}</p>
                <span className="jockey-badge">{invite.assignmentTypeLabel}</span>

                <div className="jockey-invitation-stage" role="status">
                  <span className="jockey-invitation-stage__icon"><ShieldCheck size={17} /></span>
                  <div>
                    <span className="jockey-invitation-stage__label">Next step</span>
                    <p>{getStageCopy(invite.rawStatus, invite.isBackup)}</p>
                  </div>
                </div>

                <div className="jockey-invitation-meta">
                  <div><span>Race</span><strong>{invite.race}</strong></div>
                  <div><span>Tournament</span><strong>{invite.tournament}</strong></div>
                  <div><span><Clock3 size={13} /> Time</span><strong>{invite.date}</strong></div>
                  <div><span><MapPin size={13} /> Venue</span><strong>{invite.venue}</strong></div>
                  <div><span>Role</span><strong>{invite.assignmentTypeLabel}{invite.backupPriority ? ` #${invite.backupPriority}` : ""}</strong></div>
                  <div><span><Clock3 size={13} /> Appointment</span><strong>{invite.meetingTime || "Pending"}</strong></div>
                  <div><span><MapPin size={13} /> Location</span><strong>{invite.locationName || invite.venue || "Pending"}</strong></div>
                  {!invite.isBackup && <div><span><FileText size={13} /> Contract</span><strong>{invite.contractFileName || (invite.rawStatus === "contract_uploaded" ? "Contract sent" : "Contract pending")}</strong></div>}
                </div>

                <div className="jockey-invitation-review">
                  <div>
                    <span><MapPin size={13} /> Offline appointment</span>
                    <strong>{[invite.address, invite.ward, invite.district, invite.city].filter(Boolean).join(", ") || "Address pending"}</strong>
                    {invite.mapUrl && <a href={invite.mapUrl} rel="noreferrer" target="_blank"><LinkIcon size={13} /> Open map</a>}
                    {(invite.contactName || invite.contactPhone) && <small>{[invite.contactName, invite.contactPhone].filter(Boolean).join(" / ")}</small>}
                  </div>
                  {!invite.isBackup && <div>
                    <span><FileText size={13} /> Contract from owner</span>
                    {invite.contractUrl ? <a href={invite.contractUrl} download={invite.contractFileName || undefined} rel="noreferrer" target="_blank">{invite.contractFileName || "Open sent contract"}</a> : <strong>{invite.contractFileName || (invite.rawStatus === "contract_uploaded" ? "Contract sent" : "Contract link pending")}</strong>}
                    {invite.contractNote && <small>{invite.contractNote}</small>}
                  </div>}
                </div>

                {invite.terms && (
                  <div className="jockey-invitation-terms">
                    <span><FileText size={14} /> Terms from owner</span>
                    <p>{invite.terms}</p>
                    {invite.meetingNote && <small>{invite.meetingNote}</small>}
                  </div>
                )}

                {invite.actionsLocked && !["cancelled", "replaced"].includes(invite.rawStatus) && (
                  <div className="jockey-cancellation-panel" role="status">
                    <strong>Assignment changes are closed</strong>
                    <p>The race has started or closed, so this assignment can no longer be changed.</p>
                  </div>
                )}

                {invite.rawStatus === "cancelled" && (
                  <div className="jockey-cancellation-panel" role="status">
                    <strong>{invite.withdrawal?.reason ? "Negotiation withdrawn" : invite.cancellationRequest?.status === "approved" ? "Agreement ended by mutual confirmation" : "Assignment cancelled"}</strong>
                    {invite.withdrawal?.reason && (
                      <p>{invite.withdrawal.initiated_by_party === "jockey" ? "You" : "The horse owner"} withdrew: {invite.withdrawal.reason}</p>
                    )}
                    {!invite.withdrawal?.reason && invite.cancellationRequest?.reason && (
                      <p>Requested by {invite.cancellationRequest.initiated_by_party === "jockey" ? "jockey" : "horse owner"}: {invite.cancellationRequest.reason}</p>
                    )}
                  </div>
                )}

                {!invite.actionsLocked && ["accepted", "standby_confirmed"].includes(invite.rawStatus) && (() => {
                  const cancellationRequest = invite.cancellationRequest;
                  const cancellationPending = cancellationRequest?.status === "pending";
                  const jockeyRequestedCancellation = cancellationRequest?.initiated_by_party === "jockey";
                  const draft = cancellationDrafts[invite.id] || {};

                  if (cancellationPending && jockeyRequestedCancellation) {
                    return (
                      <div className="jockey-cancellation-panel" role="status">
                        <strong>Waiting for owner confirmation</strong>
                        <p>{cancellationRequest.reason}</p>
                        <small>Your {invite.isBackup ? "standby agreement" : "primary contract"} remains active until the owner agrees.</small>
                      </div>
                    );
                  }

                  if (cancellationPending) {
                    return (
                      <div className="jockey-cancellation-panel">
                        <strong>Owner requested {invite.isBackup ? "standby agreement" : "primary contract"} cancellation</strong>
                        <p>{cancellationRequest.reason}</p>
                        <label>
                          <span>Response note <small>Optional</small></span>
                          <textarea
                            maxLength={1000}
                            value={draft.response || ""}
                            onChange={(event) => updateCancellationDraft(invite.id, "response", event.target.value)}
                            placeholder="Record your response for the cancellation audit."
                          />
                        </label>
                        <div className="jockey-invitation-card__actions">
                          <button className="jockey-button" disabled={activeActionId === invite.id} onClick={() => submitCancellationResponse(invite, "reject")} type="button">
                            Keep agreement
                          </button>
                          <button className="jockey-button jockey-button--danger" disabled={activeActionId === invite.id} onClick={() => submitCancellationResponse(invite, "approve")} type="button">
                            {activeActionId === invite.id ? "Updating..." : "Agree to end contract"}
                          </button>
                        </div>
                      </div>
                    );
                  }

                  return (
                    <div className="jockey-cancellation-panel">
                      {cancellationRequest?.status === "rejected" && <small>Previous cancellation request was declined. The agreement remains active.</small>}
                      <label>
                          <span>Reason for ending {invite.isBackup ? "standby agreement" : "contract"} <small>Required</small></span>
                        <textarea
                          maxLength={1000}
                          value={draft.reason || ""}
                          onChange={(event) => updateCancellationDraft(invite.id, "reason", event.target.value)}
                          placeholder={`Explain why you are asking the owner to end this ${invite.isBackup ? "standby agreement" : "primary contract"}.`}
                        />
                      </label>
                      <div className="jockey-invitation-card__actions">
                        <button className="jockey-button jockey-button--danger" disabled={activeActionId === invite.id} onClick={() => submitCancellationRequest(invite)} type="button">
                          {activeActionId === invite.id ? "Sending request..." : "Request mutual cancellation"}
                        </button>
                      </div>
                    </div>
                  );
                })()}

                {!invite.actionsLocked && ["meeting_accepted", "terms_pending_confirmation", "standby_terms_pending_confirmation", "terms_agreed", "terms_rejected", "contract_uploaded"].includes(invite.rawStatus) && (
                  <div className="jockey-cancellation-panel">
                    <label>
                      <span>Reason for withdrawing <small>Required</small></span>
                      <textarea
                        maxLength={1000}
                        value={cancellationDrafts[invite.id]?.withdrawReason || ""}
                        onChange={(event) => updateCancellationDraft(invite.id, "withdrawReason", event.target.value)}
                        placeholder="Explain why you cannot continue this negotiation."
                      />
                    </label>
                    <div className="jockey-invitation-card__actions">
                      <button className="jockey-button jockey-button--danger" disabled={activeActionId === invite.id} onClick={() => submitWithdrawal(invite)} type="button">
                        {activeActionId === invite.id ? "Withdrawing..." : "Withdraw from negotiation"}
                      </button>
                    </div>
                  </div>
                )}

                <div className="jockey-invitation-card__actions">
                  {!invite.actionsLocked && invite.rawStatus === "meeting_invited" && (
                    <>
                      <button className="jockey-button" disabled={activeActionId === invite.id} onClick={() => updateInvitation(invite.id, "reject-appointment")} type="button">
                        <XCircle size={17} /> {activeActionId === invite.id ? "Updating..." : "Decline appointment"}
                      </button>
                      <button className="jockey-button jockey-button--primary" disabled={activeActionId === invite.id} onClick={() => updateInvitation(invite.id, "accept-appointment")} type="button">
                        <ShieldCheck size={17} /> {activeActionId === invite.id ? "Updating..." : "Accept appointment"}
                      </button>
                    </>
                  )}
                  {!invite.actionsLocked && ["terms_pending_confirmation", "standby_terms_pending_confirmation"].includes(invite.rawStatus) && (
                    <>
                      <button className="jockey-button" disabled={activeActionId === invite.id} onClick={() => updateInvitation(invite.id, "reject-terms")} type="button">
                        <XCircle size={17} /> {activeActionId === invite.id ? "Updating..." : "Request changes"}
                      </button>
                      <button className="jockey-button jockey-button--primary" disabled={activeActionId === invite.id} onClick={() => updateInvitation(invite.id, "confirm-terms")} type="button">
                        <CheckCircle2 size={17} /> {activeActionId === invite.id ? "Updating..." : "Confirm terms"}
                      </button>
                    </>
                  )}
                  {!invite.actionsLocked && invite.rawStatus === "contract_uploaded" && !invite.isBackup && (
                    <>
                      <button className="jockey-button" disabled={activeActionId === invite.id} onClick={() => updateInvitation(invite.id, "reject-contract")} type="button">
                        <XCircle size={17} /> {activeActionId === invite.id ? "Updating..." : "Reject contract"}
                      </button>
                      <button className="jockey-button jockey-button--primary" disabled={activeActionId === invite.id} onClick={() => updateInvitation(invite.id, "confirm-contract")} type="button">
                        <CheckCircle2 size={17} /> {activeActionId === invite.id ? "Updating..." : "Confirm contract"}
                      </button>
                    </>
                  )}
                </div>
              </div>
            </article>
          ))}
        </div>

        {visibleInvitations.length === 0 && <div className="jockey-empty">No invitations match this filter.</div>}
      </section>
    </div>
  );
}

export default JockeyInvitations;
