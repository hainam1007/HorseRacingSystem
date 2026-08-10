import { AlertTriangle, Check, Minus, Plus, Scale } from "lucide-react";
import { useId } from "react";
import "./PenaltyDecisionEditor.css";

const PRIMARY_TYPES = [
  { value: "none", label: "No result adjustment", description: "Use only a supplemental suspension or fine." },
  { value: "warning", label: "Warning", description: "Record an official warning only." },
  { value: "time_penalty", label: "Time penalty", description: "Add seconds to the final race time." },
  { value: "position_demotion", label: "Position demotion", description: "Move the runner down the final order." },
  { value: "score_deduction", label: "Score deduction", description: "Deduct points from the final score." },
  { value: "disqualification", label: "Disqualification", description: "Remove the runner from the classified result." },
];

const NUMBER_FIELDS = {
  time_penalty: {
    field: "time_penalty_seconds",
    label: "Seconds",
    fallback: { min: 1, max: 60, step: 1 },
  },
  position_demotion: {
    field: "position_delta",
    label: "Positions",
    fallback: { min: 1, max: 10, step: 1 },
  },
  score_deduction: {
    field: "score_deduction",
    label: "Points",
    fallback: { min: 1, max: 100, step: 1 },
  },
};

const POLICY_FIELDS = [
  "type",
  "score_deduction",
  "position_delta",
  "time_penalty_seconds",
  "suspension_days",
  "fine_amount",
  "disqualified",
];

const asNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

export function normalizePenalty(penalty = {}) {
  return {
    type: penalty.type || "warning",
    score_deduction: asNumber(penalty.score_deduction),
    position_delta: asNumber(penalty.position_delta),
    time_penalty_seconds: asNumber(penalty.time_penalty_seconds),
    suspension_days: asNumber(penalty.suspension_days),
    fine_amount: asNumber(penalty.fine_amount),
    disqualified: penalty.type === "disqualification" || penalty.disqualified === true,
  };
}

export function penaltiesEqual(left, right) {
  const first = normalizePenalty(left);
  const second = normalizePenalty(right);
  return POLICY_FIELDS.every((field) => first[field] === second[field]);
}

export function buildPenaltyFromPolicy(policy) {
  return normalizePenalty(policy?.suggested_penalty || policy?.penalty || policy || {});
}

function adjustmentOf(policy) {
  return policy?.referee_adjustment || policy?.adjustment || {};
}

function isStepAligned(value, bounds) {
  const min = asNumber(bounds?.min);
  const step = asNumber(bounds?.step) || 1;
  const steps = (value - min) / step;
  return Math.abs(steps - Math.round(steps)) < 1e-9;
}

export function isPenaltyWithinRefereeBounds(policy, penalty) {
  const adjustment = adjustmentOf(policy);
  if (adjustment.allowed === false) return false;

  const value = normalizePenalty(penalty);
  const primaryTypes = adjustment.primary_types;
  if (Array.isArray(primaryTypes) && primaryTypes.length > 0 && !primaryTypes.includes(value.type)) {
    return false;
  }

  return Object.entries(adjustment.bounds || {}).every(([field, bounds]) => {
    const amount = asNumber(value[field]);
    if (!amount) return true;
    return amount >= asNumber(bounds.min) &&
      amount <= asNumber(bounds.max) &&
      isStepAligned(amount, bounds);
  });
}

function primaryTypeOf(penalty) {
  const type = normalizePenalty(penalty).type;
  if (["suspension", "fine"].includes(type)) return "none";
  return PRIMARY_TYPES.some((option) => option.value === type) ? type : "warning";
}

function describePenalty(penalty) {
  const value = normalizePenalty(penalty);
  const parts = [];
  if (value.type === "suspension") parts.push("Suspension");
  else if (value.type === "fine") parts.push("Fine");
  else parts.push(PRIMARY_TYPES.find((item) => item.value === primaryTypeOf(value))?.label || "Warning");
  if (value.time_penalty_seconds) parts.push(`+${value.time_penalty_seconds}s`);
  if (value.position_delta) parts.push(`-${value.position_delta} position(s)`);
  if (value.score_deduction) parts.push(`-${value.score_deduction} point(s)`);
  if (value.suspension_days) parts.push(`${value.suspension_days}-day suspension`);
  if (value.fine_amount) parts.push(`Fine ${value.fine_amount.toLocaleString()}`);
  return parts.join(" / ");
}

function clamp(value, bounds) {
  return Math.min(bounds.max, Math.max(bounds.min, value));
}

function snapToStep(value, bounds) {
  const clamped = clamp(value, bounds);
  const steps = Math.round((clamped - bounds.min) / bounds.step);
  return Number((bounds.min + steps * bounds.step).toFixed(6));
}

function NumberStepper({ label, value, bounds, onChange, disabled }) {
  const safeBounds = {
    min: Number.isFinite(Number(bounds?.min)) ? Number(bounds.min) : 0,
    max: Number.isFinite(Number(bounds?.max)) ? Number(bounds.max) : 999,
    step: Number.isFinite(Number(bounds?.step)) ? Number(bounds.step) : 1,
  };
  const amount = asNumber(value);
  const update = (next) => onChange(snapToStep(next, safeBounds));

  return (
    <div className="penalty-stepper">
      <span>{label}</span>
      <div className="penalty-stepper__control">
        <button
          type="button"
          onClick={() => update(amount - safeBounds.step)}
          disabled={disabled || amount <= safeBounds.min}
          aria-label={`Decrease ${label}`}
        >
          <Minus size={15} />
        </button>
        <input
          type="number"
          min={safeBounds.min}
          max={safeBounds.max}
          step={safeBounds.step}
          value={amount}
          onChange={(event) => update(asNumber(event.target.value))}
          disabled={disabled}
        />
        <button
          type="button"
          onClick={() => update(amount + safeBounds.step)}
          disabled={disabled || amount >= safeBounds.max}
          aria-label={`Increase ${label}`}
        >
          <Plus size={15} />
        </button>
      </div>
    </div>
  );
}

export default function PenaltyDecisionEditor({
  policy,
  value,
  onChange,
  deviationReason,
  onDeviationReasonChange,
  disabled = false,
  reviewer = "referee",
}) {
  const reasonInputId = useId();
  const suggested = buildPenaltyFromPolicy(policy);
  const current = normalizePenalty(value || suggested);
  const differs = !penaltiesEqual(current, suggested);
  const withinBounds = reviewer === "admin" || isPenaltyWithinRefereeBounds(policy, current);
  const adjustment = adjustmentOf(policy);
  const refereeReadOnly = reviewer !== "admin" && adjustment.allowed !== true;
  const allowedPrimaryTypes = reviewer === "admin"
    ? PRIMARY_TYPES.map((option) => option.value)
    : adjustment.primary_types || [];
  const canChooseNone = reviewer === "admin" ||
    allowedPrimaryTypes.includes("suspension") ||
    allowedPrimaryTypes.includes("fine");

  const update = (patch) => onChange?.(normalizePenalty({ ...current, ...patch }));
  const choosePrimary = (type) => {
    const resolvedType = type === "none"
      ? current.suspension_days > 0
        ? "suspension"
        : current.fine_amount > 0
          ? "fine"
          : "warning"
      : type;
    update({
      type: resolvedType,
      disqualified: resolvedType === "disqualification",
      time_penalty_seconds: type === "time_penalty" ? Math.max(current.time_penalty_seconds, 1) : 0,
      position_delta: type === "position_demotion" ? Math.max(current.position_delta, 1) : 0,
      score_deduction: type === "score_deduction" ? Math.max(current.score_deduction, 1) : 0,
    });
  };

  const numeric = NUMBER_FIELDS[primaryTypeOf(current)];
  const numericBounds = numeric
    ? adjustment.bounds?.[numeric.field] || numeric.fallback
    : null;
  const suspensionBounds = adjustment.bounds?.suspension_days || { min: 1, max: 30, step: 1 };
  const fineBounds = adjustment.bounds?.fine_amount || { min: 1, max: 10000000, step: 100000 };

  return (
    <section className="penalty-editor" aria-label="Penalty decision">
      <div className="penalty-editor__comparison">
        <div>
          <span className="penalty-editor__eyebrow">System recommendation</span>
          <strong>{describePenalty(suggested)}</strong>
          <small>{policy?.reason || policy?.suggested_penalty?.note || "Based on violation type and severity."}</small>
        </div>
        <Scale size={20} aria-hidden="true" />
        <div>
          <span className="penalty-editor__eyebrow">{reviewer === "admin" ? "Administrative decision" : "Referee decision"}</span>
          <strong>{describePenalty(current)}</strong>
          <small>{differs ? "Different from policy" : "Matches policy"}</small>
        </div>
      </div>

      <fieldset className="penalty-editor__choices" disabled={disabled}>
        <legend>Primary sanction</legend>
        {PRIMARY_TYPES.map((option) => {
          const optionAllowed = option.value === "none"
            ? canChooseNone
            : allowedPrimaryTypes.includes(option.value);
          const optionDisabled = disabled || refereeReadOnly || !optionAllowed;
          return (
          <label
            className={`penalty-choice${optionDisabled ? " penalty-choice--disabled" : ""}`}
            key={option.value}
            title={!optionAllowed && reviewer !== "admin" ? "This sanction is not available for this severity." : undefined}
          >
            <input
              type="radio"
              name="primary-penalty"
              value={option.value}
              checked={primaryTypeOf(current) === option.value}
              onChange={() => choosePrimary(option.value)}
              disabled={optionDisabled}
            />
            <span className="penalty-choice__mark"><Check size={13} /></span>
            <span>
              <strong>{option.label}</strong>
              <small>{option.description}</small>
            </span>
          </label>
          );
        })}
      </fieldset>

      {numeric && (
        <NumberStepper
          label={numeric.label}
          value={current[numeric.field]}
          bounds={numericBounds}
          onChange={(amount) => update({ [numeric.field]: amount })}
          disabled={disabled || refereeReadOnly}
        />
      )}

      <fieldset className="penalty-editor__supplemental" disabled={disabled || refereeReadOnly}>
        <legend>Supplemental sanctions</legend>
        <label>
          <input
            type="checkbox"
            checked={current.suspension_days > 0}
            onChange={(event) => {
              const enabled = event.target.checked;
              update({
                suspension_days: enabled ? Math.max(current.suspension_days, 1) : 0,
                type: primaryTypeOf(current) === "none"
                  ? enabled
                    ? "suspension"
                    : current.fine_amount > 0
                      ? "fine"
                      : "warning"
                  : current.type,
              });
            }}
          />
          Jockey suspension
        </label>
        {current.suspension_days > 0 && (
          <NumberStepper
            label="Days"
            value={current.suspension_days}
            bounds={suspensionBounds}
            onChange={(amount) => update({ suspension_days: amount })}
            disabled={disabled}
          />
        )}
        <label>
          <input
            type="checkbox"
            checked={current.fine_amount > 0}
            onChange={(event) => {
              const enabled = event.target.checked;
              update({
                fine_amount: enabled ? Math.max(current.fine_amount, fineBounds.min) : 0,
                type: primaryTypeOf(current) === "none"
                  ? enabled
                    ? "fine"
                    : current.suspension_days > 0
                      ? "suspension"
                      : "warning"
                  : current.type,
              });
            }}
          />
          Monetary fine
        </label>
        {current.fine_amount > 0 && (
          <NumberStepper
            label="Amount"
            value={current.fine_amount}
            bounds={fineBounds}
            onChange={(amount) => update({ fine_amount: amount })}
            disabled={disabled}
          />
        )}
      </fieldset>

      {differs && (
        <div className="penalty-editor__reason">
          <div className="penalty-editor__reason-heading">
            <label className="penalty-editor__reason-label" htmlFor={reasonInputId}>
              <span>Reason for policy deviation</span>
              <b aria-hidden="true">*</b>
            </label>
            <span className="penalty-editor__reason-status">Required for audit</span>
          </div>
          <textarea
            id={reasonInputId}
            rows="3"
            value={deviationReason || ""}
            onChange={(event) => onDeviationReasonChange?.(event.target.value)}
            disabled={disabled || refereeReadOnly}
            required
            placeholder="Explain the race context and evidence behind this adjustment..."
          />
          <p className="penalty-editor__reason-helper">
            Briefly explain why the selected sanction differs from the system recommendation.
          </p>
        </div>
      )}

      {!withinBounds && reviewer !== "admin" && (
        <div className="penalty-editor__review" role="status">
          <AlertTriangle size={18} />
          <span>Adjust the selected values so they remain within the allowed range for this severity.</span>
        </div>
      )}
    </section>
  );
}
