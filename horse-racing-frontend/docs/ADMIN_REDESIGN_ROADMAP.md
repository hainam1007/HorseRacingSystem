# Admin Redesign Roadmap

> Started: 2026-06-22  
> Scope: `src/Admin` and shared Admin selectors in `src/App.css`  
> Direction: dense race-control workspace, dark forest surfaces, cream text, orange action signal.

## Audit summary

- The previous shell used oversized glass panels, 20–28px radii, pill buttons, and repeated translucent cards.
- Navigation was a single undifferentiated list of ten destinations, which made priority workflows hard to scan.
- The dashboard repeated similar content across metrics, overview panels, feature cards, operation cards, and workflow cards.
- Several dashboard values were static even though aggregate Admin APIs do not exist.
- Desktop had a permanent sidebar, but tablet simply stacked the entire sidebar above the page instead of providing intentional navigation.
- Existing live modules have useful loading, empty, error, table, modal, and mutation states that must remain functional during visual changes.

## Segment 1 — Foundation and dashboard

Status: completed

- Introduce a scoped Admin stylesheet and operational design tokens.
- Rebuild navigation into Command, Competition, and Directory groups.
- Add functional Lucide icons, skip navigation, clear focus states, and mobile horizontal navigation.
- Replace the repeated dashboard card wall with priority lanes, a workspace directory, and the four-gate operating protocol.
- Remove fake aggregate metrics and show only available workspaces.
- Normalize shared panels, controls, tables, and modals toward an 8px-or-less radius system.

## Product copy and list rules

- Admin screens contain only task, status, and decision information useful to the administrator.
- Do not expose implementation terms such as API, backend, source record, mock, sample, preview, or developer notes in customer-facing UI.
- Keep headings, descriptions, and empty states short.
- Operational lists show 20 rows per page. Search and status changes return to page 1.

## Segment 2 — Live command workflows

Status: completed

- Redesign Users & Roles, Registrations, and Results.
- Prioritize queue state, record detail, role/status transitions, confirmation, and publication.
- Replace generic tool cards and modal-heavy interactions with compact ledgers and focused side panels where practical.
- Preserve all live API adapters, mutation rules, loading, empty, error, and read-only states.
- Users, Registrations, and Results now use a dedicated command ledger with a responsive inline detail panel.
- Removed fake create, edit, delete, tools, and local-only actions from these connected modules.
- Added 20-row pagination, status filters, search reset, compact metrics, keyboard focus, and state-specific actions.

## Segment 3 — Competition planning

Status: completed

- Redesign Tournament Setup and Race Schedule.
- Improve the tournament → round → race relationship view, form hierarchy, date scheduling, and destructive-action safety.
- Keep referee assignment explicitly unavailable until a safe live directory contract exists.
- Added a Tournament → Round → Race structure summary and a tournament filter for the round ledger.
- Tournament, Round, and Race ledgers now paginate at 20 rows and reset when filters change.
- Replaced browser confirmation with an in-product delete dialog.
- Tournament deletion is blocked while rounds exist; round deletion is blocked while races exist.
- Shortened headings, descriptions, empty states, form notices, and confirmation copy.

## Segment 4 — Registry modules

Status: completed

- Redesign the Jockey and Referee directories.
- Keep unsupported workflows outside customer navigation.
- Jockeys and Referees now use role-filtered account directories with profile fields and server pagination at 20 rows.
- Added email search, account-status filters, responsive detail panels, and links to account management.
- Removed Horse and Prediction management from the Admin sidebar and workspace index because those workflows are not supported.

## Segment 5 — System QA

Status: completed

- Audited every Admin route for desktop, tablet, and mobile behavior.
- Verified focus states, reduced motion, table overflow, responsive forms, modal geometry, and loading, empty, error, and action feedback states.
- Removed the legacy generic Admin page, unused dashboard, and sample module data source.
- Consolidated active Admin styles in `src/Admin/admin.css` and removed obsolete Admin blocks from `src/App.css`.
- Confirmed every operational ledger uses 20-row pagination.
- Production build and static quality checks pass. Browser screenshot verification remains pending because the local preview connection was unavailable.
