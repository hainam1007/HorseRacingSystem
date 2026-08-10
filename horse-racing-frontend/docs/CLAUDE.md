# Horse Racing Tournament Management System

## Project Overview
A system to manage horse racing tournaments, replacing manual processes with a synchronized digital platform. It handles registrations, race scheduling, result tracking, and spectator predictions.

## Actors & Responsibilities
- **Horse Owner**: Registers local horse profiles, registers horses for races, invites jockeys after race registration approval, sends Meet links and online contracts, manages horse info, tracks results/prizes.
- **Jockey**: Manages profile, accepts/rejects owner invitations with horse/race context, Meet link, and contract, tracks personal achievements.
- **Race Referee**: Inspects horses, starts/completes assigned races, records and resolves violations, prepares draft results, applies penalties, and submits reports. Admin confirms and publishes official results.
- **Spectator**: Views schedules/results, predicts race outcomes, receives prediction rewards.
- **Admin**: Manages users/roles, schedules tournaments/races, approves registrations, assigns referees, publishes results.

## Domain Entities
- `Horse Owner`, `Jockey`, `Horse`, `Tournament`, `Race`, `Registration`, `Race Result`, `Bet` (Prediction), `Prize`, `Referee Report`.

## Functional Requirements (FR)
### Horse Owner
- Account registration, local horse profile management, race registration, jockey invitation after race registration approval, Meet/contract invitation workflow, Race schedule viewing, Result/prize tracking.

### Jockey
- Account registration, invitation management (Accept/Reject), contract review, assignment tracking, schedule, result/achievement tracking, and athlete profile management.

### Race Referee
- Pre-race horse inspection, Race monitoring and violation processing, Result confirmation and report generation.

### Spectator
- Tournament and schedule viewing, Live result and ranking tracking, Outcome prediction, Reward notifications.

### Admin
- User/role management, Tournament/Race/Round scheduling, Registration approval, Horse/Jockey list management, Referee assignment, Result publication.

## Tech Stack & Design
- **Frontend**: React (Vite), react-router-dom.
- **Theme Colors**: 
  - Primary (Deep Green): `#1D3024`
  - Contrast (Beige): `#EEE7D4`
- **Project Context**: WDP301 Course (FPT University HCM).

## Mandatory Frontend UI/UX Workflow
- Any task that changes UI, UX, layout, responsive behavior, visual hierarchy, spacing, margin, padding, typography, color, or interaction states must use the available frontend design skill before editing code.
- Treat the current application as an operational dashboard, not a marketing landing page. Preserve the established role-specific design language and information density.
- Before editing an existing screen, audit its current layout, shared CSS patterns, responsive breakpoints, loading/empty/error states, and nearby screens.
- Reuse the existing custom CSS and component patterns. Do not introduce Tailwind, React Query, a new component system, or another dependency unless explicitly approved.
- Every UI change must include a spacing pass: check page gutters, section rhythm, card padding, control gaps, alignment, and margins at desktop and mobile widths.
- Verify that text, buttons, dropdowns, tables, cards, popovers, and fixed-format controls do not overlap, clip, wrap badly, or shift layout when content changes.
- Keep cards at 8px radius or less unless an existing scoped design rule requires otherwise. Avoid nested cards and unnecessary decorative containers.
- Use `lucide-react` for functional icons and preserve keyboard focus, hover, active, disabled, loading, empty, and error states.
- For substantial UI work, run the frontend build and inspect the affected desktop/mobile views before considering the task complete.
- Responsive behavior is required for every new or changed screen. Define the desktop, tablet, and mobile collapse behavior explicitly; do not rely on accidental flex wrapping.

## Frontend Implementation Progress
- **Layouts**: `MainLayout` implemented with adaptive topbar and full-featured footer.
- **Shared Components**: `DataTable` and `SearchFilterBar` developed for data-heavy views. `SearchFilterBar` now accepts a custom `placeholder` prop and uses `lucide-react` search/chevron icons.
- **Horse Owner Pages**:
  - Owner workspace has been redesigned with a green/beige/orange premium dashboard visual system.
  - Implemented owner dashboard, horse management/detail/edit flow, registrations, jockeys, schedule, results, profile, and Facebook-style notification popover in `OwnerLayout`.
  - Target owner flow is documented in `OWNER_RACE_JOCKEY_FLOW_PLAN.md`: horse profile creation does not need admin approval; admin approves race registrations; approved race registration is required before jockey invitation; invitation includes Meet link and online contract.
  - Horse profile edit no longer uses readiness as a primary UI block. Meaningful dropdown fields should use the optimized custom animated listbox pattern documented in `design.md`.
- **Jockey Pages**:
  - Jockey role workspace is implemented under `/jockey` with `JockeyLayout`, top navigation, profile/logout actions, and Facebook-style notification popover.
  - Implemented routes: `/jockey`, `/jockey/invitations`, `/jockey/schedule`, `/jockey/assignments`, `/jockey/results`, and `/jockey/profile`.
  - Jockey UX direction is athlete-focused: owner invitation-only race participation, English copy, image-led hero sections, compact performance metrics, horse pairing context, race schedule clarity, contract review, published results ledger, and profile/availability management.
  - Jockey data and asset references live in `src/pages/jockey/jockeyData.js`; image source notes are captured in `jockey-image-assets.md`.
- **Spectator Pages**: 
  - `SpectatorHome`: Redesigned as a race-day command board with live race context, compact stats, race timeline, reward wallet, market favorites, featured tournament strip, and quick actions.
  - `TournamentList`: Redesigned as a scan-first tournament board. It intentionally does not use a large image hero. Active tournaments sort first, then upcoming, then completed. Cards expose betting-relevant info: status, location, date, track, distance, entries, liquidity hint, prize pool, and detail action.
  - `Leaderboard`: Implemented with tabbed views for Horses and Jockeys.
  - All spectator pages share one forest race-day theme contract from `design.md`. Pages may vary composition and density, but must not introduce a separate page palette, radius system, typography stack, or accent color.
- **Race Referee Pages**:
  - Race Referee workspace is implemented and protected under `/referee`.
  - Target lifecycle and migration phases are defined in `REFEREE_THREE_PHASE_FRONTEND_PLAN.md`.
  - Referee operations run across explicit `pre_race`, `during_race`, and `post_race` phases.
  - Production referee pages must not render or mutate fallback records. Missing contracts use explicit unavailable states.
  - Jockey inspection and race monitor remain migration debt until matching backend contracts are available.

## Current Backend Contract Notes
- Backend code is the source of truth when backend Markdown is stale. Frontend work may inspect backend routes, validators, services, and tests, but must not modify backend unless the user explicitly changes scope.
- Race lifecycle controls now exist at `POST /races/:raceId/start` and `POST /races/:raceId/complete` for the assigned referee or admin.
- Referee result workflow now includes participants, readiness, finalize, and penalty application endpoints under `/race-results/races/:raceId/*`.
- Admin confirms and publishes results atomically by race through `/race-results/races/:raceId/confirm` and `/race-results/races/:raceId/publish`.
- Violation options, penalty preview, confirm, and dismiss endpoints are available. The backend owns penalty policy and final penalty values.
- Spectators can read authenticated result lists through `/api/race-results`. Backend also mounts a dedicated published-result endpoint at `/users/spectator/races/:raceId/results`, outside the `/api` prefix; the current Vite proxy/client does not call that mount yet. Race participant endpoints remain referee/admin-only.
- Jockey suspension and outstanding fines are backend-enforced. Frontend assignment actions must display backend rejection messages rather than predicting eligibility locally.

## Current Spectator Tournament UI Notes
- `/spectator/tournaments` should prioritize seeing many tournaments at once over marketing-style hero presentation.
- Keep the filter bar minimal: left chip with `Tournament Board` plus count, long search input, compact status dropdown.
- Status labels should stay short: `Active`, `Upcoming`, `Closed`.
- Status color language:
  - `Active`: green text/badge.
  - `Upcoming`: amber text/badge.
  - `Closed`/completed: muted beige/gray text/badge.
- Dropdown menus must render above cards; keep filter wrapper `overflow: visible` and higher z-index.
- Avoid forcing tournament cards to equal tall heights. Keep card footer close to metadata so there is no large blank gap.
- Metrics in the top board must stay inside their cards; use short labels (`Active`, `Upcoming`, `Pools`, `Entries`) and no wrapping for values like `$4.6M`.

## Current Jockey UI Notes
- Jockey pages use the same premium racing palette as owner pages, scoped in `src/pages/jockey/jockey.css`.
- Keep the role language athlete-oriented and in English. The jockey can only receive and respond to owner invitations that include horse/race context, Meet link, and contract; do not design open self-registration into arbitrary races unless product scope changes.
- Navigation lives in `JockeyLayout`; keep route additions centralized in `src/App.jsx`.
- Results should read like a performance ledger: date block on the left, race/horse context in the center, compact finish/time/prize metrics, and a short status badge. Do not stretch status into a long horizontal bar.
- Profile should emphasize portrait, availability, license, weight class, stable connection, contact details, next race, latest result, and notifications.
- Notifications for jockey and owner should behave like a toast/popover list: bell button toggles a floating list, supports outside click/Escape close, and links to profile or relevant detail pages.
