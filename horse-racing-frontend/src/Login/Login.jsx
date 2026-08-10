import { useState } from "react";
import { CheckCircle2, Eye, EyeOff } from "lucide-react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { authApi } from "../api/authApi";
import { useAuth } from "../auth/AuthContext";
import { clearRoleApplicationIntent, getRoleApplicationIntent } from "../auth/authStorage";
import { getPostLoginRoute, getRequiredRoleForPath } from "../auth/roleRoutes";
import "../index.css";
import "../App.css";

function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const { signIn } = useAuth();
  const [form, setForm] = useState({ email: location.state?.email || "", password: "", remember: false });
  const [error, setError] = useState("");
  const [verificationEmail, setVerificationEmail] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const notice = location.state?.notice;

  const updateField = (field, value) => {
    setError("");
    setVerificationEmail("");
    setForm((current) => ({ ...current, [field]: value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");
    setIsSubmitting(true);

    try {
      const data = await authApi.login({
        email: form.email,
        password: form.password,
      });
      const roles = signIn(data);
      const requestedPath = location.state?.from?.pathname;
      const requestedRole = getRequiredRoleForPath(requestedPath);
      const roleIntent = getRoleApplicationIntent(form.email);
      const fallbackRoute = getPostLoginRoute(roles);
      const shouldChooseWorkspace = roles.length > 1;
      const shouldApplyForRole = roles.includes("spectator") && roleIntent?.role && !roles.includes(roleIntent.role);
      const nextRoute = shouldApplyForRole
        ? `/spectator/role-applications?role=${roleIntent.role}`
        : shouldChooseWorkspace
          ? "/choose-role"
          : requestedRole && roles.includes(requestedRole)
          ? requestedPath
          : fallbackRoute;

      if (shouldApplyForRole) {
        clearRoleApplicationIntent();
      }

      navigate(nextRoute, {
        replace: true,
        state: shouldChooseWorkspace ? { from: location.state?.from || null } : undefined,
      });
    } catch (apiError) {
      const nextError = apiError.message || "Unable to login. Please try again.";
      setError(nextError);
      if (nextError.toLowerCase().includes("not verified")) {
        setVerificationEmail(form.email.trim().toLowerCase());
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="login-page" aria-label="Login page">
      <section className="login-page__shell">
        <div className="login-page__panel login-page__panel--form">
          <Link className="login-page__brand brand" to="/" aria-label="Horse racing home">
            <span className="brand-mark">HR</span>
            <span className="brand-text">
              <strong>horse</strong>
              <span>racing</span>
            </span>
          </Link>

          <p className="login-page__eyebrow">SIGN IN</p>
          <h1 className="login-page__title">Welcome back</h1>
          <p className="login-page__description">Sign in to continue to your racing workspace.</p>

          <form className="login-page__form" onSubmit={handleSubmit}>
            <div className="login-field">
              <label htmlFor="login-email">Email address</label>
              <input
                id="login-email"
                type="email"
                name="email"
                placeholder="you@example.com"
                autoComplete="email"
                value={form.email}
                onChange={(event) => updateField("email", event.target.value)}
                required
              />
            </div>

            <div className="login-field">
              <label htmlFor="login-password">Password</label>
              <div className="auth-password-field">
                <input
                  id="login-password"
                  type={showPassword ? "text" : "password"}
                  name="password"
                  placeholder="Enter your password"
                  autoComplete="current-password"
                  value={form.password}
                  onChange={(event) => updateField("password", event.target.value)}
                  required
                />
                <button
                  type="button"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  aria-pressed={showPassword}
                  onClick={() => setShowPassword((visible) => !visible)}
                >
                  {showPassword ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
                </button>
              </div>
            </div>

            <div className="login-page__row">
              <label className="login-remember" htmlFor="login-remember">
                <input
                  id="login-remember"
                  type="checkbox"
                  name="remember"
                  checked={form.remember}
                  onChange={(event) => updateField("remember", event.target.checked)}
                />
                Remember me
              </label>

              <Link className="login-page__link" to="/forgot-password">
                Forgot password?
              </Link>
            </div>

            {notice && <p className="auth-message auth-message--success"><CheckCircle2 size={16} /> {notice}</p>}
            {error && <p className="auth-message auth-message--error">{error}</p>}
            {verificationEmail && (
              <Link
                className="auth-inline-action"
                to={`/verify-account?email=${encodeURIComponent(verificationEmail)}`}
                state={{ email: verificationEmail }}
              >
                Verify this account
              </Link>
            )}

            <button className="login-page__submit" type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Logging in..." : "Login"}
            </button>

            <p className="login-page__note">
              New here? <Link className="login-page__link" to="/signup">Create an account</Link>
            </p>
          </form>
        </div>

        <aside className="login-page__panel login-page__panel--intro login-page__intro">
          <p className="login-page__eyebrow">RACE CONTROL</p>
          <h2 className="login-page__title">Everything ready for <span>race day</span></h2>
          <p className="login-page__description">One place for entries, schedules, and results.</p>

          <div className="login-page__intro-card">
            <ul className="login-page__intro-list">
              <li>
                <span className="login-page__intro-badge">01</span>
                <div><h4>Enter</h4><p>Register horses and manage approved race entries.</p></div>
              </li>
              <li>
                <span className="login-page__intro-badge">02</span>
                <div><h4>Follow</h4><p>Keep schedules, assignments, and race progress within reach.</p></div>
              </li>
              <li>
                <span className="login-page__intro-badge">03</span>
                <div><h4>Review</h4><p>Return to published results and rankings after the finish.</p></div>
              </li>
            </ul>
          </div>

          <p className="login-page__intro-note">
            From registration to published results, every role works from the same race-day source.
          </p>
        </aside>
      </section>
    </main>
  );
}

export default Login;
