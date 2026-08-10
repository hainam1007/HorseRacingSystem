import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, ChevronLeft, ChevronRight, Quote } from "lucide-react";
import LogoutButton from "../auth/LogoutButton";
import { useAuth } from "../auth/AuthContext";
import { getPostLoginRoute, getRoleRoute } from "../auth/roleRoutes";
import "../App.css";
import horseImage from "../img/img_horse03.png";

const testimonialPortraits = [
  "https://i.pinimg.com/1200x/e2/9b/73/e29b73519a7852c8cb9c33565dc89ac7.jpg",
  "https://i.pinimg.com/236x/bb/d3/c2/bbd3c26709d6837911ff67212f5bef3b.jpg",
  "https://i.pinimg.com/1200x/fe/26/7b/fe267b6f716f89ba262e451ba1331633.jpg",
  "https://i.pinimg.com/1200x/81/ad/28/81ad28872a4be66c032618e1ae2ec9e3.jpg",
];

const navItems = [
  { label: "Home", to: "/" },
  { label: "Tournament", to: "/spectator/tournaments" },
  { label: "Prediction", to: "/spectator/predictions" },
  { label: "Rewards", to: "/spectator/rewards" },
];

const horseFacts = [
  { label: "Warmblood", position: "fact-left fact-top" },
  { label: "Flexible Back", position: "fact-center fact-top" },
  { label: "17hh", position: "fact-right fact-top" },
  { label: "15 years", position: "fact-left fact-mid" },
  { label: "Efficient Heart", position: "fact-right fact-mid" },
  { label: "58 mph", position: "fact-center fact-bottom" },
  { label: "455 lb", position: "fact-right fact-bottom" },
];

const testimonials = [
  {
    id: 1,
    name: "Minh Anh",
    role: "Horse Owner",
    text:
      "Managing horse registration, jockey assignment, and race confirmation is much easier with the tournament dashboard.",
    stars: 5,
    image: testimonialPortraits[0],
  },
  {
    id: 2,
    name: "Quang Huy",
    role: "Jockey",
    text: "I can quickly review my assigned races, horse details, and results from one screen.",
    stars: 5,
    image: testimonialPortraits[1],
  },
  {
    id: 3,
    name: "Thanh Lam",
    role: "Race Referee",
    text: "The race confirmation, violation tracking, and result approval flow stays clear and organized.",
    stars: 5,
    image: testimonialPortraits[2],
  },
  {
    id: 4,
    name: "Gia Bao",
    role: "Spectator",
    text: "I can follow the live rankings and predictions without losing track of the tournament progress.",
    stars: 4,
    image: testimonialPortraits[3],
  },
];

function LandingPage() {
  const [testimonialIndex, setTestimonialIndex] = useState(0);
  const { activeRole, isAuthenticated, roles, user } = useAuth();
  const year = new Date().getFullYear();
  const workspaceRoute = getRoleRoute(activeRole) || getPostLoginRoute(roles);
  const displayName = user?.full_name || user?.email || "Workspace";
  const homeTarget = isAuthenticated ? workspaceRoute : "/";
  const footerCta = isAuthenticated
    ? { label: "Back to workspace", to: workspaceRoute }
    : { label: "Create your account", to: "/signup" };

  const moveTestimonial = (direction) => {
    setTestimonialIndex(
      (current) => (current + direction + testimonials.length) % testimonials.length,
    );
  };

  const getSlideOffset = (slideIndex) => {
    const total = testimonials.length;
    let offset = slideIndex - testimonialIndex;

    if (offset > total / 2) offset -= total;
    if (offset < -total / 2) offset += total;

    return offset;
  };

  return (
    <main className="page-shell landing-page">
      <section className="hero-layout">
        <div className="hero-background" aria-hidden="true" />

        <header className="topbar topbar--minimal">
          <Link className="brand" to={homeTarget} aria-label="Horse racing home">
            <span className="brand-mark">HR</span>
            <span className="brand-text">
              <strong>horse</strong>
              <span>racing</span>
            </span>
          </Link>

          <nav className="nav landing-nav" aria-label="Primary navigation">
            {navItems.map((item, index) => (
              <Link key={item.label} to={item.to} className={index === 0 ? "active" : ""}>
                <span className="landing-nav__label">{item.label}</span>
              </Link>
            ))}
          </nav>

          <div className="header-actions">
            {isAuthenticated ? (
              <>
                <Link className="signup-btn" to={workspaceRoute}>{displayName}</Link>
                <LogoutButton className="contact-btn">Logout</LogoutButton>
              </>
            ) : (
              <>
                <Link className="signup-btn" to="/signup">Sign Up</Link>
                <Link className="contact-btn" to="/login">
                  Login
                  <ArrowRight size={16} aria-hidden="true" />
                </Link>
              </>
            )}
          </div>
        </header>

        <div className="hero-grid">
          <div className="hero-copy">
            <p className="eyebrow">HORSE RACING</p>
            <h1>
              Manage Your <span className="hero-title-accent">Horse Racing</span> Tournament
            </h1>
            <p className="hero-description">
              Create tournaments, assign race roles, publish official results, and keep every stakeholder on the same track.
            </p>
            <div className="hero-actions">
              <Link className="primary-btn" to="/spectator/tournaments">
                Explore tournaments
                <ArrowRight size={17} aria-hidden="true" />
              </Link>
            </div>
          </div>

          <div className="hero-visual" aria-label="Horse racing management hero image">
            <div className="image-glow" aria-hidden="true" />
            <img
              src="/images/horse-riding.png"
              alt="Horse racing visual"
              className="horse-image"
            />
          </div>

          <aside className="hero-rail" aria-label="Tournament roles and explore more">
            <div className="trainer-card">
              <p className="trainer-kicker">Race command</p>
              <div className="trainer-avatar-stack" aria-hidden="true">
                <span className="trainer-avatar avatar-1">O</span>
                <span className="trainer-avatar avatar-2">J</span>
                <span className="trainer-avatar avatar-3">R</span>
                <span className="trainer-avatar avatar-4">S</span>
                <span className="trainer-avatar avatar-5">A</span>
              </div>
              <div className="trainer-count">5 roles</div>
              <div className="trainer-label">Owner, jockey, referee, spectator, admin</div>
            </div>

            <Link className="explore-rail" to="/spectator/tournaments">
              <div className="rail-line" aria-hidden="true">
                <span className="rail-dot" />
              </div>
              <div className="explore-copy">
                <span>Explore</span>
                <strong>Open race hub</strong>
              </div>
              <span className="play-btn" aria-hidden="true">
                <ArrowRight size={16} />
              </span>
            </Link>
          </aside>
        </div>

        <section
          className="horse-details"
          id="horses"
          aria-labelledby="horse-details-title"
        >
          <div className="horse-details__header">
            <p className="horse-details__eyebrow">RACE PROFILE</p>
            <h2 id="horse-details-title">Horse Racing Details</h2>
          </div>

          <div className="horse-details__stage">
            <div className="horse-details__watermark" aria-hidden="true">
              HORSE
            </div>

            <div className="horse-details__frame">
              <img
                src={horseImage}
                alt="Racing horse profile"
                className="horse-details__image"
              />

              {horseFacts.map((fact) => (
                <div key={fact.label} className={`horse-fact ${fact.position}`}>
                  <span className="horse-fact__connector" aria-hidden="true" />
                  <span className="horse-fact__label">{fact.label}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="testimonials" aria-label="Riders testimonials">
          <div className="testimonials__header">
            <h3 className="testimonials__title">What Riders Are Saying</h3>
            <div className="testimonials__controls" />
          </div>

          <div className="testimonials__stage">
            <div className="testimonials__track">
              {testimonials.map((testimonial, slideIndex) => {
                const offset = getSlideOffset(slideIndex);
                const absOffset = Math.abs(offset);
                const isCenter = offset === 0;
                const sideClass = offset < 0 ? "left" : "right";

                return (
                  <article
                    key={testimonial.id}
                    className={`testimonial-card ${
                      isCenter ? "is-center" : absOffset === 1 ? `is-side is-${sideClass}` : "is-far"
                    }`}
                    style={{ "--offset": offset }}
                  >
                    <img
                      src={testimonial.image}
                      alt={`${testimonial.name}, ${testimonial.role}`}
                      className="testimonial-card__image"
                    />

                    {isCenter ? (
                      <div className="testimonial-card__content">
                        <div className="testimonial-card__quote-mark" aria-hidden="true">
                          <Quote size={24} strokeWidth={1.8} />
                        </div>
                        <p className="testimonial-card__text">{testimonial.text}</p>
                        <div className="testimonial-card__footer">
                          <div className="testimonial-card__meta">
                            <div className="testimonial-card__name">{testimonial.name}</div>
                            <div className="testimonial-card__role">{testimonial.role}</div>
                          </div>
                          <div
                            className="testimonial-card__rating"
                            aria-label={`${testimonial.stars} out of 5 stars`}
                          >
                            <span>{testimonial.stars}.0</span>
                            <span aria-hidden="true">{"★".repeat(testimonial.stars)}</span>
                          </div>
                        </div>
                      </div>
                    ) : null}
                  </article>
                );
              })}
            </div>
            <button
              className="testimonials__nav testimonials__nav--left"
              type="button"
              onClick={() => moveTestimonial(-1)}
              aria-label="Previous testimonial"
            >
              <ChevronLeft size={20} aria-hidden="true" />
            </button>

            <button
              className="testimonials__nav testimonials__nav--right"
              type="button"
              onClick={() => moveTestimonial(1)}
              aria-label="Next testimonial"
            >
              <ChevronRight size={20} aria-hidden="true" />
            </button>
          </div>
        </section>
      </section>
      <footer className="site-footer" aria-label="Site footer">
        <div className="site-footer__signal" aria-hidden="true">
          <span>HORSE RACING TOURNAMENT SYSTEM</span>
          <span>FROM GATE TO FINISH</span>
        </div>

        <div className="site-footer__inner">
          <div className="footer-brand">
            <Link className="brand footer-brand__link" to={homeTarget}>
              <span className="brand-mark">HR</span>
              <span className="brand-text">
                <strong>horse</strong>
                <span>racing</span>
              </span>
            </Link>
            <h2>Every race.<br />One clear finish.</h2>
            <p className="footer-copy">Follow the field from registration to official results.</p>
          </div>

          <nav className="footer-links" aria-label="Footer navigation">
            <p className="footer-label">Explore</p>
            <ul>
              <li><Link to="/"><span>01</span>Home</Link></li>
              <li><Link to="/spectator/tournaments"><span>02</span>Tournament</Link></li>
              <li><Link to="/spectator/predictions"><span>03</span>Prediction</Link></li>
              <li><Link to="/spectator/rewards"><span>04</span>Rewards</Link></li>
            </ul>
          </nav>

          <section className="footer-race-call" aria-labelledby="landing-footer-cta">
            <p className="footer-label">Get started</p>
            <h3 id="landing-footer-cta">Your place at the track starts here.</h3>
            <p>Join the tournament workspace and keep every race-day detail within reach.</p>
            <Link className="footer-race-call__link" to={footerCta.to}>
              {footerCta.label}
              <ArrowRight size={18} aria-hidden="true" />
            </Link>
          </section>
        </div>

        <div className="site-footer__bottom">
          <div className="footer-copyright">© {year} Horse Racing Tournament Management System</div>
          <div className="footer-finish-line" aria-hidden="true">
            <span />
            Finish strong
          </div>
        </div>
      </footer>
    </main>
  );
}

export default LandingPage;
