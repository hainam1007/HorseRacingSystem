import { AlertTriangle, CheckCircle2, Info, X } from "lucide-react";

const toneConfig = {
  success: { label: "Action complete", icon: CheckCircle2 },
  warning: { label: "Needs attention", icon: AlertTriangle },
  error: { label: "Action failed", icon: AlertTriangle },
  info: { label: "Workflow update", icon: Info },
};

function RefereeNotifications({ items, onDismiss }) {
  if (!items?.length) return null;

  return (
    <section className="referee-notification-stack" aria-live="polite">
      {items.map((item, index) => {
        const notice = typeof item === "string"
          ? { id: `legacy-${index}`, tone: "success", title: item }
          : item;
        const config = toneConfig[notice.tone] || toneConfig.info;
        const Icon = config.icon;

        return (
          <article className="referee-notification" data-tone={notice.tone} key={notice.id || index}>
            <span className="referee-notification__icon" aria-hidden="true">
              <Icon size={18} strokeWidth={2.2} />
            </span>
            <div className="referee-notification__content">
              <span className="referee-notification__label">{config.label}</span>
              <h3>{notice.title}</h3>
              {notice.detail && <p>{notice.detail}</p>}
            </div>
            {onDismiss && (
              <button
                className="referee-notification__dismiss"
                type="button"
                aria-label={`Dismiss ${notice.title}`}
                onClick={() => onDismiss(notice.id)}
              >
                <X size={16} strokeWidth={2} aria-hidden="true" />
              </button>
            )}
          </article>
        );
      })}
    </section>
  );
}

export default RefereeNotifications;
