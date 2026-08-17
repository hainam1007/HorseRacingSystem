import { useEffect, useState } from "react";
import { CheckCircle2, MailCheck } from "lucide-react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { authApi } from "../api/authApi";

const RESEND_COOLDOWN_SECONDS = 60;

function normalizeOtp(value) {
  return String(value || "").replace(/\D/g, "").slice(0, 6);
}

function maskEmail(email) {
  const [localPart, domain] = String(email || "").split("@");

  if (!localPart || !domain) return email;

  return `${localPart.slice(0, 2)}${"*".repeat(Math.max(2, localPart.length - 2))}@${domain}`;
}

function VerifyAccount() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const email = searchParams.get("email") || location.state?.email || "";
  const [otp, setOtp] = useState("");
  const [message, setMessage] = useState(location.state?.notice || "");
  const [isError, setIsError] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [resendSeconds, setResendSeconds] = useState(location.state?.requested ? RESEND_COOLDOWN_SECONDS : 0);

  useEffect(() => {
    if (resendSeconds <= 0) return undefined;

    const timer = window.setTimeout(() => {
      setResendSeconds((seconds) => Math.max(0, seconds - 1));
    }, 1000);

    return () => window.clearTimeout(timer);
  }, [resendSeconds]);

  const updateOtp = (value) => {
    setOtp(normalizeOtp(value));
    setMessage("");
    setIsError(false);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (otp.length !== 6) {
      setIsError(true);
      setMessage("Enter the six-digit verification code.");
      return;
    }

    setIsSubmitting(true);
    setMessage("");
    setIsError(false);

    try {
      await authApi.verifyAccount(otp);
      navigate("/login", {
        replace: true,
        state: {
          email,
          notice: "Account verified. Sign in to continue.",
        },
      });
    } catch (apiError) {
      setIsError(true);
      setMessage(apiError.message || "Unable to verify this account.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResend = async () => {
    if (!email || resendSeconds > 0 || isResending) return;

    setIsResending(true);
    setMessage("");
    setIsError(false);

    try {
      await authApi.resendVerification(email);
      setResendSeconds(RESEND_COOLDOWN_SECONDS);
      setMessage("A new verification code has been requested.");
    } catch (apiError) {
      setIsError(true);
      setMessage(apiError.message || "Unable to request a new verification code.");
    } finally {
      setIsResending(false);
    }
  };

  if (!email) {
    return (
      <main className="auth-recovery" aria-label="Verify account">
        <section className="auth-recovery__panel auth-recovery__panel--compact">
          <Link className="auth-recovery__brand brand" to="/" aria-label="Horse racing home">
            <img className="brand-mark" src="/images/horse-logo.png" alt="" />
            <span className="brand-text"><strong>horse</strong><span>racing</span></span>
          </Link>
          <div className="auth-recovery__icon"><MailCheck size={24} /></div>
          <h1 className="auth-recovery__title">Choose an account</h1>
          <p className="auth-recovery__description">Enter your email first so we can send a verification code.</p>
          <Link className="login-page__submit auth-recovery__primary-link" to="/resend-verification">Enter email</Link>
          <div className="auth-recovery__links"><Link className="login-page__link" to="/login">Back to login</Link></div>
        </section>
      </main>
    );
  }

  return (
    <main className="auth-recovery" aria-label="Verify account">
      <section className="auth-recovery__panel auth-recovery__panel--compact">
        <Link className="auth-recovery__brand brand" to="/" aria-label="Horse racing home">
          <img className="brand-mark" src="/images/horse-logo.png" alt="" />
          <span className="brand-text"><strong>horse</strong><span>racing</span></span>
        </Link>

        <div className="auth-recovery__icon"><MailCheck size={24} /></div>
        <p className="login-page__eyebrow">EMAIL VERIFICATION</p>
        <h1 className="auth-recovery__title">Check your inbox</h1>
        <p className="auth-recovery__description">
          Enter the six-digit code sent to <strong>{maskEmail(email)}</strong>.
        </p>

        <form className="auth-recovery__form" onSubmit={handleSubmit}>
          <div className="login-field">
            <label htmlFor="verification-otp">Verification code</label>
            <input
              className="auth-otp-input"
              id="verification-otp"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={otp}
              onChange={(event) => updateOtp(event.target.value)}
              placeholder="000000"
              autoFocus
              required
            />
          </div>

          {message && (
            <p className={`auth-message ${isError ? "auth-message--error" : "auth-message--success"}`} aria-live="polite">
              {!isError && <CheckCircle2 size={16} />} {message}
            </p>
          )}

          <button className="login-page__submit" disabled={isSubmitting || otp.length !== 6} type="submit">
            {isSubmitting ? "Verifying..." : "Verify account"}
          </button>
        </form>

        <div className="auth-recovery__links auth-recovery__links--stacked">
          <button className="auth-recovery__back" disabled={resendSeconds > 0 || isResending} type="button" onClick={handleResend}>
            {isResending ? "Sending..." : resendSeconds > 0 ? `Send again in ${resendSeconds}s` : "Send a new code"}
          </button>
          <Link className="login-page__link" to="/signup">Change email</Link>
          <Link className="login-page__link" to="/login" state={{ email }}>Back to login</Link>
        </div>
      </section>
    </main>
  );
}

export default VerifyAccount;
