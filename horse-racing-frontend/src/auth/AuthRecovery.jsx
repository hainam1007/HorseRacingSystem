import { useEffect, useState } from "react";
import { CheckCircle2, Eye, EyeOff, KeyRound, MailCheck, ShieldCheck } from "lucide-react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { authApi } from "../api/authApi";
import { useAuth } from "./AuthContext";

const pageContent = {
  forgot: {
    eyebrow: "ACCOUNT RECOVERY",
    title: "Request a password reset",
    description: "Enter your email and we will send a six-digit reset code.",
    icon: KeyRound,
  },
  resend: {
    eyebrow: "EMAIL VERIFICATION",
    title: "Send a verification code",
    description: "Enter the email for the account you still need to verify.",
    icon: MailCheck,
  },
  reset: {
    eyebrow: "NEW PASSWORD",
    title: "Set a new account password",
    description: "Enter the code from your email and choose a new password.",
    icon: ShieldCheck,
  },
  change: {
    eyebrow: "ACCOUNT SECURITY",
    title: "Change your password",
    description: "Confirm your current password before replacing it with a new one.",
    icon: ShieldCheck,
  },
};

const RESEND_COOLDOWN_SECONDS = 60;
const isDevMode = import.meta.env.DEV;

function normalizeOtp(value) {
  return String(value || "").replace(/\D/g, "").slice(0, 6);
}

function maskEmail(email) {
  const [localPart, domain] = String(email || "").split("@");

  if (!localPart || !domain) return email;

  return `${localPart.slice(0, 2)}${"*".repeat(Math.max(2, localPart.length - 2))}@${domain}`;
}

function getResetDeliveryIssue(response) {
  if (!isDevMode) {
    return "";
  }

  if (response?.email?.skipped) {
    return response.email.reason || "Backend skipped email delivery for this reset request.";
  }

  if (!response?.reset && !response?.email) {
    return "Backend accepted the request, but did not generate a reset email for this address. Check that the account exists, is verified, and is active.";
  }

  return "";
}

function AuthRecovery({ mode }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { signOut, user } = useAuth();
  const content = pageContent[mode];
  const Icon = content.icon;
  const [form, setForm] = useState({
    email: searchParams.get("email") || location.state?.email || user?.email || "",
    otp: "",
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });
  const [message, setMessage] = useState(location.state?.notice || "");
  const [isError, setIsError] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [resendSeconds, setResendSeconds] = useState(location.state?.requested ? RESEND_COOLDOWN_SECONDS : 0);
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);

  useEffect(() => {
    if (resendSeconds <= 0) return undefined;

    const timer = window.setTimeout(() => {
      setResendSeconds((seconds) => Math.max(0, seconds - 1));
    }, 1000);

    return () => window.clearTimeout(timer);
  }, [resendSeconds]);

  const updateField = (field, value) => {
    setMessage("");
    setIsError(false);
    setForm((current) => ({ ...current, [field]: value }));
  };

  const validatePassword = () => {
    if (form.newPassword.length < 8) {
      throw new Error("New password must be at least 8 characters.");
    }

    if (form.newPassword !== form.confirmPassword) {
      throw new Error("Password confirmation does not match.");
    }
  };

  const validateOtp = () => {
    if (form.otp.length !== 6) {
      throw new Error("Enter the six-digit reset code.");
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setMessage("");
    setIsError(false);
    setIsSubmitting(true);

    try {
      if (mode === "forgot") {
        const response = await authApi.forgotPassword(form.email);
        const deliveryIssue = getResetDeliveryIssue(response);

        if (deliveryIssue) {
          setIsError(true);
          setMessage(deliveryIssue);
          return;
        }

        const email = form.email.trim().toLowerCase();
        navigate(`/reset-password?email=${encodeURIComponent(email)}`, {
          replace: true,
          state: {
            email,
            requested: true,
            notice: "A password reset code has been requested.",
          },
        });
        return;
      }

      if (mode === "resend") {
        await authApi.resendVerification(form.email);
        const email = form.email.trim().toLowerCase();
        navigate(`/verify-account?email=${encodeURIComponent(email)}`, {
          replace: true,
          state: {
            email,
            requested: true,
            notice: "A verification code has been requested.",
          },
        });
        return;
      }

      if (mode === "reset") {
        validateOtp();
        validatePassword();
        await authApi.resetPassword({ otp: form.otp, new_password: form.newPassword });
        navigate("/login", {
          replace: true,
          state: {
            email: form.email,
            notice: "Password reset successfully. Sign in with your new password.",
          },
        });
        return;
      }

      if (mode === "change") {
        validatePassword();
        await authApi.changePassword({
          current_password: form.currentPassword,
          new_password: form.newPassword,
        });
        await signOut();
        navigate("/login", { replace: true, state: { notice: "Password changed successfully. Please sign in again." } });
      }
    } catch (apiError) {
      setIsError(true);
      setMessage(apiError.message || "Unable to complete this request.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResetResend = async () => {
    if (!form.email || resendSeconds > 0 || isResending) return;

    setIsResending(true);
    setMessage("");
    setIsError(false);

    try {
      const response = await authApi.forgotPassword(form.email);
      const deliveryIssue = getResetDeliveryIssue(response);

      if (deliveryIssue) {
        setIsError(true);
        setMessage(deliveryIssue);
        return;
      }

      setResendSeconds(RESEND_COOLDOWN_SECONDS);
      setMessage("A new password reset code has been requested.");
    } catch (apiError) {
      setIsError(true);
      setMessage(apiError.message || "Unable to request a new reset code.");
    } finally {
      setIsResending(false);
    }
  };

  const showsEmail = mode === "forgot" || mode === "resend";
  const showsOtp = mode === "reset";
  const showsCurrentPassword = mode === "change";
  const showsNewPassword = mode === "reset" || mode === "change";

  return (
    <main className="auth-recovery" aria-label={content.title}>
      <section className="auth-recovery__panel">
        <Link className="auth-recovery__brand brand" to="/" aria-label="Horse racing home">
          <img className="brand-mark" src="/images/horse-logo.png" alt="" />
          <span className="brand-text"><strong>horse</strong><span>racing</span></span>
        </Link>

        <div className="auth-recovery__icon"><Icon size={24} /></div>
        <p className="login-page__eyebrow">{content.eyebrow}</p>
        <h1 className="auth-recovery__title">{content.title}</h1>
        <p className="auth-recovery__description">{content.description}</p>
        {mode === "reset" && form.email && (
          <p className="auth-recovery__email-context">Code requested for <strong>{maskEmail(form.email)}</strong></p>
        )}

        <form className="auth-recovery__form" onSubmit={handleSubmit}>
          {showsEmail && (
            <div className="login-field">
              <label htmlFor={`${mode}-email`}>Email address</label>
              <input id={`${mode}-email`} type="email" autoComplete="email" value={form.email} onChange={(event) => updateField("email", event.target.value)} required />
            </div>
          )}

          {showsOtp && (
            <div className="login-field">
              <label htmlFor="reset-otp">Reset code</label>
              <input
                className="auth-otp-input"
                id="reset-otp"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                value={form.otp}
                onChange={(event) => updateField("otp", normalizeOtp(event.target.value))}
                placeholder="000000"
                required
              />
            </div>
          )}

          {showsCurrentPassword && (
            <div className="login-field">
              <label htmlFor="current-password">Current password</label>
              <div className="auth-password-field">
                <input id="current-password" type={showCurrentPassword ? "text" : "password"} autoComplete="current-password" value={form.currentPassword} onChange={(event) => updateField("currentPassword", event.target.value)} required />
                <button type="button" aria-label={showCurrentPassword ? "Hide current password" : "Show current password"} onClick={() => setShowCurrentPassword((visible) => !visible)}>
                  {showCurrentPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>
          )}

          {showsNewPassword && (
            <>
              <div className="login-field">
                <label htmlFor="new-password">New password</label>
                <div className="auth-password-field">
                  <input id="new-password" type={showNewPassword ? "text" : "password"} minLength="8" autoComplete="new-password" value={form.newPassword} onChange={(event) => updateField("newPassword", event.target.value)} required />
                  <button type="button" aria-label={showNewPassword ? "Hide new password" : "Show new password"} onClick={() => setShowNewPassword((visible) => !visible)}>
                    {showNewPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>
              <div className="login-field">
                <label htmlFor="confirm-password">Confirm new password</label>
                <input id="confirm-password" type="password" minLength="8" autoComplete="new-password" value={form.confirmPassword} onChange={(event) => updateField("confirmPassword", event.target.value)} required />
              </div>
            </>
          )}

          {message && (
            <p className={`auth-message ${isError ? "auth-message--error" : "auth-message--success"}`} aria-live="polite">
              {!isError && <CheckCircle2 size={16} />} {message}
            </p>
          )}

          <button className="login-page__submit" disabled={isSubmitting || (mode === "reset" && form.otp.length !== 6)} type="submit">
            {isSubmitting ? "Processing..." : mode === "forgot" ? "Send reset code" : mode === "resend" ? "Send verification code" : mode === "reset" ? "Reset password" : "Change password"}
          </button>
        </form>

        <div className="auth-recovery__links">
          {mode !== "change" && <Link className="login-page__link" to="/login">Back to login</Link>}
          {mode === "reset" && form.email && (
            <button className="auth-recovery__back" disabled={resendSeconds > 0 || isResending} type="button" onClick={handleResetResend}>
              {isResending ? "Sending..." : resendSeconds > 0 ? `Send again in ${resendSeconds}s` : "Send a new code"}
            </button>
          )}
          {mode === "reset" && <Link className="login-page__link" to="/forgot-password">Change email</Link>}
          {mode === "resend" && <Link className="login-page__link" to="/forgot-password">Forgot password?</Link>}
          {mode === "change" && <button className="auth-recovery__back" type="button" onClick={() => navigate(-1)}>Back to workspace</button>}
        </div>
      </section>
    </main>
  );
}

export default AuthRecovery;
