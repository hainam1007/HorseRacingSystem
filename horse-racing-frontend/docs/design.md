# Frontend Design Document - Horse Racing Tournament Management System

## 1. Architecture Overview
The frontend is a Vite + React single page application using `react-router-dom` for routing and custom CSS for the visual system.

### Technology Stack
- Framework: React 18
- Build tool: Vite
- Routing: `react-router-dom`
- Icons: `lucide-react` only
- Styling: shared CSS plus role-scoped styles in `src/pages/spectator/spectator.css`, `src/pages/owner/owner.css`, `src/pages/jockey/jockey.css`, and `src/Referee/referee.css`.
- State: local React hooks (`useState`, `useEffect`, `useMemo`, `useRef`)

### Current Structure
- `src/App.jsx`: route map.
- `src/Landing Page/LandingPage.jsx`: public landing page.
- `src/Login/Login.jsx`: login page.
- `src/SignUp/SignUp.jsx`: register page.
- `src/Admin/*`: admin layout, dashboard, module pages, and mock module data.
- `src/layouts/MainLayout.jsx`: spectator shell with top nav and footer.
- `src/pages/spectator/*`: spectator pages.
- `src/pages/owner/*`: horse owner layout, pages, owner mock data, and owner-scoped styles.
- `src/pages/jockey/*`: jockey athlete layout, pages, jockey mock data/assets, and `jockey.css`.
- `src/Referee/*`: race referee layout, three-phase operational pages, API adapters/hooks, and referee-scoped styles. Production pages must not import sample referee data.
- `src/api/*`: API client and role/domain API wrappers.
- `src/auth/*`: auth context, session persistence, protected routes, and role routing helpers.
- `src/components/DataTable.jsx`: reusable table.
- `src/components/SearchFilterBar.jsx`: reusable search + animated filter dropdown; supports a page-specific `placeholder` prop and uses lucide icons.

## 2. Current Page Map & Routing

### Public Routes
- `/`: Landing page with a focused hero, horse profile section, testimonials carousel, race-day footer CTA, and routes into auth/spectator views.
- `/login`: Two-panel login page with email/password form, remember me, forgot password link, social buttons, and hover states.
- `/signup`: Two-panel registration page with animated role dropdown, account form, social buttons, and hover states.
- `*`: Redirects to `/`.

### Admin Routes
- `/admin`: Admin control center dashboard.
- `/admin/:module`: Dynamic admin module page.

Supported admin modules are routed by `src/Admin/AdminModulePage.jsx`:
- `users`: user and role management.
- `tournament`: tournament setup.
- `schedule`: race calendar and race slots.
- `registrations`: participant approval queue.
- `horses`: horse registry and readiness.
- `jockeys`: jockey invitations and assignments.
- `referees`: referee assignment and report status.
- `results`: race result publication and prizes.
- `predictions`: spectator prediction and reward management.

### Spectator Routes
All spectator routes render inside `MainLayout`.

- `/spectator`: spectator overview dashboard.
- `/spectator/tournaments`: searchable/filterable tournament list.
- `/spectator/tournaments/:tournamentId`: tournament detail page.
- `/spectator/tournaments/:tournamentId/races/:raceId`: informational race detail and viewer without embedded betting controls.
- `/spectator/leaderboard`: horses/jockeys leaderboard with tabs, podium, and table.
- `/spectator/predictions`: race-first prediction market board.
- `/spectator/predictions/races/:raceId`: dedicated fixed-odds betting prototype for one race.
- `/spectator/profile`: bettor profile, wallet, achievements, active bets, and history.
- `/spectator/results`: race results and betting history tabs.

### Jockey Routes
All jockey routes render inside `JockeyLayout`.

- `/jockey`: athlete command dashboard with invitation queue, next race, assignment summary, latest result, and race strip.
- `/jockey/invitations`: invitation-only race request management with Accept/Reject actions, filter controls, owner/horse/race context, and pending queue.
- `/jockey/schedule`: upcoming race schedule with date/time, tournament, venue, round, horse, and status filters.
- `/jockey/assignments`: horse pairing board with owner context, pairing status, race target, and assignment profile panel.
- `/jockey/results`: published result ledger with left date blocks, race/horse context, compact finish/time/prize metrics, and short status badges.
- `/jockey/profile`: athlete profile with portrait, availability, license, weight class, stable connection, contact details, next race, latest result, and notification activity.

### Horse Owner Routes
- `/owner`: implemented owner dashboard with stable summary, active horses, pending registrations, assigned jockeys, earnings, upcoming schedule, horse readiness, registration queue, quick actions, and notifications.
- `/owner/horses`: implemented horse list.
- `/owner/horses/new`: implemented add horse form.
- `/owner/horses/:horseId`: implemented horse detail.
- `/owner/horses/:horseId/edit`: implemented edit horse form.
- `/owner/registrations`: implemented tournament registration management.
- `/owner/jockeys`: implemented jockey assignments.
- `/owner/schedule`: implemented owner race schedule.
- `/owner/results`: implemented owner race results.
- `/owner/profile`: implemented owner profile.

### Race Referee Routes
All referee routes are protected by the `race_referee` role.

- `/referee`: referee control dashboard.
- `/referee/races`: assigned race list.
- `/referee/races/:raceId`: race detail and operational shortcuts.
- `/referee/races/:raceId/horse-inspection`: phase-aware pre-race and post-race horse checks.
- `/referee/races/:raceId/jockey-inspection`: pre-race jockey eligibility workflow, pending backend persistence contract.
- `/referee/races/:raceId/monitor`: during-race incident monitoring with backend start/complete lifecycle controls available for integration.
- `/referee/races/:raceId/violations`: violation create/update workflow.
- `/referee/races/:raceId/result`: result draft workflow.
- `/referee/races/:raceId/report`: referee report draft/submit workflow.

## 3. Component Design

### Shared Components
- `DataTable`: table renderer with custom column renderers, empty state, and row hover behavior.
- `SearchFilterBar`: search input plus animated custom dropdown for status/category filters.
- `MainLayout`: spectator navigation, route transition wrapper, user profile shortcut, logout link, and shared footer.
- `AdminLayout`: admin sidebar, admin navigation, header, actions slot, and content container.

### Page-Specific UI Patterns
- Landing page:
  - Full-screen hero with no enclosing navbar surface. The wordmark, public menu, and compact Sign Up/Login actions sit directly on the forest canvas; keep Home/Tournaments/Results/Leaderboard available.
  - Keep the hero focused on one headline, one primary tournament CTA, the horse visual, and a compact race-network/explore cluster. Do not add generic stat-card strips beneath it.
  - Horse details stage with labeled facts.
  - Testimonial carousel.
  - Deep-forest race-day footer shared with the spectator visual language: orange signal bar, real navigation, and one useful account CTA. Do not show fake contact details, inactive newsletter forms, or dead social links.
  - Keep all existing landing sections, but scope refinements under `.landing-page` so marketing styles cannot leak into authenticated layouts.
  - Keep both Sign Up and Login visible across responsive widths; reduce their padding on small screens instead of hiding either action.
- Login page:
  - Original split auth composition: focused dark form plus a warm race-control panel on desktop.
  - Keep one short heading, one supporting sentence, and three compact capability cues; avoid brochure-length descriptions.
  - Balance the secondary panel with useful one-line step descriptions and one concise application summary; do not add decorative role strips.
  - Let the shell follow the compact form content instead of enforcing the taller signup height; top-align both panels and avoid decorative corner circles.
  - No quote, fake stat grid, repeated verification copy, or non-functional social-login buttons.
- Sign up page:
  - Focused account form plus the same warm split surface used by Login.
  - The secondary panel may explain the three-step role, OTP, and workspace flow using one short line per step.
  - Add one concise `What happens next` note to explain spectator-first access and professional-role review; let the shell follow the form height and avoid decorative corner circles.
  - Custom animated role dropdown with scrollable option list.
  - Primary submit and login link only; verification continues in the dedicated OTP screen.
- Admin pages:
  - Race-control shell, grouped navigation, priority dashboard, compact ledgers, 20-row pagination, focused detail panels, forms, action rows, and status badges.
  - Jockey and referee directories use role-filtered account/profile data. Unsupported Admin modules are omitted from customer navigation.
- Horse owner pages:
  - Owner dashboard shell with top navigation, hero summary, metrics, readiness progress, upcoming schedule, registration queue, quick actions, and notification cards.
  - Owner notification bell opens a floating Facebook-style notification list with outside click/Escape close.
  - Owner registration timeline should keep date blocks clearly on the left and avoid stretching status into long bars when it creates visual imbalance.
  - Jockey invitation UI must stay locked until the selected horse has an approved race registration for the selected race.
  - Horse profile creation is local to the owner workspace and must not imply admin approval is required.
  - Jockey invitation UI should collect/show Meet link, meeting time, invitation message, and online contract/file/link before sending the invitation.
- Jockey pages:
  - Jockey athlete shell with top navigation, hero-led pages, performance metrics, invitation management, assignment cards, schedule slots, results ledger, profile cards, and notification popover.
  - Jockey pages use English copy and an athlete-focused tone. The jockey participates by receiving owner invitations only; invitation review must include horse/race context, Meet link, and contract preview/download.
  - Assignment status language should distinguish waiting-for-jockey, accepted, rejected, cancelled, and any backend-specific meeting/contract states until backend aligns with the target flow.
  - Jockey result rows use compact metrics and status badges; status should not become a long horizontal progress bar.
  - Jockey profile prioritizes portrait, availability, license, weight class, stable connection, contact, next race, latest result, and notifications.
- Spectator pages:
  - Shared green dashboard theme.
  - Cards, badges, tabs, timelines, image cards, podiums, prediction pick cards, and table views.
  - Spectator overview currently uses a race-day command-board layout rather than a generic card dashboard.
  - Tournament list currently uses a scan-first board layout, not a large hero/marketing layout.
  - Shared footer uses a deep forest surface, orange signal bar, concise brand statement, real spectator navigation, and one schedule CTA. Do not add fake contact details, inactive newsletter forms, dead social links, or a generic four-column link farm.
  - Keep a viewport-aware minimum content stage during route loading so compact skeletons do not pull the shared footer upward or cause a large layout shift.
- Race referee pages:
  - Dense operational workspace based on the admin visual language, with explicit pre-race, during-race, and post-race phases.
  - Each race uses one shared context for participants, checks, incidents, violations, result drafts, and reports.
  - Referee pages must clearly distinguish editable drafts from admin-confirmed or published states.
  - Missing APIs use explicit unavailable states; production UI never renders sample operational records.
  - The Referee workspace uses a scoped race-control-desk shell in `src/Referee/referee.css`: compact official navigation, asymmetric command metrics, a three-phase rail, scan-first race files, square operational surfaces, orange action signals, and deliberate tablet/mobile collapse behavior.

## 4. Design System

### Visual Direction
- Sporty, premium, race-day dashboard feel.
- Landing, auth, and spectator pages use a dark green + beige + orange identity.
- Admin pages use a dense operations dashboard style with dark panels and compact tables.
- Admin redesign is organized in `docs/ADMIN_REDESIGN_ROADMAP.md`. Segment 1 establishes the scoped race-control shell, grouped navigation, compact square surfaces, priority-lane dashboard, and workspace ledger. Later segments must extend this system instead of adding another Admin theme layer.
- Admin copy is customer-facing only: remove implementation explanations and internal terms such as API, backend, mock, sample, preview, source record, or developer notes. Keep operational descriptions short. Admin lists use 20 rows per page and reset to page 1 when filters change.
- Owner and jockey pages use a premium racing dashboard style with image-led heroes, compact operational cards, and athlete/stable context.

### Color Palette
- Landing/spectator green: `#3E5B49`
- Beige contrast: `#EEE7D4`
- Orange CTA/accent: `#ff6d14`, `#ff7b2b`, `#f0a15c`, `#d97735`
- Dark surfaces: deep green/near-black translucent panels
- Owner/spectator readable text:
  - Primary text: `#F7F3E8`
  - Heading text: `#FFF8EA`
  - Secondary text: `#E6DDC8`
  - Meta/helper text: `#D4C8B3`
  - Muted text minimum: `#C8BBA4`
  - Do not use text below roughly 70% opacity on the green background.
- Owner/spectator surfaces:
  - Page background: `#3E5B49`
  - Raised card background: `rgba(238, 231, 212, 0.10)` to `rgba(238, 231, 212, 0.14)`
  - Subtle row background: `rgba(255, 255, 255, 0.07)` to `rgba(255, 255, 255, 0.10)`
  - Border: `rgba(238, 231, 212, 0.22)` minimum for normal cards
  - Strong border/focus: `rgba(238, 231, 212, 0.42)` or orange focus ring
- Status colors:
  - Green: active/published/approved/won
  - Amber: pending/review/open
  - Red: rejected/suspended/lost
  - Blue/gray: informational/draft states

### Contrast Rules For Owner And Spectator Pages
- Owner and spectator pages sit on the updated green theme background, so body copy must be brighter than the old muted values.
- Avoid `rgba(245, 247, 243, 0.56)`, `0.58`, `0.62`, or similar low-opacity text for meaningful content.
- Reserve low-opacity text only for decorative labels, disabled UI, or non-essential metadata.
- For descriptions, table cells, card subtitles, list metadata, and schedule details, use `#E6DDC8` or `#D4C8B3`.
- For headings, entity names, metric values, and selected/active states, use `#FFF8EA` or `#F7F3E8`.
- For placeholder or disabled text, use `#B8AA93` and pair it with visible borders so the control still reads clearly.
- Icons should inherit the same contrast tier as the adjacent label; do not leave lucide icons at very faint opacity when they communicate action/status.
- Badges must use colored text with sufficient contrast and a visible border, not only a faint background tint.
- Hover states should increase contrast, not only move the element.

### Typography
- Headings use bold, condensed-feeling display treatment through CSS.
- Body text is clean sans-serif, optimized for cards, dashboards, and tables.
- Avoid negative letter spacing for compact UI unless already established in the current stylesheet.
- On owner and spectator dashboard surfaces, use a minimum practical body size of `0.88rem`; avoid tiny low-contrast helper text.

### Interaction
- Buttons should have visible hover and active states.
- Dropdowns use custom animated menus with scroll when options exceed menu height.
- Important form dropdowns, especially owner horse profile fields such as breed/status, should use a custom listbox/dropdown UI instead of a plain native `select` when visual consistency matters.
- Custom dropdown triggers must have clear hover, focus-visible, active, and expanded states; use a lucide chevron icon that rotates on open.
- Dropdown menus should animate open/closed with opacity and transform, render above surrounding cards through a local z-index layer, and avoid being clipped by parent containers.
- Long dropdown option lists must use a constrained max height with internal vertical scrolling, visible scrollbar styling, and readable selected/hover option states.
- Dropdown options should close the menu after selection and keep the selected value visible in the trigger.
- Notification bells should open floating toast/popover lists rather than navigating immediately. Popovers need an animated entrance, visible unread count, outside click/Escape close behavior, and links to relevant profile/detail pages.
- Route/page content may use light entrance animation where already established.
- Forms use clear focus rings and contrast-preserving background changes.

### Data Loading States
- Do not show visible sentences such as `Loading API data...`, `Loading live data...`, or `Restoring session...` as the primary page-loading UI.
- Use `src/components/LoadingSkeleton.jsx` for API-backed page, card, list, table, detail, inline, and authentication loading states.
- Select the skeleton variant that most closely matches the final component geometry. The placeholder must reserve stable width and height so content arrival does not cause a large layout shift.
- Keep loading placeholders inside the normal role layout whenever possible so navigation and page context remain stable.
- Skeletons must expose `aria-busy="true"`, a concise accessible label, and no visible instructional copy.
- Shimmer is subtle feedback only and must stop under `prefers-reduced-motion: reduce`.
- Errors and empty states remain explicit text states. Skeletons must never hide a failed or genuinely empty response.
- Action progress is separate from data loading: button labels such as `Saving...`, `Submitting...`, and `Processing...` may remain visible while the related action is running.

### Jockey Workspace Rules
- Keep all jockey UI scoped to `src/pages/jockey/jockey.css`.
- Use `src/pages/jockey/jockeyData.js` for local mock data until backend integration is available.
- Use the image references recorded in `jockey-image-assets.md` for jockey portraits, action shots, horse+jockey imagery, tracks, and celebration imagery.
- Jockey pages should feel like an athlete workspace, not an admin console: large race photography, confident headings, compact stats, and clear race-day actions.
- Participation model: jockeys only respond to owner invitations for approved race registrations. Avoid UI that implies jockeys can browse and self-join races.
- Assignment model: owner invitation should present Meet link and online contract before jockey accept/reject. Backend-specific meeting/terms/contract states should be adapted to this target product flow once the contract is confirmed.
- Copy language: English.
- Results layout: left-aligned date block, race ID/race name/horse context, finish/time/prize metrics, and a short status badge. Avoid long status bars.
- Profile layout: portrait hero, status/availability panel, performance summary, contact details, license/form card, next race, latest result, and activity/notifications.
- Keep responsive layouts stable: fixed-format profile portraits, result metric grids, schedule slots, and nav controls must not resize unpredictably when content changes.

### Spectator Tournament Board Rules
- `/spectator/tournaments` is a betting-discovery board. The priority is showing many tournaments plus enough decision-making information.
- Do not reintroduce a large hero image on the tournaments list page.
- Default tournament ordering: `Active` first, `Upcoming` second, `Completed` last; within each status, sort by date ascending.
- Tournament cards should include status, location, date, track, distance, entries, liquidity hint, prize pool, and a detail action.
- Status labels should be short:
  - `Active`
  - `Upcoming`
  - `Closed`
- Status colors:
  - Active: green text/badge.
  - Upcoming: amber text/badge.
  - Closed/completed: muted beige/gray text/badge.
- Status badges sit on images, so they need a dark translucent/blurred background, visible border, and sufficient contrast.
- The filter area should stay minimal: a small `Tournament Board` chip with count, a long search input, and a compact status dropdown.
- Filter dropdowns must not be clipped by cards; keep the filter container `overflow: visible` and z-index above the tournament grid.
- Avoid large blank spaces in tournament cards. Do not force tall card heights; keep footer/prize/action near the metadata.
- Metrics in the tournament header should use short labels (`Active`, `Upcoming`, `Pools`, `Entries`) and keep values inside their cards.

### Unified Spectator Theme Contract
- Design read: operational race-day dashboard for authenticated spectators, not a marketing landing page. Use scan-first hierarchy, compact race context, and purposeful image use.
- Direction dials for spectator product screens: `DESIGN_VARIANCE 5`, `MOTION_INTENSITY 3`, `VISUAL_DENSITY 7`. Composition may be offset, but data and controls remain predictable.
- Theme lock: every spectator route uses the same dark forest family. Do not switch an individual page to a beige/light theme or a second unrelated dark palette.
- Canonical tokens:
  - Page/background green: `#3E5B49`; deep operational surfaces may use `#1D3024` or a transparent mix derived from these greens.
  - Heading: `#FFF8EA`; primary body: `#F7F3E8`; secondary: `#E6DDC8`; metadata: `#D4C8B3`; disabled/placeholder floor: `#B8AA93`.
  - Single brand/action accent: warm racing orange `#F0A15C`; darker pressed/strong variant `#D97735`. Do not introduce yellow as a competing CTA accent.
  - Card surface: `rgba(238, 231, 212, 0.10)` to `0.14`; row surface: white at `0.07` to `0.10`; standard border: beige at `0.22` or stronger.
  - Semantic colors are exceptions to the one-accent rule and only communicate status: green success/live, amber pending/opening, red rejected/error/suspended, muted beige/gray closed/draft.
- Typography lock: use the existing Sora stack for headings, metrics, and body copy. Do not add a page-specific display font. Numeric data should use stable tabular alignment where columns or odds change.
- Shape lock: cards and panels use `8px` radius or less; controls may use `4px` to `8px`; pills are reserved for compact badges, filters, and avatars. Do not mix large 20px-34px marketing cards into spectator operational pages.
- Elevation: prefer visible borders and surface contrast. Use one restrained green-tinted shadow only for overlays, active menus, or true raised hierarchy; avoid glow effects.
- Page composition can differ by job:
  - Home is a race-day command board.
  - Tournament list is a dense discovery board without a large hero.
  - Tournament/race detail prioritizes event context and participant/result state.
  - Predictions is a market board; betting controls live only on the dedicated betting route.
  - Results and leaderboard use ledger/table hierarchy rather than promotional cards.
- Interaction states are mandatory: hover, active, focus-visible, selected, disabled, loading, empty, error, and unavailable. Motion communicates feedback/state change only and must honor `prefers-reduced-motion`.
- Responsive contract:
  - Desktop: bounded content width, stable navigation, multi-column boards only where scanning improves.
  - Tablet: reduce columns before shrinking cards or text; preserve control touch size and horizontal table strategy.
  - Mobile below `768px`: explicit single-column or intentional horizontal-scroll layout, page gutters of at least `16px`, controls at least `44px` high, no clipped menus, and no content-dependent fixed heights.
  - Tables must either expose a deliberate mobile row/card representation or a labeled horizontal scroll container. Never let columns silently clip.
  - Fixed-format viewer, odds, podium, and metric areas must define their own mobile geometry and reserve loading dimensions to prevent layout shift.
- Existing spectator CSS is cumulative and contains historical palette/radius variants. When a spectator screen is touched, migrate only its relevant selectors toward this contract instead of adding another parallel theme layer.

## 5. Iconography Rule

Use `lucide-react` for all UI icons.

Do not add:
- Handwritten inline SVG icons.
- AI-generated icons.
- External icon images/logos for UI controls.
- Text-symbol icons such as `↗`, `▶`, `v`, or decorative emoji when a lucide icon exists.

Current code uses `lucide-react` across spectator screens and the public landing page. Existing non-lucide icons still present in untouched code should be migrated when touched, including the inline SVG logout icon in `AdminLayout` and text-symbol controls in older dropdowns.

Brand text such as the `HR` wordmark may remain text, but functional icons must come from `lucide-react`.

## 6. Data & State Notes

The frontend uses an API-first model. Prototype mock data may remain in explicitly isolated spectator prototypes, but connected role workspaces should use real empty/error states:
- Auth, session restoration, role applications, role routing, and logout are API-backed.
- Owner profile, horse management, registration queue/actions, jockey lookup, and assignment creation are partially or fully API-backed.
- Jockey profile reads, assignments, invitations, schedule, results, and stats are API-backed; the target invitation flow with approved-registration gating, Meet link, and contract review still needs frontend follow-up.
- Spectator tournament, race schedule, published results, and horse leaderboard reads are API-backed. A dedicated spectator published-result endpoint now exists; participants, predictions, and jockey aggregate rankings still lack the complete spectator contract required by their screens.
- Race Referee dashboard/race reads, horse checks, violations, result drafts, and reports are partially API-backed. Backend lifecycle, readiness, finalize, penalty, violation-policy, and race-level confirm/publish contracts are available but still require frontend integration.
- Admin users, registrations, results, tournaments, rounds, races, jockey directory, and referee directory are connected. Horse registry and prediction management are not exposed in the Admin workspace.
- `refereeData.js` is legacy production fallback and must be removed or moved to test-only fixtures. Other mock sources are tracked by their role-specific integration plans.

Current integration flow:
1. User authenticates.
2. Auth token/session is stored.
3. User role determines redirect and route access.
4. API-backed pages fetch backend data through wrappers and adapters.
5. Mutations update the backend first, then reload or reconcile local UI state.
6. Connected production workspaces show explicit loading, empty, error, or unavailable states. Mock data is limited to clearly isolated prototypes whose backend contract does not exist, such as fixed-odds betting and realtime playback.

## 7. Implementation Guidelines

### Mandatory UI/UX Change Process
- Use the available frontend design skill for every UI/UX, layout, styling, spacing, margin, padding, responsive, or interaction change.
- Start with an audit of the existing screen and its scoped stylesheet. Preserve route structure, copy intent, role workflow, and established visual language unless the request explicitly changes them.
- This product is primarily a set of operational dashboards. Apply landing-page guidance only to true public/marketing surfaces.
- Perform a dedicated spacing and margin review after implementation: page gutters, vertical section rhythm, grid gaps, card padding, form spacing, table density, popover offsets, and mobile edge clearance.
- Check desktop and mobile layouts for clipping, overlap, unstable dimensions, excessive whitespace, cramped controls, and text overflow.
- Do not add a new CSS framework, component library, animation package, or state library without explicit approval.
- Run `npm run build` after UI changes and visually inspect affected views when browser tooling is available.

- Keep route definitions centralized in `src/App.jsx`.
- Prefer existing CSS classes and page patterns before adding new styles.
- Use custom dropdown/listbox patterns already established by SignUp and SearchFilterBar.
- For owner and spectator forms, prefer the custom animated dropdown/listbox pattern for meaningful select fields; only use native `select` for low-risk utility controls where platform styling is acceptable.
- Keep spectator pages scoped to `spectator.css`.
- Keep owner pages scoped to the owner page/style files.
- Keep jockey pages scoped to `src/pages/jockey/jockey.css` and reuse existing jockey shared classes before adding new ones.
- Keep Admin route selection centralized in `AdminModulePage.jsx` and workflow behavior inside the dedicated command, competition, and registry components.
- Reuse `DataTable` for tabular spectator/admin views unless a module needs a specialized layout.
- Use `lucide-react` imports for all new icons.
- Do not introduce new inline SVGs or generated icon assets.
- When updating existing icon-like controls, replace them with lucide icons as part of the same change.
