import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { authApi } from "../api/authApi";
import "../index.css";
import "../App.css";

function SignUp() {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    fullName: "",
    email: "",
    password: "",
    confirmPassword: "",
    terms: false,
  });
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [visiblePasswords, setVisiblePasswords] = useState({
    password: false,
    confirmPassword: false,
  });

  const updateField = (field, value) => {
    setError("");
    setForm((current) => ({ ...current, [field]: value }));
  };

  const togglePasswordVisibility = (field) => {
    setVisiblePasswords((current) => ({ ...current, [field]: !current[field] }));
  };

  const validateForm = () => {
    if (!form.fullName.trim()) return "Full name is required.";
    if (!form.email.trim()) return "Email is required.";
    if (form.password.length < 8) return "Password must be at least 8 characters.";
    if (form.password !== form.confirmPassword) return "Confirm password does not match.";
    if (!form.terms) return "Please agree to the tournament rules and privacy policy.";
    return "";
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    const validationError = validateForm();

    if (validationError) {
      setError(validationError);
      return;
    }

    setIsSubmitting(true);
    setError("");

    try {
      await authApi.register({
        full_name: form.fullName,
        email: form.email,
        password: form.password,
      });
      const email = form.email.trim().toLowerCase();
      navigate(`/verify-account?email=${encodeURIComponent(email)}`, {
        replace: true,
        state: {
          email,
          requested: true,
        },
      });
    } catch (apiError) {
      if (apiError.status === 409) {
        const email = form.email.trim().toLowerCase();

        try {
          const verification = await authApi.resendVerification(email);

          if (verification.already_verified) {
            setError("This email already has an account. Sign in to continue.");
            return;
          }

          navigate(`/verify-account?email=${encodeURIComponent(email)}`, {
            replace: true,
            state: {
              email,
              requested: true,
              resent: true,
            },
          });
          return;
        } catch (resendError) {
          setError(resendError.message || "Unable to resend the verification code. Please try again.");
          return;
        }
      }

      setError(apiError.message || "Unable to create account. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="signup-page" aria-label="Sign up page">
      <section className="signup-page__shell">
        <div className="signup-page__panel signup-page__panel--form">
          <Link className="signup-page__brand brand" to="/" aria-label="Horse racing home">
            <span className="brand-mark">HR</span>
            <span className="brand-text">
              <strong>horse</strong>
              <span>racing</span>
            </span>
          </Link>

          <p className="signup-page__eyebrow">GET STARTED</p>
          <h1 className="signup-page__title">Create your account</h1>
          <p className="signup-page__description">
            New accounts start as spectators. Apply for professional access after email verification.
          </p>

          <form className="signup-page__form" onSubmit={handleSubmit}>
            <div className="signup-field">
              <label htmlFor="signup-first-name">Full name</label>
              <input
                id="signup-first-name"
                type="text"
                name="fullName"
                placeholder="Your full name"
                autoComplete="name"
                value={form.fullName}
                onChange={(event) => updateField("fullName", event.target.value)}
                required
              />
            </div>

            <div className="signup-field">
              <label htmlFor="signup-email">Email address</label>
              <input
                id="signup-email"
                type="email"
                name="email"
                placeholder="you@example.com"
                autoComplete="email"
                value={form.email}
                onChange={(event) => updateField("email", event.target.value)}
                required
              />
            </div>

            <div className="signup-page__grid">
              <div className="signup-field">
                <label htmlFor="signup-password">Password</label>
                <div className="auth-password-field">
                  <input
                    id="signup-password"
                    type={visiblePasswords.password ? "text" : "password"}
                    name="password"
                    placeholder="Create password"
                    autoComplete="new-password"
                    value={form.password}
                    onChange={(event) => updateField("password", event.target.value)}
                    required
                  />
                  <button
                    type="button"
                    aria-label={visiblePasswords.password ? "Hide password" : "Show password"}
                    aria-pressed={visiblePasswords.password}
                    onClick={() => togglePasswordVisibility("password")}
                  >
                    {visiblePasswords.password ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
                  </button>
                </div>
              </div>

              <div className="signup-field">
                <label htmlFor="signup-confirm-password">Confirm password</label>
                <div className="auth-password-field">
                  <input
                    id="signup-confirm-password"
                    type={visiblePasswords.confirmPassword ? "text" : "password"}
                    name="confirmPassword"
                    placeholder="Repeat password"
                    autoComplete="new-password"
                    value={form.confirmPassword}
                    onChange={(event) => updateField("confirmPassword", event.target.value)}
                    required
                  />
                  <button
                    type="button"
                    aria-label={visiblePasswords.confirmPassword ? "Hide confirm password" : "Show confirm password"}
                    aria-pressed={visiblePasswords.confirmPassword}
                    onClick={() => togglePasswordVisibility("confirmPassword")}
                  >
                    {visiblePasswords.confirmPassword ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
                  </button>
                </div>
              </div>
            </div>

            <label className="signup-page__agree" htmlFor="signup-terms">
              <input
                id="signup-terms"
                type="checkbox"
                name="terms"
                checked={form.terms}
                onChange={(event) => updateField("terms", event.target.checked)}
              />
              I agree to the tournament rules and privacy policy
            </label>

            {error && <p className="auth-message auth-message--error">{error}</p>}
            <button className="signup-page__submit" type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Creating account..." : "Sign Up"}
            </button>

            <p className="signup-page__note">
              Already have an account? <Link className="signup-page__link" to="/login">Sign in</Link>
            </p>
          </form>
        </div>

        <aside className="signup-page__panel signup-page__panel--intro signup-page__intro">
          <p className="signup-page__eyebrow">JOIN THE PADDOCK</p>
          <h2 className="signup-page__title">Three steps to the <span>track</span></h2>
          <p className="signup-page__description">Create, verify, and enter your workspace.</p>

          <div className="signup-page__intro-card">
            <ul className="signup-page__intro-list">
              <li>
                <span className="signup-page__intro-badge">01</span>
                <div><h4>Create spectator account</h4><p>Use one account to follow races while access is reviewed.</p></div>
              </li>
              <li>
                <span className="signup-page__intro-badge">02</span>
                <div><h4>Verify email</h4><p>Use the six-digit code sent to secure your account.</p></div>
              </li>
              <li>
                <span className="signup-page__intro-badge">03</span>
                <div><h4>Request professional access</h4><p>Apply for owner, jockey, or referee permissions from your spectator workspace.</p></div>
              </li>
            </ul>
          </div>

          <div className="signup-page__intro-note">
            <h3>What happens next</h3>
            <p>Professional roles are reviewed after verification. You can still follow races as a spectator while waiting.</p>
          </div>
        </aside>
      </section>
    </main>
  );
}

export default SignUp;
