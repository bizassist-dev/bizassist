# Session Boundary and Cross-User State Reset Masterplan (2026-03-12)

Status: Approved design
Scope: `mobile` auth transitions, app shell remount boundaries, user/business-scoped client state, POS and adjacent operational flows
Owners: Mobile Auth + POS + shared app-shell governance

## 1) Problem Statement

Operational screens can display stale data from a previous user session after logout/login transitions when client state survives across auth boundaries.

Observed failure mode:

- POS displayed item/cart/search remnants from the previous logged-out user after a new user logged in.

This is a cross-user state isolation failure and must be treated as a session-boundary governance issue, not only a POS screen bug.

## 2) Goals

- Guarantee that a newly authenticated user never sees stale client state from a previous user.
- Enforce deterministic client-state reset on auth-user changes.
- Apply the rule to POS first, but make the solution reusable for future feature flows.
- Preserve safe storage behavior without using blanket storage wipes.

## 3) Non-Goals

- No backend session model rewrite.
- No destructive full-device storage reset.
- No per-screen ad-hoc fixes as the primary strategy.

## 4) Root Cause Model

Cross-user UI remnants can survive through three client-side layers:

- Shared query cache survives auth transitions and hydrates the next user with stale business-scoped data.
- Mounted route trees preserve local React state across auth changes unless the shell remounts.
- Module-level ephemeral handoff stores can leak pending selections/edits across user switches.

## 5) Governance Decision

### 5.1 Session boundary rule

- Any auth-user change must be treated as a hard client session boundary.
- On session boundary change, the mobile app must:
  - clear session-scoped query cache
  - clear active business remnants from storage
  - clear ephemeral module handoff stores
  - remount the authenticated app shell so mounted screen-local state is discarded

### 5.2 Query-key scoping rule

- User/business-scoped operational queries must not rely on generic keys alone.
- Query keys for operational data should include the active business scope when the result set is business-dependent.
- If a global session-boundary purge exists, query scoping still remains mandatory for correctness and future resilience.

### 5.3 Screen-local state rule

- Long-lived operational screens with local state must reset when auth user or active business scope changes.
- Required examples include:
  - POS cart state
  - POS search query
  - open picker/modifier state
  - any pending scan/search parameter remnants

### 5.4 Ephemeral handoff rule

- Module-level handoff stores are allowed only if they expose explicit clear functions.
- Session-boundary cleanup must clear those stores centrally.
- Any new cross-screen handoff store introduced in future features must register with the same cleanup pattern.

### 5.5 Storage safety rule

- Do not use blanket `clearAll()` as the default session-reset strategy.
- Clear only session-scoped keys and ephemeral state required for cross-user isolation.
- Preserve unrelated durable preferences unless they are explicitly user-scoped.

## 6) Reference Implementation Shape

### 6.1 Central boundary

- Place canonical cleanup logic in a shared auth/session-boundary module.
- Trigger cleanup from the root app shell when the authenticated user identity changes.
- Use a session key on the authenticated navigator tree to force remount after user switch.

### 6.2 POS requirements

- POS catalog query key must include active business scope.
- POS phone/tablet screens must reset local cart/search/picker state when session scope changes.
- POS must not display previous-user cart or catalog remnants during login handoff.

### 6.3 Future feature requirements

- New operational flows must classify their state into:
  - query-cached state
  - mounted local UI state
  - module-level ephemeral handoff state
- All three categories must be reviewed for session-boundary safety before merge.

## 7) Acceptance Criteria

- Logout user A -> login user B must show no stale POS cart/search/catalog remnants from user A.
- Auth-user changes must clear query cache and ephemeral handoff stores before the next operational screen renders stale content.
- App-shell remount must discard mounted local screen state from the prior authenticated user.
- User/business-scoped operational queries must be keyed with the relevant scope.
- Future module-level handoff stores must provide central-clear compatibility.

## 8) QA Checklist

- User A logs in, populates POS cart/search, logs out, user B logs in -> POS opens without A remnants.
- User A opens POS quantity edit flow, logs out before completing, user B logs in -> no pending quantity edit leaks.
- User A opens discount selection flow, logs out, user B logs in -> no pending discount state leaks.
- Switching active business resets business-scoped POS operational state.
- Phone and tablet POS surfaces both pass the same session-boundary checks.

## 9) Risks and Mitigations

- Risk: over-clearing durable non-session preferences.
- Mitigation: clear only known session-scoped storage keys and ephemeral flow stores.

- Risk: future features add new module-level stores that bypass cleanup.
- Mitigation: require explicit clear function and session-boundary registration for every new handoff store.

- Risk: query keys remain under-scoped even with global purge.
- Mitigation: enforce business/user scoping for operational queries during implementation review.

## 10) Rollout Strategy

- Phase 1: central session-boundary purge + app-shell remount.
- Phase 2: scope high-risk operational queries and reset high-risk local state in POS.
- Phase 3: apply the same audit checklist to new operational features before release.

## 11) Locked Implementation Rules

- Cross-user stale UI is a severity-high UX/integrity defect.
- Fixes must target the session boundary first, not only the visible screen symptom.
- POS is the reference implementation, but the rule is global for future operational features.
- New feature work must pass a session-boundary isolation review before merge when it introduces cached, local, or handoff state.