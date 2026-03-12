Quick index:

- See **2026-03-05 — UI Padding Axis Terminology Lock (Masterplan + Memory)** for canonical x/y padding language mapping.
- See **2026-03-05 — Bottom Sheet vs Modal Selection Lock (Masterplan + Memory)** for canonical bottom sheet vs modal criteria.
- See **2026-03-05 — API Contract + State Management + File Structure Governance Lock (Masterplan + Memory)** for architecture contract stabilization and implementation sequencing.
- See **2026-03-05 — BizAssist SaaS Engineering Governance Framework Consolidation Lock** for canonical multi-layer governance coverage.
- See **2026-03-05 — BizAssist Architecture Lawbook Lock** for non-negotiable engineering laws.
- See **2026-03-05 — BizAssist Engineering Playbook Lock** for operational development workflow.
- See **2026-03-05 — Architecture Decision Records (ADR) System Lock** for canonical architecture-decision memory.
- See **2026-03-05 — BizAssist Technical Standards Manual Lock** for implementation standards enforcement.
- See **2026-03-05 — BizAssist Domain Model Bible Lock** for canonical domain entities and invariants.
- See **2026-03-05 — BizAssist System Invariants & Guardrails Lock** for fail-fast integrity constraints.
- See **2026-03-05 — BizAssist Feature Lifecycle Governance Lock** for mandatory stage-gate feature delivery.
- See **2026-03-05 — BizAssist Product Capability Map Lock** for canonical capability ownership boundaries.
- See **2026-03-05 — BizAssist Capability to Module to Workspace Mapping Lock** for structural feature placement governance.
- See **2026-03-07 — Scanner Frame-Gated Acceptance + POS Wrapper Flow Lock** for scanner in-frame acceptance and workspace-isolated scan routing.
- See **2026-03-07 — Universal Scan Action-Hub Lock** for non-contextual bottom-tab scanner behavior and dynamic post-scan action section governance.
- See **2026-03-07 — Scanner UI Layout and Screen Space Optimization Lock** for scanner zone layout, responsive scan-box sizing, and universal action section spacing governance.
- See **2026-03-12 — Session Boundary + Cross-User State Reset Lock** for logout/login isolation, query-cache purge, mounted-screen remount, and ephemeral state cleanup governance.
- See **2026-03-12 — Inventory Realtime Image Sync Lock** for product/service create-edit photo upload sequencing and query-cache patching governance.
- See **2026-03-12 — Realtime Invalidation Architecture Lock** for cross-device inventory/POS convergence via business-scoped websocket invalidation.
- See **2026-03-12 — Operational Sync Badge vs Pull-To-Refresh Lock** for Inventory/POS row-list sync UX governance under realtime invalidation.
- See **2026-03-12 — Auth Device Cap Lock** for install-scoped device binding and active-device session cap governance.
- See **2026-03-12 — Bottom Tab Bar Dock Geometry Lock** for the canonical floating dock, scan button, active indicator, icon sizing, and border treatment rules.
- See **2026-03-12 — Top Header Avatar Placement Lock** for where user-avatar placeholders belong in the app header hierarchy.

## 2026-03-12 — Bottom Tab Bar Dock Geometry Lock

### Memory Lock

- Canonical policy name is **Bottom Tab Bar Dock Geometry**.
- Canonical masterplan reference is:
  - `docs/MASTERPLAN_GUIDE.md` section `0.12 Bottom Tab Bar Dock Geometry (Locked)`

### Locked Decisions

- Bottom tab bar remains a floating dock with a detached scan button.
- Dock height is locked at `64`.
- Scan button size must mirror dock height exactly and must derive from the same source-of-truth value.
- Dock container inset must stay equal on both axes and is currently locked at `3`.
- Active indicator inset must stay equal on both axes and is currently locked at `2`.
- Dock-to-scan gap is locked at `8`.
- All four bottom-tab icons must use equal numeric size and are currently locked at `27`.
- Dock and scan button borders must use the same border color treatment.
- Dock, active indicator, and scan button borders must remain `StyleSheet.hairlineWidth`.
- The bottom tab bar background may use a glass/translucent treatment, but it must remain flat and non-reflective:
  - no top highlight sheen;
  - no bottom shade sheen;
  - keep only the translucent base fill plus subtle inner stroke.

### Enforcement

- Future bottom-tab-bar refactors must preserve these values unless the lock is explicitly revised in both memory and masterplan.

## 2026-03-12 — Top Header Avatar Placement Lock

### Memory Lock

- Canonical policy name is **Top Header Avatar Placement**.
- Canonical masterplan reference is:
  - `docs/MASTERPLAN_GUIDE.md` section `1.10.1 Top Header Avatar Placement Governance (Locked)`

### Locked Decisions

- Top-header avatar placeholders are allowed on workspace pages and list/index destination pages.
- Top-header avatar placeholders must not be shown by default on process screens, picker screens, detail screens, scan flows, or confirmation flows.
- The avatar is treated as an app-level identity anchor, not a universal decoration for every header.
- Reusable header APIs may support avatar placeholders, but screens must opt in deliberately.
- Custom right-header action clusters may include both an action button and an avatar only when the screen is a destination/index surface and the title remains visually balanced.

### Enforcement

- New header work must start from the rule: avatar on destination/index pages, no avatar on task/process flows.
- Any exception requires an explicit product reason and must preserve title centering and header action clarity.

## 2026-03-12 — Inventory Realtime Image Sync Lock

### Memory Lock

- Canonical policy name is **Inventory Realtime Image Sync**.
- Canonical masterplan reference is:
  - `docs/MASTERPLAN_GUIDE.md` section `3.4 Storage buckets and delivery policy (CDN + cache correctness)`

### Locked Decisions

- Inventory and service create/edit flows that upload a tile/photo after the main entity save must not invalidate list/detail queries before the image upload finishes.
- Required sequence is:
  - save base product/service
  - upload image
  - patch React Query caches with `primaryImageUrl` and a fresh `updatedAt`
  - invalidate inventory detail/list plus catalog/POS caches
  - navigate/return
- Inventory list-row thumbnails must use cache-busted public URLs derived from `updatedAt` so the latest uploaded image appears immediately.
- The same sequencing rule applies to both product and service flows to avoid parity regressions.

### Enforcement

- Any inventory photo/tile mutation that only invalidates queries after a base save, without a post-upload cache patch, is considered incomplete.
- Realtime image regressions must be fixed by correcting mutation sequencing and cache updates first, not by telling users to pull-to-refresh or revisit the detail screen.

## 2026-03-12 — Realtime Invalidation Architecture Lock

### Memory Lock

- Canonical policy name is **Realtime Invalidation Architecture**.
- Canonical masterplan reference is:
  - `docs/MASTERPLAN_GUIDE.md` section `3.7.1 Realtime Invalidation Governance (Locked)`

### Locked Decisions

- Cross-device operational convergence uses a business-scoped websocket invalidation channel.
- Realtime events are invalidation signals only, not authoritative data payloads.
- React Query remains the canonical client data layer; websocket messages only invalidate/refetch existing query keys.
- Phase 1 events are intentionally narrow:
  - `catalog.product.changed`
  - `inventory.stock.changed`
- Foreground polling remains as a slow fallback for reconnect gaps; it is no longer the primary convergence mechanism.
- Shared fanout now runs through Postgres `LISTEN/NOTIFY`, while each API instance only delivers websocket events to its own connected sockets.
- Multi-instance realtime correctness depends on publishing invalidation events through the shared Postgres channel, not through process-local memory alone.

### Enforcement

- New realtime work must preserve business scoping and must not bypass existing query-key governance with ad hoc state mutation.
- Any future transport replacement must preserve shared fanout semantics before realtime behavior can be treated as globally reliable across instances.

## 2026-03-12 — Operational Sync Badge vs Pull-To-Refresh Lock

### Memory Lock

- Canonical policy name is **Operational Sync Badge vs Pull-To-Refresh**.
- Canonical masterplan reference is:
  - `docs/MASTERPLAN_GUIDE.md` section `3.7.1 Realtime Invalidation Governance (Locked)`

### Locked Decisions

- Inventory and POS operational row lists use the page-title sync badge as the canonical live-sync indicator.
- Once realtime invalidation is active, those row lists must not attach native `RefreshControl` pull-to-refresh UI.
- Background refetch, websocket-triggered invalidation, or polling fallback must not visually pull the list downward or show a native refresh spinner.
- Explicit retry actions may remain on error/empty states, but passive sync must be badge-driven and layout-stable.
- Slow polling fallback may still exist for reconnect gaps, but it must remain visually silent on operational row lists.

### Enforcement

- Any operational Inventory/POS list that reintroduces native pull-to-refresh while the sync badge is present is a UX regression.
- Realtime/polling UX fixes must preserve row-list visual stability first; do not rely on native refresh spinners as passive sync feedback.

## 2026-03-12 — Auth Device Cap Lock

### Memory Lock

- Canonical policy name is **Auth Device Cap**.
- Canonical masterplan reference is:
  - `docs/MASTERPLAN_GUIDE.md` section `3.6.1 Auth Device Cap Governance (Locked)`

### Locked Decisions

- Device abuse protection is enforced at the auth/session boundary, not by inventory/POS feature screens.
- The canonical cap is the number of active refresh-token-backed devices per user.
- Mobile installs must persist a stable `deviceId` and send it on auth, authenticated API requests, and realtime websocket connects.
- Newly issued JWTs are device-bound; protected requests from a different device than the token payload are invalid.
- Settings includes a self-service device-management flow for listing and revoking active devices.
- Legacy pre-device-bound sessions may survive until refresh rotation, but all new sessions must be device-bound.

### Enforcement

- Future auth changes must not bypass `deviceId` propagation on login, refresh, or authenticated requests.
- Any alternative session store must preserve active-device cap enforcement before replacing the current refresh-token-backed implementation.

## 2026-03-12 — Session Boundary + Cross-User State Reset Lock

### Memory Lock

- Canonical policy name is **Session Boundary + Cross-User State Reset**.
- Canonical source document is:
  - `docs/features/SESSION_BOUNDARY_CROSS_USER_STATE_RESET_MASTERPLAN_2026-03-12.md`

### Locked Decisions

- Any auth-user change is a hard client session boundary.
- Session-boundary cleanup must clear:
  - query cache
  - active-business storage remnants
  - module-level ephemeral handoff stores
  - mounted authenticated route-tree state via shell remount
- User/business-scoped operational queries must include the relevant scope in query keys.
- Long-lived operational screens must reset local UI state when auth user or active business scope changes.
- Avoid blanket storage wipes; clear only session-scoped state and registered ephemeral flow stores.

### Enforcement

- Cross-user stale UI bugs must be fixed at the auth/session boundary first, not only at the visible screen.
- New operational features must review cached state, local state, and handoff state for session-boundary safety before merge.

## 2026-03-07 — Scanner Frame-Gated Acceptance + POS Wrapper Flow Lock

### Memory Lock

- Canonical policy name is **Scanner Frame-Gated Acceptance + POS Wrapper Flow**.
- Canonical masterplan reference is:
  - `docs/MASTERPLAN_GUIDE.md` section `3.0.1 Scanner Frame-Gated Acceptance Governance (Locked)`
- Canonical source document is:
  - `docs/features/SCAN_FRAME_GATED_SCANNER_FLOW_MASTERPLAN_2026-03-07.md`

### Locked Decisions

- Scanner must accept barcode events only when detector geometry places barcode center inside the scan frame.
- When geometry metadata is unavailable/unreliable, scanner must use conservative confirmation fallback before accepting.
- Scanner return payload contract remains:
  - `scannedBarcode` for barcode-field consumers
  - `q` for search consumers
  - preserve `returnTo` and `draftId`
- Workspace scan flow isolation is mandatory:
  - POS -> `/(app)/(tabs)/pos/scan`
  - Inventory -> `/(app)/(tabs)/inventory/scan`
  - POS scanner launches must not redirect to Inventory scan route.

### Enforcement

- New scanner behavior changes must preserve frame-gated acceptance rules and return-flow contract compatibility.
- Any route-level scan refactor must maintain workspace isolation and deterministic exit to origin flow.

## 2026-03-07 — Universal Scan Action-Hub Lock

### Memory Lock

- Canonical policy name is **Universal Scan Action-Hub**.
- Canonical masterplan reference is:
  - `docs/MASTERPLAN_GUIDE.md` section `3.0.2 Universal Scan Action-Hub Governance (Locked)`
- Canonical source document is:
  - `docs/features/UNIVERSAL_SCAN_ACTION_HUB_MASTERPLAN_2026-03-07.md`

### Locked Decisions

- Scanner launch intent must be explicit: `scanIntent=contextual` or `scanIntent=universal`.
- Contextual launches keep direct return behavior (no post-scan action section).
- Universal launches show post-scan dynamic action section after capture.
- Universal action section must include editable barcode value and focused barcode-heavy actions.
- Barcode editability is allowed in universal mode with GTIN sanitization/validation guardrails.
- V1 requires no Prisma schema change and no mandatory API contract change.

### Enforcement

- Scanner feature changes must preserve contextual determinism and universal action-hub behavior separation.
- Action list expansion must remain controlled; avoid bloated generic action menus.

## 2026-03-07 — Scanner UI Layout and Screen Space Optimization Lock

### Memory Lock

- Canonical policy name is **Scanner UI Layout and Screen Space Optimization**.
- Canonical masterplan reference is:
  - `docs/MASTERPLAN_GUIDE.md` section `3.0.3 Scanner UI Layout and Screen Space Optimization Governance (Locked)`
- Canonical source document is:
  - `docs/features/SCAN_UI_LAYOUT_SCREEN_SPACE_OPTIMIZATION_MASTERPLAN_2026-03-07.md`

### Locked Decisions

- Scanner layout follows 3 zones: top helper row, flexible scan canvas, bottom universal action hub.
- Universal action hub appears only in universal mode post-capture.
- Scan box sizing is responsive and bounded by phone/tablet target ranges.
- Bottom tab bar and safe-area reservation is mandatory for universal action hub placement.
- CTA density in universal action hub stays focused with controlled visible action count.

### Enforcement

- Scanner UI changes must preserve 3-zone structure and avoid tab-bar overlap.
- Device-specific spacing must be solved with bounded responsive sizing, not one-off hardcoded offsets.

## 2026-03-05 — UI Padding Axis Terminology Lock (Masterplan + Memory)

### Memory Lock

- Canonical policy name is **UI Padding Axis Terminology**.
- Canonical masterplan reference is:
  - `docs/MASTERPLAN_GUIDE.md` section `0.11 UI Padding Axis Terminology (Locked)`

### Locked Terminology Mapping

- `x padding` means horizontal padding (x-axis).
- `y padding` means vertical padding (y-axis).

### Enforcement

- Future UI/layout instructions and implementation decisions must apply this mapping by default unless explicitly overridden.

## 2026-03-05 — BizAssist Capability to Module to Workspace Mapping Lock

### Memory Lock

- Canonical policy name is **BizAssist Capability to Module to Workspace Mapping**.
- Canonical masterplan reference is:
  - `docs/MASTERPLAN_GUIDE.md` section `0.10 Capability to Module to Workspace Mapping (Locked)`
- Canonical source document is:
  - `docs/CAPABILITY_MODULE_WORKSPACE_MAPPING.md`

### Locked Schema

- Capability
- Sub Capability
- Backend Module
- Mobile Workspace
- Primary Screens
- Domain Entities
- System Invariants

### Locked Platform Boundaries

- Mobile workspaces are:
  - Home
  - Inventory
  - POS
  - Settings
- Tabs are workspace selectors, not screen navigators.
- Backend modules are feature-first and ownership-scoped.

### Enforcement

- Every feature must be mapped to capability, backend module, mobile workspace, entities, and invariants before implementation.
- Multi-module features must declare one primary owner module.
- No new modules without architecture review.
- No duplicated domain logic across modules.
- No UI features outside defined workspaces.

## 2026-03-05 — BizAssist Product Capability Map Lock

### Memory Lock

- Canonical policy name is **BizAssist Product Capability Map**.
- Canonical masterplan reference is:
  - `docs/MASTERPLAN_GUIDE.md` section `0.9 Product Capability Map (Locked)`
- Canonical source document is:
  - `docs/PRODUCT_CAPABILITY_MAP.md`

### Locked Scope

- Capability coverage is defined using Level 1 -> Level 2 -> Level 3 structure only.
- Every Level 3 capability must declare:
  - owner surface
  - mobile ownership
  - API ownership
  - DB ownership
  - entities
  - invariants
  - exclusions/notes

### Locked Alignment

- inventory-first architecture
- tablet-first UX
- append-only inventory ledger
- UDQI quantity invariants
- archive-only lifecycle
- tabs as workspace selectors
- no drawers/modals/dropdowns as primary operational patterns
- AI assistive-only behavior

### Ownership Law Lock

- Settings owns lifecycle of categories, units, discounts, modifiers, and policy placeholders.
- Inventory workspace owns catalog operational lifecycle and stock movement processes.
- POS workspace owns cart/checkout/sale finalization and inventory movement integration from checkout.
- Home workspace is entry and quick-actions only.

### Enforcement

- No feature may enter implementation without capability assignment in the Product Capability Map.
- Capability overlap must define a primary owner capability and secondary integration points.

## 2026-03-05 — BizAssist Feature Lifecycle Governance Lock

### Memory Lock

- Canonical policy name is **BizAssist Feature Lifecycle Governance**.
- Canonical masterplan reference is:
  - `docs/MASTERPLAN_GUIDE.md` section `0.8 Feature Lifecycle Governance (Locked)`
- Canonical source document is:
  - `docs/FEATURE_LIFECYCLE_GOVERNANCE.md`

### Locked Lifecycle

- Idea -> Discovery -> Decision -> Feature Ticket -> Implementation -> Release -> Iteration
- Stage skipping is prohibited.

### Locked Stage Governance

- Decision outcomes are constrained to `Approved`, `Rejected`, `Deferred`.
- ADR coverage is required for architecture-impacting features.
- Approved features require structured ticket fields:
  - context anchor
  - feature idea
  - mode selection
  - ownership boundaries
  - technical constraints
  - acceptance criteria
  - regression targets

### Enforcement

- Implementation must align with:
  - Architecture Lawbook
  - ADRs
  - Domain Model Bible
  - System Invariants & Guardrails
  - Technical Standards Manual
- Release requires completed regression checks and invariant verification.
- Significant behavior changes require architecture review.
- Features must remain reversible (disable/rollback path).

## 2026-03-05 — BizAssist System Invariants & Guardrails Lock

### Memory Lock

- Canonical policy name is **BizAssist System Invariants & Guardrails**.
- Canonical masterplan reference is:
  - `docs/MASTERPLAN_GUIDE.md` section `0.7 System Invariants & Guardrails (Locked)`
- Canonical source document is:
  - `docs/SYSTEM_INVARIANTS_GUARDRAILS.md`

### Locked Invariant Scope

- inventory invariants (movement-derived stock; no direct stock mutation)
- quantity invariants (UDQI precision; fixed-point quantities; no float storage)
- financial invariants (sale totals and payment reconciliation)
- pricing invariants (time-of-sale price snapshot immutability)
- modifier invariants (price-only effect)
- sale finality invariants (immutable completed sales)
- lifecycle invariants (archive-only transitions)
- authorization invariants (authenticated user + activeBusinessId + membership)
- media invariants (signed upload URLs and deterministic paths)

### Guardrail Enforcement

- Invariants are enforced at API validation, service-layer checks, and database constraints.
- Client-side validation alone is insufficient.
- Any invariant violation must fail immediately; silent correction is prohibited.

### Observability

- Every invariant violation must log:
  - violation type
  - affected entity
  - user context
  - request correlationId

## 2026-03-05 — BizAssist Domain Model Bible Lock

### Memory Lock

- Canonical policy name is **BizAssist Domain Model Bible**.
- Canonical masterplan reference is:
  - `docs/MASTERPLAN_GUIDE.md` section `0.6 Domain Model Bible (Locked)`
- Canonical source document is:
  - `docs/DOMAIN_MODEL_BIBLE.md`

### Locked Domain Principles

- inventory-first architecture
- append-only inventory ledger
- UDQI quantity invariants using fixed-point integers governed by `Unit.precisionScale`
- archive-only lifecycle (`ACTIVE`, `ARCHIVED`)

### Canonical Entity Scope

- User
- Business
- StaffMembership
- Product
- Unit
- Category
- ModifierSet
- ModifierOption
- Sale
- SaleLineItem
- Payment
- InventoryMovement

### Invariant Enforcement

- Inventory is derived from movement ledger records; direct stock edits are prohibited.
- Sale line pricing is immutable at time-of-sale snapshot.
- Modifiers are price-only and must not mutate inventory quantities.
- Completed sales are immutable and must preserve linked inventory movements.

### Enforcement

- Domain model compliance is mandatory across API, mobile, database schema, reporting, analytics, and AI read paths.
- If implementation contradicts the Domain Model Bible, implementation must be corrected before merge.

## 2026-03-05 — BizAssist Technical Standards Manual Lock

### Memory Lock

- Canonical policy name is **BizAssist Technical Standards Manual**.
- Canonical masterplan reference is:
  - `docs/MASTERPLAN_GUIDE.md` section `0.5 Technical Standards Manual (Locked)`
- Canonical standards document is:
  - `docs/TECHNICAL_STANDARDS_MANUAL.md`

### Locked Scope

The Technical Standards Manual is now a required governance layer and defines enforceable standards for:

- code style
- project structure
- API design
- database conventions
- data integrity
- mobile architecture implementation
- navigation behavior
- performance
- security
- media pipeline
- logging
- testing
- error handling
- documentation
- PR governance enforcement

### Enforcement

- Technical standards compliance is mandatory for all pull requests.
- Non-compliant code must be corrected before merge.

## 2026-03-05 — Architecture Decision Records (ADR) System Lock

### Memory Lock

- Canonical policy name is **BizAssist Architecture Decision Records (ADR) System**.
- Canonical masterplan source is:
  - `docs/MASTERPLAN_GUIDE.md` section `0.4 Architecture Decision Records (ADR) System (Locked)`
- Canonical ADR directory is:
  - `docs/architecture/adr/`
- ADR is official architecture memory and must be used to explain strategic decisions.

### Locked Rules

- ADRs are required for strategically significant architecture decisions (system, data, product, infrastructure, cross-system governance, AI architecture).
- ADR numbering is sequential and immutable (`ADR-0001`, `ADR-0002`, ...).
- ADR records are never deleted or renumbered.
- ADR status lifecycle is constrained to:
  - Proposed
  - Accepted
  - Deprecated
  - Superseded
  - Rejected
- To change a prior accepted decision, create a new ADR and mark the prior ADR as superseded.
- Minor non-strategic changes do not require ADRs.

### Locked Canonical Set

- ADR-0001 through ADR-0016 are established as canonical baseline architecture decisions.

## 2026-03-05 — BizAssist Engineering Playbook Lock

### Memory Lock

- Canonical policy name is **BizAssist Engineering Playbook**.
- Canonical source is:
  - `docs/MASTERPLAN_GUIDE.md` section `0.3 BizAssist Engineering Playbook (Locked)`
- Relationship lock:
  - Architecture Lawbook = non-negotiable rules
  - Engineering Playbook = operational workflow and execution discipline

### Locked Operational Discipline

- Mandatory feature workflow:
  - Idea → Discovery → Architecture Design → Masterplan Approval → Implementation → Review → Merge
- Discovery must complete before implementation and include:
  - user flow
  - affected modules
  - data model impact
  - mobile screen impact
- Masterplan approval is a hard gate before coding.
- PR review must enforce architecture, business-logic placement, DB safety, API compatibility, React Query governance, UI architecture, repository structure, and performance checks.
- Debugging must follow root-cause workflow (reproduce, isolate layer, trace data flow, fix cause).
- Refactors must improve maintainability without unintended behavior drift.
- Dead code deletion is required after usage validation.
- Migration/API change/state/form/performance/security/documentation procedures are mandatory operational checks.

### Enforcement

- Playbook compliance is required for daily engineering execution.
- Non-compliant changes must be corrected before merge.

## 2026-03-05 — BizAssist Architecture Lawbook Lock

### Memory Lock

- Canonical policy name is **BizAssist Architecture Lawbook**.
- Lawbook status is **non-negotiable** and applies to all contributors across:
  - product UX
  - mobile architecture
  - backend services
  - API contracts
  - repository/file structure
- The canonical law set is persisted in:
  - `docs/MASTERPLAN_GUIDE.md` section `0.2 BizAssist Architecture Lawbook (Locked)`
- Enforcement lock:
  - any change violating lawbook rules must be redesigned before acceptance
  - lawbook rules are mandatory constraints, not optional guidance

### Locked Coverage

- 20 architecture laws are now formally locked, including:
  - feature ownership
  - feature-first modular architecture
  - thin controllers
  - database-only repositories
  - backward-compatible API contracts
  - React Query server-state ownership
  - local UI-state boundaries
  - continuous-scroll sectioned forms
  - primary CTA clarity
  - stable entity identity
  - safe schema evolution
  - lifecycle over deletion
  - endpoint ownership clarity
  - module decoupling
  - predictable repository structure
  - structured readable errors
  - mutation-driven cache updates
  - generic shared components
  - performance-by-design
  - mandatory architecture discipline

## 2026-03-05 — BizAssist SaaS Engineering Governance Framework Consolidation Lock

### Memory Lock

- Canonical policy name is **BizAssist SaaS Engineering Governance Framework**.
- Canonical architecture coverage is a **6-layer governance model** (normalized from prior “five-layer” phrasing):
  - Product UI / UX System Governance
  - Backend Architecture Governance
  - Data Model Governance
  - Platform Integration Governance
  - Mobile Engineering Governance
  - Repository / File Structure Governance
- This framework is the standing architecture discipline for:
  - product UX consistency
  - mobile architecture predictability
  - backend service ownership clarity
  - API contract stability
  - repository maintainability and scalability

### Locked Audit Conclusion

- After consolidation review, governance coverage is complete across all six layers.
- No governance layer is missing.
- Future governance additions must extend one of the six canonical layers and avoid creating parallel governance taxonomies.

## 2026-03-05 — API Contract + State Management + File Structure Governance Lock (Masterplan + Memory)

### Memory Lock

- Canonical policy name is **API Contract + State Management + File Structure Governance Lock**.
- This lock governs architecture boundaries between `BizAssist_api` and `BizAssist_mobile` for:
  - API contract stability and backward compatibility
  - client-side server state governance (React Query)
  - feature-first file structure and module ownership boundaries

### Locked Findings Baseline (Audit Snapshot)

- `P0` API error/response envelope drift exists and must be normalized:
  - some endpoints return `success + message` without canonical `error.code`
  - not-found, auth unauthorized responses, and health endpoints are not envelope-aligned with the canonical client expectation
- `P1` endpoint namespace drift exists:
  - configuration domains are mounted as top-level routes (`/categories`, `/units`, `/discounts`, `/taxes`) instead of explicit settings-owned namespace contracts
- `P1` list contract drift exists:
  - multiple list endpoints accept filters/limits but do not return canonical pagination metadata
- `P1` mobile state governance drift exists:
  - many write operations are executed directly inside screen handlers instead of React Query mutation hooks
  - ad hoc literal query keys are used in invalidation paths instead of centralized query key factories
- `P1` file structure drift exists:
  - route layer contains heavy feature logic instead of thin wrappers in several settings/inventory routes
  - duplicated ownership surfaces exist (for example duplicated business context card variants and mixed `features` + `modules` patterns)
- `P2` stale/legacy structure indicators exist:
  - empty/stale backend feature folders and compatibility parsing paths indicate historical contract drift

### Locked Implementation Sequence

- Phase 1 — Contract normalization:
  - enforce one API success envelope and one error envelope across all non-exempt endpoints
  - enforce canonical structured errors (`error.code`, `error.message`) with backward-compatible transitional mapping where needed
- Phase 2 — Namespace and ownership normalization:
  - migrate configuration endpoints to settings-owned namespace contracts
  - keep compatibility aliases temporarily with explicit deprecation window
- Phase 3 — Pagination and list contract hardening:
  - add consistent list metadata contracts across list endpoints
  - update mobile API clients to consume canonical metadata while preserving compatibility behavior during migration
- Phase 4 — Mobile state governance hardening:
  - move screen-level writes to domain mutation hooks
  - centralize and enforce query key factories; remove ad hoc literal keys
- Phase 5 — File structure conformance:
  - restore thin route wrappers
  - relocate feature logic to module-owned screen/hook/api folders
  - remove stale/duplicate files after safe migration and verification
- Phase 6 — Governance enforcement:
  - add architecture PR gates for API envelope checks, query-key checks, and file-ownership checks
  - add contract tests to prevent regression

### Non-Negotiable Compatibility Guardrails

- Do not break existing deployed mobile clients during migration.
- Preserve auth/session behavior while error envelope normalization is introduced.
- Preserve navigation laws (`Back vs Exit`), Busy Overlay behavior, and tablet-first UI governance while state/file refactors are applied.

## 2026-03-05 — Manual Variation-First Mode Lock (Masterplan + Memory)

### Memory Lock

- Canonical policy name is **Manual Variation-First Mode Lock**.
- Item authoring must support two valid variation paths:
  - **Option-driven path** (select option sets + values, then generate combinations)
  - **Manual variation-first path** (create named variations directly without option sets)
- Manual-first enablement lock:
  - users may create variations even when no option sets are selected
  - manual variation creation must remain available from create-item and edit-item flows
- Visibility lock when manual-only mode is active:
  - if variations exist and selected option-set count is `0`, options setup controls must be hidden
  - the section title should shift to a `Variations` state (not options setup)
- Save/persistence lock:
  - manual-only variations persist through the manual sync path
  - option-generated variations persist through the variation generation path
- Safety lock:
  - duplicate manual variations must be blocked by canonical key/label duplicate checks
  - deterministic return and process-screen closure rules remain mandatory

## 2026-03-05 — Square-Style Options & Variations Procedure Alignment (Masterplan + Memory)

### Memory Lock

- Canonical policy name is **Square-Style Options & Variations Procedure Alignment**.
- External behavioral reference is Square Help US guidance for item options/variations flow (notably article `6689` and linked POS app procedures):
  - create/select reusable option sets
  - ensure option sets have option values
  - select values per set
  - create variations from option-set/value combinations
  - use add-variation only for valid not-yet-existing combinations
- BizAssist authoring sequence is locked to:
  - `Create/Edit Item`
  - `Options` (`Add Options` or `Edit Options`)
  - `Select options`
  - `Create option` (optional)
  - per-set `Option values`
  - `Create variations`
  - optional `Add variation` for one additional constrained combination
  - return to item authoring with refreshed variations
- Flow-gating lock:
  - `Create variations`/`Add variation` actions must stay disabled until each selected option set has at least one selected value.
  - If variation count is `0`, the variation CTA opens `Create variations` (bulk combination generation).
  - If variation count is `>0`, the variation CTA opens `Add variation` (single combination picker).
- Duplicate-protection lock:
  - add-variation must always block duplicates by canonical `variationKey` and show explicit duplicate feedback.
- Empty-state lock:
  - if add-variation has no eligible option-set selections, it must provide deterministic guidance and a direct path back to `Select options`.
- Terminology lock:
  - copy should consistently use `option set`, `option values`, and `variations` aligned with POS mental model.

## 2026-03-05 — Option-Driven Variation Authoring Finalization (Masterplan + Memory)

### Memory Lock

- Canonical policy name is **Option-Driven Variation Authoring Finalization**.
- This lock supersedes the narrower 2026-02-28 v1 interpretation where option/variation authoring excluded variation-level stock handling in the item authoring flow.
- `Options` is the canonical authoring source for **option-generated variations** in BizAssist.
- `Variations` is the resulting sellable combination list produced from selected option values.
- Canonical connected flow is locked to this deterministic sequence:
  - `Create Item` / `Edit Item`
  - `Options` section entry (`Add options` or `Edit`)
  - `Select options`
  - `Create option` (optional)
  - per-set `Option values`
  - `Create variations`
  - return to `Create Item` / `Edit Item` with updated `Variations`
- Screen-state rule:
  - when no option sets are attached, the parent item flow should show the `Options` section as the primary setup entry
  - `Variations` should appear only after a valid option-driven variation result exists, or when returning from a variation generation/update process
- Option-set authoring rule:
  - reusable option sets and reusable option values remain the source of truth
  - `Create option` requires Option set + Display name + at least one option value
  - option values support inline add, inline edit, remove, and deterministic reorder
- Option-value selection rule:
  - each attached option set must have at least one selected value before variation generation
  - duplicate labels inside the same option set are invalid
  - per-set detail supports search, value selection, inline add value, and explicit `Done`
- Variation generation rule:
  - generated combinations are derived only from attached option sets and selected option values
  - duplicate combinations must be blocked by canonical `variationKey` semantics
  - `Create variations` must separate valid `Update existing variations` outcomes from `New variations` outcomes when prior variations already exist
  - expanding option values must not silently destroy still-valid existing variations
- `Add variation` rule:
  - in the option-driven model, `Add variation` is a constrained combination picker, not a free-form manual variation
  - it may create only a valid not-yet-existing combination across attached option sets
  - attempts to create an already-existing combination must fail locally with explicit duplicate feedback (modal or equivalent governed feedback)
- Ownership lock:
  - mobile Options module owns the reusable option-set/value selection and authoring UI flow
  - API Catalog module owns product-linked option attachment, variation preview, and persisted generated variation writes
  - Inventory owns stock movement only
- Variation stock lock:
  - variation rows may expose `Manage Stock` drill-in in item authoring and edit flows
  - stock movement semantics remain inventory-governed and must not be re-authored inside the options feature itself
- Governance lock:
  - no dropdowns or drawers in operational authoring flows
  - drill-in process screens only
  - deterministic closure (`Exit`/`Back`/`Done`/`Next`/`Create`)
  - Busy/Loading Overlay and double-tap prevention remain mandatory for async writes
  - UDQI, tablet-first layout governance, POS architecture, and modifier governance remain unchanged

## 2026-03-05 — Currency Display Context Governance (Masterplan + Memory)

### Memory Lock

- Canonical policy name is **Currency Display Context Governance**.
- Currency display must be **context-aware**, not symbol-only everywhere.
- Default operational rule:
  - day-to-day POS, catalog, item authoring, and routine operational UI uses **compact money display**
  - compact money display means **money symbol first** when unambiguous (example: `$12.00`)
- Explicit financial rule:
  - audit, finance, reporting, exports, invoices, settlements, and any multi-currency comparison surface must use **explicit money display**
  - explicit money display means **currency code + amount** (example: `USD 12.00`)
- Ambiguity rule:
  - if symbol-only display is ambiguous or not available, fallback remains code-based display
- Implementation lock:
  - all app money display must route through shared money formatters
  - no ad-hoc per-screen currency prefix stripping or string concatenation
  - shared formatters must support both `compact` and `explicit` display modes
- Current product default:
  - existing mobile operational surfaces remain on compact display unless a feature is explicitly classified as finance/audit/multi-currency

## 2026-03-04 — POS Numeric Bottom Sheet Keyboard Lock (Masterplan + Memory)

### Memory Lock

- The canonical reusable pattern for this keyboard is **POS Numeric Bottom Sheet Keyboard**.
- The implementation/component name is **BAIPosNumpadSheet**.
- Scope lock:
  - all number inputs
  - all money inputs
  - default numeric entry surface for operational forms moving forward
- UI/behavior lock:
  - bottom-sheet surface anchored to bottom
  - 3x4 numeric grid (`1-9`, `00`, `0`, backspace)
  - explicit confirm key (`check`) in-sheet
  - received/value preview remains in host screen; keypad only handles digit input events
- Money-governance compatibility lock:
  - existing money precision, formatting, and cap rules remain mandatory
  - this keyboard standard governs input surface/pattern, not money validation semantics
- Reuse rule:
  - feature screens must reuse this pattern/component instead of recreating ad-hoc numeric keypads
  - visual tuning should be token-based and minimal, preserving core structure and key order
- Forward-use allowance lock:
  - bottom sheets and modals are approved UI interaction surfaces moving forward
  - teams may implement either pattern when it best fits the task flow, as long as interaction remains deterministic and token-based
  - prefer reuse of existing shared components/patterns before creating new bespoke overlays
  - selection criteria are governed by **Bottom Sheet vs Modal Selection Lock (2026-03-05)**

## 2026-03-05 — Bottom Sheet vs Modal Selection Lock (Masterplan + Memory)

### Memory Lock

- Bottom sheets and modals are both approved interaction patterns.
- Selection rule:
  - use a bottom sheet for lightweight, context-adjacent actions that should keep host-screen continuity
  - use a modal for disruptive or focus-critical tasks that require stronger isolation/confirmation
- Determinism rule:
  - each chosen pattern must preserve clear completion and dismissal behavior
  - implementation remains token-based and compliant with overlay/navigation governance

## 2026-03-04 — Stable First-Mount Scaffold (Masterplan + Memory)

### Memory Lock

- The canonical reusable pattern for reducing initial screen transition flicker is **Stable First-Mount Scaffold**.
- The implementation term for this pattern is **Single-Tree State Rendering**.
- Locked rendering rules:
  - keep the first-render screen frame mounted and stable
  - avoid swapping between wrapper components for the same route just to support device/layout variants
  - keep one list/card subtree mounted across loading, error, empty, and data states when feasible
  - swap only the inner state content (`ListEmptyComponent`, inline state box, overlays, inner children) instead of replacing the whole surface
- Use this pattern in addition to the broader **Flicker-Free Initial Screen Transition** rules when the flicker is caused by first-mount tree replacement.
- Discounts ledger reference:
  - render the ledger route directly and pass `layout` as a prop instead of swapping route wrapper components
  - keep the `FlatList` mounted while state content changes inside one stable list shell

## 2026-03-04 — Flicker-Free Initial Screen Transition Lock (Masterplan + Memory)

### Memory Lock

- The approved fix pattern for first-open screen transition flicker is **Flicker-Free Initial Screen Transition**.
- Root cause class:
  - first-frame layout shifts from late safe-area inset resolution
  - cold-query loading branch swaps on first open
  - header ownership mismatch between stack header and in-screen header
- Locked implementation rules:
  - seed `SafeAreaProvider` with `initialWindowMetrics`
  - `BAIHeader` must not render with a smaller top inset than the initial safe-area metric
  - do not introduce duplicate header ownership to “fix” transitions; prefer one stable header strategy per navigation path
  - when a route hides the stack header, declare `headerShown: false` in the navigator layout for that route instead of setting `Stack.Screen` header overrides from inside the screen component on first render
  - prefetch first-open drill-in data when the parent process screen is already known
  - keep the destination screen scaffold stable while only the inner list/content state changes
- Navigator header visibility lock:
  - route-level header visibility must be known before the push animation starts
  - runtime header visibility flips from inside the mounted screen are a known source of one-frame header flash/flicker
- Modifiers flow reference:
  - `ModifierGroupUpsertScreen` prefetches Apply Set data
  - `ModifierGroupApplySetPickerScreen` stays on the stack-managed header path
  - `BAIHeader` top inset is clamped against initial metrics to prevent first-frame jump
- Discounts flow reference:
  - discounts ledger routes hide the stack header in the stack layout, not through in-screen `Stack.Screen` overrides

## 2026-03-03 — BAINeutralCheckbox Design Lock (Masterplan + Memory)

### Memory Lock

- The current `BAINeutralCheckbox` is approved as the canonical neutral checkbox pattern for BizAssist.
- Visual lock:
  - unchecked = outline only
  - checked = solid filled
  - shape = square with softened corners
  - check glyph = bold
- Contrast lock:
  - light mode = dark outline/fill with light check contrast
  - dark mode = light outline/fill with dark check contrast
- Reuse rule:
  - this component is the source of truth for neutral checkbox selection UI
  - feature screens must reuse `BAINeutralCheckbox` instead of re-implementing local checkbox styles

## 2026-03-03 — Lifecycle Eligibility Gating (Masterplan + Memory)

### Memory Lock

- Canonical product concept for conditional destructive actions is **Lifecycle Eligibility Gating**.
- Canonical UI/action pattern is **Eligibility-Gated Destructive Action**.
- Hard delete may be offered only when an entity is provably **unused and unreferenced**:
  - no active attachments/dependencies
  - no historical operational usage
  - no meaningful draft/template/workflow references that should preserve it
- If hard-delete eligibility is false, the destructive action must fall back to the reversible lifecycle action (typically **Archive**).
- Backend must remain the source of truth for deletion eligibility. UI should consume an explicit capability (for example `canHardDelete`) plus an optional blocking reason instead of inferring from visible counts alone.
- Copy lock:
  - `Delete` = permanent and non-restorable
  - `Archive` = reversible and restorable
- This rule is reusable across feature flows, but it does **not** override archive-only governance for ledger-referenced configuration entities. Archive-only entities remain non-deletable even when currently unreferenced.
- Modifiers may adopt this pattern for modifier sets/options only when they have never been used and have no live references; otherwise they remain archive-governed.

## 2026-03-02 — Variation Stock State + Items Closure Behavior Lock (Photo-Referenced)

### Memory Lock

- The newly uploaded `Adjust stock` + `Stock received` sequence is approved as an additional canonical behavior reference for this cycle.
- `Stock received` state lock:
  - Header action `Done` is enabled only when `Received` is greater than `0`.
  - When `Received` is `0`, `Done` is disabled and `New total` remains equal to `Current stock`.
  - Numeric keypad flow remains in-screen with explicit confirm key and supports direct integer entry.
  - `New total` updates immediately from `Current stock + Received`.
- `Adjust stock` sold-out lock:
  - When `Mark as sold out at this location` is ON, `Choose a time to mark for sale again` is shown with current schedule summary (e.g., `None`).
  - When sold-out is OFF, the schedule row is hidden.
  - `Save` is stateful and disabled when no effective change exists.
- `Schedule` picker lock:
  - Options remain mutually exclusive: `None` and `Specify a time and date`.
  - Selection uses single-choice radio semantics with deterministic `Done` closure.
- Variation form return lock:
  - Completing `Stock received` returns to variation create/edit flow with `Stock on hand` reflecting the resolved quantity.
- Surface closure/navigation lock:
  - The `More -> Items` path remains the canonical non-checkout management entry for item administration surfaces.
  - After lifecycle completion/exit from item authoring, closure should land users on governed Items surfaces (not undefined intermediate routes).

## 2026-03-02 — Options/Variations + Variation Stock UX Reference Lock (Photo-Referenced, Consolidated)

### Memory Lock

- The uploaded UI sequence is approved as the canonical behavior reference for options/variations authoring and variation-level stock adjustment flow in this cycle.
- Item Option management reference is locked to these structures:
  - `Options` ledger shows option-set rows with right-side option count (e.g., `2 options`, `3 options`) and drill-in chevron.
  - `Select options` allows enabling reusable option sets via row toggles, with an explicit `Create option` action.
  - Newly created sets appear in a draggable selected block with summary subtitles and chevron drill-in.
  - Remaining reusable sets appear under `Options` with toggle activation.
  - `Next` is enabled when at least one option set is selected.
  - Option-set value selection supports `All options` plus per-value multi-select with checkmark indicators.
- `Create option` authoring behavior is locked:
  - `Create` remains disabled until Option set + Display name + at least one option value are provided.
  - Option values support inline add, inline text edit, remove action, and drag-handle reorder.
  - Once set name exists, values section header reflects contextual naming (e.g., `Shirt options`).
- `Create variations` generation behavior is locked:
  - Generated combinations are listed with per-row checkbox controls plus `All variations` master select.
  - `Create` commits selected combinations back to the item draft.
- Variation management reference is locked to these structures:
  - `Edit Item` → `Variations` list presents each variation row with `Manage Stock` action.
  - `Create variation` includes a `Stock on hand` row that enters the same stock-management process.
  - `Done` remains disabled until required variation fields are valid.
  - A valid variation save enables `Done` and returns to item draft with new variation row.
- `Adjust stock` flow lock:
  - Primary control is `Mark as sold out at this location` toggle.
  - When sold-out is OFF, schedule controls are hidden.
  - When sold-out is ON, `Choose a time to mark for sale again` row is shown.
  - Schedule summary value supports either `None` or a concrete localized datetime string.
- `Schedule` picker flow lock:
  - Two mutually exclusive choices: `None` and `Specify a time and date`.
  - Selecting `Specify a time and date` reveals editable `Date` and `Time` rows.
  - Date/time editing uses modal pickers and updates a sentence-case confirmation summary before Done.
- `Stock received` flow lock:
  - Screen shows `Current stock`, editable `Received`, and computed `New total`.
  - Dedicated numeric keypad flow supports direct quantity entry and explicit confirm key.
  - Entered `Received` value immediately updates `New total`.
  - Completing stock entry returns to variation form with `Stock on hand` rendered as the resolved quantity (e.g., `800`).
  - `Done` remains disabled when no effective received quantity is entered.
- Item draft outcome lock after save path:
  - `Options` section shows selected sets with comma-separated value summaries.
  - `Variations` section shows generated combinations and stock-management affordance per row.
  - Item appears in Checkout Library with aggregated price-count label (e.g., `6 Prices`) when multiple variation prices exist.
- Process-control lock:
  - Top-right completion actions (`Save`/`Done`) are stateful (enabled only when form state is valid/dirty).
  - Deterministic closure pattern remains required (back/close affordance on left, commit action on right).

## 2026-02-28 — Option + Variation Feature Design Finalization (Masterplan + Memory)

### Memory Lock

- Option + Variation is finalized for BizAssist v1 as a **catalog definition + attach** feature.
- Canonical ownership split:
  - Options module owns reusable option-set and option-value catalog management.
  - Catalog module owns attaching selected option sets and persisted variations during Item/Service save.
  - Inventory module remains the owner of stock movement only.
  - POS module must not own option authoring or variation selection in v1.
- Canonical user flow is locked to deterministic drill-in screens:
  - Select Options
  - Option Values
  - Create Variations
  - Add Variation
- The Square-style reference is approved only as a conceptual reference for authoring flow, not as a direct scope copy.
- Explicit v1 non-goals remain locked:
  - no variation-level stock management
  - no sold-out scheduling for variations
  - no variation-level price/cost overrides
  - no POS variation runtime selection
- Inventory and Settings parity remains mandatory where the flow exists in both contexts.
- All option/variation screens must preserve tablet-first governance, deterministic `replace()` closure, and Busy/Loading Overlay protection for async writes.

## 2026-02-25 — Toast Placement Governance (Top-First Lock)

### Memory Lock

- Default transient completion feedback (toast/snackbar) must render at the top of the screen.
- Bottom placement is disallowed by default in operational flows where the bottom area is shared by tab bars, bottom sheets, or keyboard surfaces.
- This lock is especially enforced for Modifiers flows to avoid overlap with bottom sheets and action controls.
- Any exception must be explicitly documented with a concrete UX reason before implementation.

## 2026-02-24 — Money Input Package Evaluation Lock (react-native-currency-input)

### Memory Lock

- `react-native-currency-input` is approved for implementation behind the existing `BAIMoneyInput` abstraction (no direct feature-screen imports).
- Migration must preserve current screen-level string contract (`value` / `onChangeText`) while adapting internally to package numeric control (`value` / `onChangeValue`).
- `FakeCurrencyInput` is not approved for current BizAssist forms due to cursor/selection UX tradeoffs.
- Money formatting defaults for BizAssist migration are locked to comma delimiter + dot decimal separator + 2 precision, with shared field budget enforcement retained.
- Character budget governance remains centralized in shared limits (`FIELD_LIMITS`) and must not be replaced by per-screen ad hoc logic.
- Canonical implementation plan is locked in `docs/features/MONEY_INPUT_REACT_NATIVE_CURRENCY_INPUT_MASTERPLAN_2026-02-24.md`.

## 2026-02-24 — Money Input Cap Behavior Governance (Silent Growth Lock)

### Memory Lock

- Canonical term for this behavior is **Silent Growth Lock**.
- Implementation term in tickets/code notes can be **Backspace-Safe Cap Guard**.
- For number-pad money fields, once the configured max minor-digit budget is reached, additional numeric growth taps must be silently ignored (no jitter, no warning toast).
- Backspace/delete must remain fully available after cap is reached.
- Replacement edits that do not increase effective digit length remain allowed.
- Preferred implementation pattern is dual guard:
  - native/formatted `maxLength` aligned to rendered money format length
  - handler-level growth guard in `onChangeText` based on minor-digit budget.
- Reuse this pattern across other money inputs through shared utilities/abstractions before adding per-screen bespoke logic.

## 2026-02-24 — Purpose-Aligned Character Limit Governance (Masterplan + Memory)

### Memory Lock

- Canonical term for text input cap policy is **Purpose-Aligned Character Limit**.
- Operational implementation term in code/docs is **Field Character Budget**.
- Enforcement source of truth must remain centralized in shared constants (`FIELD_LIMITS` / `fieldLimits`).
- Character limits must be derived from field function and user intent (identifier, label, description, price, search), not arbitrary UI-only values.
- Any new text input must declare/consume an explicit budget from shared field limits on both mobile and API validation paths.

## 2026-02-23 — Count Unit Naming Governance (Per Piece Lock)

### Memory Lock

- Moving forward, COUNT/each unit must use canonical display name **Per Piece** in UI copy.
- Moving forward, COUNT/each unit abbreviation must render as **pc** (singular) and **pcs** (plural).
- Do not display `ea`/`each` in end-user quantity subtitles, POS tile labels, product rows, or service rows.
- Backward compatibility: persisted/system identifiers may still be `ea` internally, but UI display must normalize to `pc/pcs`.

## 2026-02-23 — Category Create Save Redirect Lock (Manage Categories)

### Memory Lock

- After successful **Create Category** save (outside picker-return flows), redirect to **Manage Categories** ledger for the active context.
- Settings create must redirect to `Settings → Categories`.
- Inventory create must redirect to `Inventory Categories` ledger.
- Post-save create flow must not redirect to Category Detail unless explicitly requested by a future governance change.

## 2026-02-23 — Inventory + Settings Feature Flow Parity Lock

### Memory Lock

- Any approved feature flow update must be implemented in both **Inventory** and **Settings** surfaces when that flow exists in both contexts.
- Parity is mandatory for behavior, navigation outcomes, lifecycle actions, and core UX structure (not optional follow-up work).
- Delivery is incomplete until both Inventory and Settings paths are updated and validated in the same implementation cycle.

## 2026-02-23 — Process Form + Lifecycle UX Governance Lock

### Memory Lock

- Form draft persistence (draft state persistence) is required for multi-field process forms.
- Process forms with text input must implement keyboard avoidance and tap-outside keyboard dismiss.
- Archive and Restore must run on dedicated lifecycle process screens with deterministic post-action navigation closure.
- Management count labels must use business-locale compact number formatting helpers.
- Status/system copy must be sentence case, and duplicate in-card process titles must be avoided when header title already communicates process context.

## 2026-02-23 — Post-Action Navigation Flow Governance (Masterplan + Memory)

### Memory Lock

- Canonical term is **Post-Action Navigation Flow** (also acceptable in implementation notes: **post-action navigation** or **redirect logic**).
- Scope includes screen redirection after write/lifecycle actions such as Save, Archive, Restore, and equivalent completion actions.
- Post-action navigation must be deterministic and use governed navigation primitives (`replace`/controlled back behavior) for stable closure.
- Any action that writes or navigates must remain double-tap safe and Busy/Loading Overlay governed.
- Success path must land users on the correct operational/management surface with clear closure feedback (toast/snackbar where applicable).

## 2026-02-22 — CODEX Agent Governance Template (Patch-Only Mode)

### Memory Lock

- Mission: implement requested changes exactly as described with minimal diffs, no architectural drift, and zero TypeScript errors.
- Token governance is mandatory: no full-file outputs, no unchanged code repetition, patch-style unified diffs only, concise technical notes only.
- Global constraints always apply: tablet-first UI governance, Back vs Exit Navigation Law, Busy/Loading Overlay governance, UDQI precision, Money 2-decimal input enforcement, lifecycle archive-only rules where applicable.
- Execution framework: Step 1 repo scan (components/modules/navigation/API/state/cross-module impact), Step 2 implement minimal diffs only.
- Preserve existing patterns (React Query, feature-first modules), naming consistency, and business logic integrity; avoid new abstractions unless explicitly requested.
- Output format lock: (1) Files Updated with one-line reason; (2) unified patch diffs only.

## 2026-02-22 — Modifiers Feature Flow Design (Masterplan + Memory)

### Memory Lock

- Modifiers feature flow is finalized and locked to the masterplan.
- Feature enables creation, editing, deletion of modifier sets and modifiers, price and availability toggling (including "Sold out"), and application to items/services.
- API and mobile implementation must be feature-first, with no new abstractions or UI layout changes.
- All async actions must use Loading Overlay; all data via React Query; all navigation and state must respect governance (UDQI, Units, Categories, POS, Navigation).
- Tablet-first UI codex (BAISurface, BAIScreen, etc.) is mandatory.
- All flows must compile with zero TypeScript errors.
- UX governance: Halo Effect, Cognitive Fluency, Peak-End Rule, immediate feedback, one dominant job per screen, clear closure.
- See `docs/features/modifiers.md` for full design and implementation plan.

## 2026-02-22 — Modifiers Flow Finalization (Photo-Referenced Lock)

### Memory Lock

- The uploaded modifier UX sequence is approved as the canonical behavior reference for this cycle.
- Modifier sets are business-scoped and reusable across both Items and Services.
- Create Item and Create Service must expose the same modifier attach section (multi-select sets) and persist in one save transaction with the parent entity.
- Modifier Set detail must show availability status and aggregate summary (`x available`, `y sold out`) at ledger level.
- `Sold out` is an operational availability state for modifier options (not archive/delete):
  - Sold-out options remain visible in management.
  - Sold-out options are not selectable in POS add flow.
  - POS must still render sold-out labels where applicable.
- Modifier Set upsert flow lock:
  - Process header with deterministic exit and explicit Save.
  - Inline modifier option name + price editing.
  - Option reorder support and option removal affordance.
  - Set-level delete action remains lifecycle-governed and explicit about global impact.
- Async governance lock:
  - Bulk availability updates must show blocking Loading Overlay.
  - Completion feedback must show toast/snackbar closure.
  - Navigation/write actions must remain double-tap safe.
- Ownership lock:
  - Modifiers module owns set/option rules and availability operations.
  - Catalog module owns Item/Service attach-on-save orchestration.
  - POS module owns runtime validation and modifier line-price application.
- Non-touch lock remains in force: UDQI quantity semantics, tablet-first parity, Back vs Exit governance, POS structure, and existing inventory ledger semantics.

## 2026-02-21 — Button Shape Governance Locked (Masterplan + Implementation)

### Memory Lock

Button Shape Governance locked: full-width CTAs must use rounded rectangle radius; pill shape allowed only for compact/short-width buttons via explicit opt-in prop; full-width pill attempts auto-fallback to rounded with DEV warning. This rule is non-negotiable and masterplan-locked.

## 2026-02-19 — AWS SES Install/Setup/Implementation Docs Refresh (Welcome + Developer Guide)

### Summary

Refresh AWS SES memory from current docs for installation prerequisites, account setup, and implementation paths.

### Locked Rules (AWS SES)

- **Install prerequisites**
  - Start with an AWS account, then configure programmatic access before coding against SES.
  - Preferred auth path is IAM/IAM Identity Center temporary credentials for CLI/SDK usage; long-term IAM user keys remain not recommended.
  - Install and configure AWS CLI for account/bootstrap automation and install an AWS SDK for application integration.

- **Initial SES setup**
  - Use the SES **Get started** account setup wizard when no SES identities exist yet (wizard is shown only before first identity creation).
  - First setup flow should verify at least one sender identity (email or domain) and then request production access.
  - New SES accounts begin in the sandbox per Region.

- **Sandbox and production access**
  - Sandbox limits remain: send only to verified identities or mailbox simulator, `200` recipients/24h, `1` recipient/sec.
  - Request production access in SES console (`Account dashboard` -> `View Get set up page` -> `Request production access`) or via CLI `sesv2 put-account-details`.
  - AWS Support states an initial response target within 24 hours after submission.

- **Identity strategy**
  - Domain identity is preferred for production; email identity is fastest for initial validation/testing.
  - Advanced sending use cases (configuration sets, delegate policies, per-address overrides) require explicit email-address verification even when domain inheritance exists.
  - Identity verification is Region-scoped; verify separately per Region.
  - Identity quota remains up to `10,000` verified identities per Region.

- **Implementation path (sending email)**
  - Console sending is best for testing/manual checks; production/bulk flows should use SMTP interface or SES API.
  - Quotas are recipient-based (not message-based); prefer one recipient per send call to avoid all-recipient rejection on API failure.
  - Max recipients per message: `50`.
  - Message size limits: SES v1 API `10 MB`; SES v2 API and SMTP `40 MB` (including attachments, after base64).
  - SMTP requirements: Regional SMTP endpoint + port, Region-specific SMTP credentials (not AWS access keys), TLS-capable client, verified sender identity.
  - API integration options: direct HTTPS (manual signing), AWS SDK (recommended for auth/retry/error handling), or AWS CLI/PowerShell.
  - API composition modes: formatted email (SES builds MIME), raw email (caller provides full MIME), and templated sends.

### BizAssist Implementation Notes (SES)

- Keep SES integration server-side in `/Users/gerardogaden/Desktop/bizassist/api` only; no direct send path from mobile clients.
- Continue using SES API v2 for new sending code and enforce app-level throttling by recipient count.
- Treat each deployment Region as its own SES setup checklist (identities, sandbox/production state, quotas, SMTP creds).

### Source Snapshot (Reviewed 2026-02-19)

- `https://docs.aws.amazon.com/ses/latest/dg/Welcome.html`
- `https://docs.aws.amazon.com/ses/latest/dg/setting-up.html`
- `https://docs.aws.amazon.com/ses/latest/dg/request-production-access.html`
- `https://docs.aws.amazon.com/ses/latest/dg/creating-identities.html`
- `https://docs.aws.amazon.com/ses/latest/dg/send-email.html`
- `https://docs.aws.amazon.com/ses/latest/dg/send-email-smtp.html`
- `https://docs.aws.amazon.com/ses/latest/dg/send-email-api.html`
- `https://docs.aws.amazon.com/ses/latest/dg/manage-sending-quotas.html`
- `https://docs.aws.amazon.com/ses/latest/dg/quotas.html`

## 2026-02-17 — AWS Backend + SES Setup Governance (Docs Refresh)

### Summary

Lock current AWS implementation guidance for BizAssist backend hosting and SES transactional email so setup remains region-correct, production-safe, and least-privilege.

### Locked Rules (AWS)

- **Region + scope**
  - Keep API runtime, PostgreSQL, and SES in the same primary region when possible.
  - Default region for this workspace remains `ap-southeast-1` unless architecture explicitly changes it.
  - SES identities, sending quotas, and service quotas are region-scoped; setup is repeated per region.

- **SES account bootstrap and production gate**
  - Use SES account setup wizard for first-time setup (only shown before any identities exist).
  - Treat sandbox state as non-production: can send only to verified identities/mailbox simulator, max `200` messages/24h, max `1` message/sec, suppression-list bulk/API controls limited in sandbox.
  - Production email go-live is blocked until production access request is approved and required sender identities are verified.
  - Keep rollout policy that email features are feature-flagged off in production until SES production access + auth records are complete.

- **SES identity and auth posture**
  - Prefer domain identity over single-address identity for production.
  - Domain verification supports Easy DKIM (default, 2048-bit by default), BYODKIM, and DEED for global replica identities.
  - DNS verification can take up to 72 hours to propagate; plan rollout timing accordingly.
  - Configure SPF + DKIM + DMARC alignment before live traffic.
  - If using custom MAIL FROM, define explicit MX failure behavior (`fallback to amazonses.com` vs `reject`).
  - Each region supports up to `10,000` verified identities (domain + address mix).

- **SES sending and observability implementation**
  - Enforce app-level send throttling by recipient count (SES quotas are recipient-based, not message-based).
  - Single send request must stay within current documented SES constraints (verified sender, max 50 recipients, size cap: SES v1 API 10 MB, SES v2 API/SMTP 40 MB).
  - Wire event publishing through configuration sets, with explicit event destination(s) (CloudWatch, Firehose, EventBridge, Pinpoint, or SNS), and always pass configuration set on send path.
  - Use mailbox simulator for deterministic bounce/complaint/delivery testing during integration; simulator uses sending rate limits but does not consume daily quota.

- **Backend hosting default path (AWS)**
  - Default managed path: **App Runner** for HTTP API.
  - Control path when deeper runtime/network control is required: **ECS + Fargate**.
  - Database: **RDS PostgreSQL**, private by default (`Public access = No` unless explicitly required for a controlled admin path).

- **App Runner network/runtime rules**
  - Use private subnets for VPC connector egress; selecting public subnets for connector causes errors.
  - When attaching VPC connector, account for one-time cold startup latency (2-5 minutes on first connector setup).
  - Select subnets across at least 3 AZs where available for HA.
  - App Runner VPC egress removes direct internet/AWS API access unless NAT gateway or VPC endpoints are configured.
  - Configure health checks explicitly (defaults are TCP, interval 5s, timeout 2s).

- **App Runner IAM and secrets**
  - For ECR private image sources, require App Runner access role; ECR Public does not require access role.
  - Access role trust principal: `build.apprunner.amazonaws.com`.
  - Application AWS API calls require App Runner instance role with least privilege.
  - Instance role trust principal: `tasks.apprunner.amazonaws.com`.
  - Manage runtime secrets via Secrets Manager or SSM references; do not store raw secrets in repo.
  - `PORT` is reserved in App Runner and cannot be used as an env var name.
  - Secret/parameter value changes are not auto-refreshed; redeploy required to pull new values.

- **App Runner deployment behavior**
  - `apprunner.yaml` config file applies only to source-code services, not image-based services.
  - After service creation, source type cannot be switched between code and image.
  - `ServiceName` and `EncryptionConfiguration` are immutable after create.

- **ECS + Fargate control-path rules (when used)**
  - Separate IAM task role (app AWS API calls) from task execution role (agent operations like pulling ECR, pushing logs, fetching secret refs).
  - Prefer `awsvpc` mode for task-level SG control.
  - With `awsvpc`, ALB/NLB target groups must use target type `ip`.
  - `awsVpcConfiguration` limits: up to 16 subnets and 5 security groups.

### BizAssist Implementation Notes (AWS Path)

- API (`/Users/gerardogaden/Desktop/bizassist/api`) can be deployed to App Runner first; server must bind `0.0.0.0:${PORT}`.
- PostgreSQL migrations should remain release/deploy-step controlled; DB access should stay private by default.
- Implement SES provider in backend only (mobile never sends directly).
- For Node implementation, prefer SES API v2 send path (`SendEmail`) with explicit `ConfigurationSetName` + message tags.
- Preserve existing API contract and auth/business scoping behavior (`X-Active-Business-Id`) during infra migration.

### Source Snapshot (Reviewed 2026-02-17)

- SES setup and production access:
  - `https://docs.aws.amazon.com/ses/latest/dg/setting-up.html`
  - `https://docs.aws.amazon.com/ses/latest/dg/request-production-access.html`
  - `https://docs.aws.amazon.com/ses/latest/dg/creating-identities.html`
  - `https://docs.aws.amazon.com/ses/latest/dg/send-email-authentication-dmarc.html`
  - `https://docs.aws.amazon.com/ses/latest/dg/manage-sending-quotas.html`
  - `https://docs.aws.amazon.com/ses/latest/dg/quotas.html`
  - `https://docs.aws.amazon.com/ses/latest/dg/monitor-sending-using-event-publishing-setup.html`
  - `https://docs.aws.amazon.com/ses/latest/dg/event-publishing-add-event-destination.html`
  - `https://docs.aws.amazon.com/ses/latest/dg/send-an-email-from-console.html`
  - `https://docs.aws.amazon.com/ses/latest/APIReference-V2/API_SendEmail.html`
- AWS SDK/implementation constraints:
  - `https://docs.aws.amazon.com/sdk-for-javascript/v3/developer-guide/ses-examples-sending-email.html`
- App Runner:
  - `https://docs.aws.amazon.com/apprunner/latest/dg/manage-create.html`
  - `https://docs.aws.amazon.com/apprunner/latest/dg/manage-configure.html`
  - `https://docs.aws.amazon.com/apprunner/latest/dg/network-vpc.html`
  - `https://docs.aws.amazon.com/apprunner/latest/dg/manage-configure-healthcheck.html`
  - `https://docs.aws.amazon.com/apprunner/latest/dg/env-variable.html`
  - `https://docs.aws.amazon.com/apprunner/latest/dg/config-file.html`
  - `https://docs.aws.amazon.com/apprunner/latest/dg/security_iam_service-with-iam.html`
- ECS:
  - `https://docs.aws.amazon.com/AmazonECS/latest/developerguide/task-iam-roles.html`
  - `https://docs.aws.amazon.com/AmazonECS/latest/developerguide/task_execution_IAM_role.html`
  - `https://docs.aws.amazon.com/AmazonECS/latest/developerguide/security-network.html`
  - `https://docs.aws.amazon.com/AmazonECS/latest/developerguide/task-networking-awsvpc.html`
- RDS PostgreSQL:
  - `https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/CHAP_GettingStarted.CreatingConnecting.PostgreSQL.html`
  - `https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/USER_CreateDBInstance.Settings.html`

## 2026-02-17 — Render Backend Setup Governance (Latest Docs Snapshot)

### Summary

Lock current Render platform guidance for deploying and operating backend services (API + Postgres + workers) so BizAssist setup remains correct over time.

### Locked Rules (Render)

- **Service type selection**
  - Use **Web Service** for publicly reachable API endpoints.
  - Use **Private Service** for internal-only services that must receive network traffic over Render private network.
  - Use **Background Worker** for async processors that do not receive inbound network traffic.

- **Web service binding and startup**
  - Web services must bind on host `0.0.0.0`.
  - Bind HTTP server to `PORT` env var (default expected `10000`).
  - Health endpoint should be configured via `healthCheckPath` (Dashboard or `render.yaml`).

- **Health check behavior**
  - Render health checks are HTTP `GET`; `2xx/3xx` is healthy.
  - Non-`2xx/3xx` or timeout (~5s) is failed.
  - During deploys, prolonged failed health checks can cancel deploy and keep prior version serving.
  - For running services, sustained failures can remove instance from routing and trigger restart.

- **Deploy pipeline and commands**
  - Deploy order is: `buildCommand` -> optional `preDeployCommand` -> `startCommand`.
  - Use `preDeployCommand` for DB migrations and other release tasks.
  - For this repo’s API, migration step belongs in pre-deploy (e.g., Prisma deploy migration command), not in runtime request path.

- **Filesystem and persistence**
  - Service filesystem is ephemeral by default; do not store durable app data locally.
  - Durable state belongs in managed datastores (Postgres/Key Value) or explicit persistent disks.

- **Postgres connectivity and regioning**
  - Prefer **internal database URL** for Render-to-Render traffic in same account+region.
  - Keep API and Postgres in the same region to reduce latency and use private networking.
  - External DB URL is for off-platform/admin access and is slower over public internet.

- **Postgres access and capacity notes**
  - External DB access can be restricted with CIDR allowlists; internal same-region connectivity remains available via internal URL.
  - Track connection limits by instance memory tier; use pooling or larger instance when approaching limits.
  - Storage can be increased (not decreased); autoscaling increases at high utilization.

- **Environment variables and secrets**
  - Never hardcode secrets in code or committed infra config.
  - Use service env vars and/or environment groups for shared config.
  - Service-level env vars override group values when key collisions occur.
  - In Blueprints, use `sync: false` placeholders for secrets and populate in Dashboard.
  - Secret files are supported and mounted at runtime (and should be treated as sensitive plaintext).

- **Blueprint (`render.yaml`) governance**
  - Prefer Blueprint IaC for reproducible multi-service setup.
  - Use `services`, `databases`, and `envVarGroups` with explicit runtime/build/start commands.
  - Use `fromDatabase.property: connectionString` and `fromService` references instead of duplicating connection secrets.
  - Use `autoDeployTrigger` (`commit`, `checksPass`, `off`) explicitly per service.

### BizAssist Implementation Notes

- API (`api/`) should run as a Render **Web Service** with explicit health check path and deterministic pre-deploy migration command.
- Managed PostgreSQL should be Render Postgres in same region; app should consume internal connection string via env var.
- Any asynchronous heavy processing should be split into a **Background Worker** service.

### Source Snapshot

- Reviewed Render docs sections: web services, deploys, health checks, private services, background workers, environment variables/secrets, Postgres create/connect, and Blueprint spec.
- Primary refs:
  - `https://render.com/docs/web-services`
  - `https://render.com/docs/deploys`
  - `https://render.com/docs/health-checks`
  - `https://render.com/docs/configure-environment-variables`
  - `https://render.com/docs/postgresql-creating-connecting`
  - `https://render.com/docs/blueprint-spec`

## 2026-02-17 — Inventory/Settings Parity Sign-off Linked

- Reference sign-off: [docs/INVENTORY_SETTINGS_PARITY_SIGNOFF_2026-02-17.md](docs/INVENTORY_SETTINGS_PARITY_SIGNOFF_2026-02-17.md)
- Related PR/commit: _TBD_

## 2026-02-16 — Archive Default Icon Locked

### Summary

Lock the default Archive icon for management surfaces moving forward.

### Locked Rule

- Archive default icon must be `MaterialCommunityIcons` with `name="archive-outline"`.

Canonical snippet:

- `import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';`
- `<MaterialCommunityIcons name="archive-outline" size={24} color="black" />`

## 2026-02-16 — Canonical Service Unit Catalog Reference Locked

### Summary

Lock a single reviewer-facing reference for approved service units, default behavior, and seed/runtime sync rules.

### Locked Rule

- Service unit behavior and approved list must be reviewed against:
  - `docs/SERVICE_UNIT_CATALOG_SEED.md`
- Any service-unit change must stay synchronized across:
  - `mobile/src/features/units/serviceUnitCatalog.ts`
  - `api/src/modules/units/serviceUnitCatalog.seed.ts`
  - `mobile/app/(app)/(tabs)/inventory/units/picker.tsx`
  - `mobile/app/(app)/(tabs)/inventory/services/create.tsx`

## 2026-02-13 — React Query StaleTime Tiering Governance Locked

### Summary

Lock query freshness policy by feature intent so operational flows stay responsive while settings/admin flows reduce unnecessary refetch load.

### Locked Rule

- `staleTime` is a cache-freshness control, not a polling interval.
- Use tiered defaults:
  - **Operational screens (near-real-time inventory/POS/unit stock movement):** `30_000`
  - **Shared/default reference data (general read models):** `120_000`
  - **Settings/admin management flows (low-churn configs):** `300_000`
  - **Long-lived metadata:** `24 * 60 * 60 * 1000`
- If true near-real-time is required across devices, prefer event-driven invalidation (or websockets). Only keep `30_000` where operational correctness/latency needs justify it.

## 2026-02-13 — Process Wording + Badge Token + Swatch A11y Governance Locked

### Summary

Lock wording and visual consistency across Category/Discount process surfaces, and enforce accessible color swatch labels.

### Locked Rules

- Process-screen wording convention:
  - Header-left for process screens uses **Close** semantics (X / Exit).
  - In-card secondary action uses **Cancel**.
  - **Back** is reserved for detail/picker/history navigation, not process cancel intent.
- Badge text token consistency:
  - Badge text color uses `theme.colors.onSurfaceVariant ?? theme.colors.onSurface`.
  - Visibility badge wording uses compact count with scope labels:
    - `ALL`, `VISIBLE`, `HIDDEN`
  - Avoid mixing `TOTAL`/noun-heavy variants when the sibling surfaces use scope-only labels.
- Category color swatch accessibility:
  - Swatches must expose human-readable accessibility labels (e.g., `Blue`, `No Color`).
  - Swatches must announce selected state and disabled state.
  - Swatches should provide a short action hint (e.g., double tap to select).

## 2026-02-13 — Count Label Pluralization Locked

### Summary

Lock count label/title behavior across the app so singular and plural text always match the numeric count.

### Locked Rule

- Any count label/title must be dynamic:
  - `1` uses singular
  - `0` and values greater than `1` use plural
- Applies to badges, pills, headers, and inline count text.
- Compact number formats must still follow correct label plurality.

Canonical examples:

- `1 ITEM`
- `2 ITEMS`
- `1.2K ITEMS`

## 2026-02-12 — Discount Default Icon Locked

### Summary

Lock the default Discount icon for management surfaces moving forward.

### Locked Rule

- Discount default icon must be `MaterialCommunityIcons` with `name="tag-outline"`.

Canonical snippet:

- `import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';`
- `<MaterialCommunityIcons name="tag-outline" size={24} color="black" />`

## 2026-02-12 — Category Default Icon Locked

### Summary

Lock the default Category icon for management surfaces moving forward.

### Locked Rule

- Category default icon must be `Ionicons` with `name="layers-outline"`.

Canonical snippet:

- `import Ionicons from '@expo/vector-icons/Ionicons';`
- `<Ionicons name="layers-outline" size={24} color="black" />`

## 2026-02-23 — Units Default Icon Locked

### Summary

Lock the default Units icon for management surfaces moving forward.

### Locked Rule

- Units default icon must be `MaterialCommunityIcons` with `name="ruler-square"`.

Canonical snippet:

- `import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';`
- `<MaterialCommunityIcons name="ruler-square" size={24} color="black" />`

## 2026-02-23 — All Services Default Icon Locked

### Summary

Lock the default All Services icon for settings management surfaces moving forward.

### Locked Rule

- All Services default icon must be `Ionicons` with `name="briefcase-outline"`.

Canonical snippet:

- `import Ionicons from '@expo/vector-icons/Ionicons';`
- `<Ionicons name="briefcase-outline" size={24} color="black" />`

## 2026-02-23 — Icon Color + Shade Standardization Locked

### Summary

Lock icon color and shade consistency for management surfaces moving forward.

### Locked Rule

- On list rows, all icon families must use one shared tint token for visual consistency.
- Leading row icons and trailing chevrons must use the same shade.
- Default shared tint token is `theme.colors.onSurfaceVariant` with fallback `theme.colors.onSurface`.

Canonical snippet:

- `const iconTint = theme.colors.onSurfaceVariant ?? theme.colors.onSurface;`
- `<Ionicons name="layers-outline" size={20} color={iconTint} />`
- `<MaterialCommunityIcons name="chevron-right" size={30} color={iconTint} />`

## 2026-02-12 — Discounts Visibility Restore Icon Locked

### Summary

Lock the restore action icon in Discounts Visibility for all future implementation.

### Locked Rule

- Restore action icon must be `MaterialCommunityIcons` with `name="eye"`.

Canonical snippet:

- `import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';`
- `<MaterialCommunityIcons name="eye" size={24} color="black" />`

## 2026-02-12 — Icon Governance Locked: Archived + Hidden Defaults

### Summary

Lock default status icons for Categories and Discounts management surfaces.

### Locked Defaults

- Archived uses `MaterialCommunityIcons` with `name="archive-outline"`.
- Hidden uses `MaterialCommunityIcons` with `name="eye-off"`.

Canonical snippets:

- `import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';`
- `<MaterialCommunityIcons name="archive-outline" size={24} color="black" />`
- `<MaterialCommunityIcons name="eye-off" size={24} color="black" />`

### Precedence Rule

- If an item is both archived and hidden, archived icon/state representation takes precedence.

## 2026-02-11 — Discounts Navigation Governance Locked: Settings Edit Save Redirect

### Summary

Fix and lock post-save navigation behavior for **Settings → Discounts → Edit**.

### Locked Rule

- After successful save in `mobile/app/(app)/(tabs)/settings/discounts/[id]/edit.tsx`, navigation must redirect to the settings discounts ledger route:
  - `/(app)/(tabs)/settings/discounts`
- This behavior must mirror the inventory discount edit-save flow: deterministic post-save replace to ledger.

### Implementation Governance

- Use nav-lock-safe replace for save redirects (`safeReplace`) to prevent duplicate navigation and race conditions.
- Process-screen back interception must only guard back/pop actions and must not block successful save redirect replaces.

## 2026-02-11 — Governance Locked: Short Note + Global Text Hygiene

### Summary

Lock Short Note behavior and global text-input hygiene across Mobile + API.

### Short Note Rules (Locked)

- Max length: **200** characters.
- UI behavior: show **2 visible lines**, auto-grow to approximately **4 lines**, then scroll inside the field.
- Validation: no regex rejection beyond hygiene transforms.

### Required Hygiene Pipeline (Global)

- Apply to all user-editable text fields: names, descriptions, notes, labels, and similar text inputs.
- Strip non-printable ASCII control characters as a silent hygiene step.
- Permit newline/tab only where the field supports it (e.g., multiline notes).
- Allow normal text, punctuation, and emoji.
- Run hygiene on Mobile (while typing and/or at submit) and in API (Zod preprocess).
- Do not expose control-character filtering as a regex/user-facing format error.

## 2026-02-10 — Media Delivery Governance Locked: Public vs Private (Supabase)

### Decision

Adopt **Option 1** for Supabase delivery: make `product-media` bucket **PUBLIC** and deliver product images via stable public URLs (no signed tokens) to enable CDN + `expo-image` disk caching and eliminate tile/list rendering delays.

### Tiered Delivery Policy (by MediaKind)

- **Public:**
  - `product-image` → `product-media` (PUBLIC)
  - `business-logo`, `business-cover` → `business-assets` (PUBLIC by default)
- **Private (signed URLs only when needed):**
  - `user-avatar`, `user-cover` → `user-media` (PRIVATE by default)

### Non-negotiable Rules

1. Never sign what you do not need to protect.
2. Public buckets must return stable `getPublicUrl(path)` URLs.
3. If private signed URLs are used, the API must cache and reuse signed URLs per `{bucket,path}` until near expiry (do not rotate per read).
4. Public image cache headers must be aggressive for immutable assets.
5. Mobile uses `expo-image` with disk cache for list/tile surfaces; web consumes the same delivery URLs.

## 2026-02-05 — Feature Design Locked: Edit POS Tile (Create Item Flow)

### Summary

Create an **Edit POS Tile** process screen within the Inventory → Create Item flow. This screen allows the user to set the POS tile label, select either a tile image or a tile color, and return to the Create Item screen with the updated preview. The design is locked and must be implemented as approved.

### Canonical User Flow

1. Create Item screen → tap **Edit POS tile**.
2. Edit POS Tile screen (process):
   - Title: “Edit POS tile”
   - Field: Tile label
   - Tabs: **Image** | **Color**
3. Image tab:
   - **Choose from library** → Photo Library screen
   - **Take photo** → Camera → Crop screen
   - **Remove image** enabled only when an image exists
4. Photo library selector (OS):
   - Deep discovery across albums/folders.
   - Select an asset (returns asset URI).
   - Continue → Crop screen.
   - No preview, no editing, no upload here.
5. Recent photos selector (BizAssist):
   - Fast grid for the latest captures.
   - Select an asset (returns asset URI).
   - Continue → Crop screen.
   - No preview, no editing, no upload here.
6. Crop screen:
   - Crop, **Use photo**
   - Return to **Edit POS Tile** (not Create Item); user must tap **Save**, then return to Create Item
7. Create Item shows image preview; remove image disabled when no image is set.

### Ownership (API + Modules)

**Catalog module owns POS tile fields**:

- `posTileMode` ("COLOR" | "IMAGE")
- `posTileColor` (hex or null)
- Optional `posTileLabel` (if separate from product name)

**Media module owns image upload/commit**:

- Existing product image pipeline applies after product creation.

**Inventory module remains ledger-only**:

- Do not add tile fields or behavior to inventory ledger logic.

### Mobile Screens Required/Affected

Required new screens:

- `mobile/app/(app)/(tabs)/inventory/products/pos-tile.tsx`
- `mobile/app/(app)/(tabs)/inventory/products/pos-tile.phone.tsx`
- `mobile/app/(app)/(tabs)/inventory/products/pos-tile.tablet.tsx`
- `mobile/app/(app)/(tabs)/inventory/products/pos-tile-photo-library.tsx`
- `mobile/app/(app)/(tabs)/inventory/products/pos-tile-recents.tsx`
- `mobile/app/(app)/(tabs)/inventory/products/pos-tile-crop.tsx`

Affected:

- `mobile/app/(app)/(tabs)/inventory/products/create.tsx`
- `mobile/src/modules/inventory/drafts/productCreateDraft.ts` (store tile mode/color/label/image uri)
- `mobile/src/modules/inventory/inventory.types.ts` + `mobile/src/modules/catalog/catalog.types.ts`

### Governance/Constraints

- **Tablet-first**: Must add `screen.tsx`, `screen.phone.tsx`, `screen.tablet.tsx` variants.
- **No dropdowns/drawers** in operational flows.
- **Deterministic navigation**: use `replace()`/returnTo params; no ambiguous back behavior.
- **Busy overlay + double-tap prevention**: apply for Save/upload actions.
- **Media governance**: use product image pipeline; client does not choose buckets.
- **Input validation**: apply strict regex only to format-specific fields (POS tile label, SKU/barcode).
  Product name/description should not be over-restricted. POS tile label is limited to 6 chars, letters/numbers/spaces only.
- **Text input hygiene**: always apply appropriate sanitation (trim, normalize), regex, and validators for text inputs across all components.

### Do Not Touch

- Inventory ledger logic and UDQI quantity behavior.
- POS layout lock and POS UI structure.
- Media governance rules and upload pipeline constraints.

---

## 2026-02-05 — Feature Design Locked: Custom Expo Cropper (Inventory Image Upload)

### Summary

Build a **custom in‑app cropper** for Expo 54 (no third‑party cropper). It is used in the **Inventory → Create Item → POS Tile** image flow. The cropper generates a **local cropped image** that is later uploaded via the existing Media module pipeline. This is a design‑locked feature.

### Canonical User Flow

1. Create Item → Edit POS tile → Choose from library / Take photo.
2. Crop screen (process):
   - Fixed **1:1** crop frame (POS tile requirement).
   - Pinch to zoom, drag to pan image under a static mask.
   - Actions: **Reset** (secondary) and **Use photo** (primary).
3. On **Use photo**:
   - Busy overlay while cropping.
   - Local crop output created (JPEG).
   - Return via `replace()` to **Edit POS Tile** (not Create Item) with new `localUri`.
4. User taps **Save** on Edit POS Tile; Create Item preview updates from local draft.

### Ownership (API + Modules)

- **Media module** owns signed upload + commit (post‑create).
- **Catalog module** owns POS tile fields (`posTileMode`, `posTileColor`).
- **Inventory module** remains ledger-only (no image logic).

### Technical Design Decisions

- **Aspect ratio param**: cropper supports a configurable ratio; default **1:1** for POS tile.
- **Rotation**: **not supported** in Phase 1.
- **Tablet**: reuse phone layout with **larger crop frame** (tablet‑first parity still required).

### Output Constraints (API Safety)

- Server max upload size: **10 MB**.
- **Target size**: ≤ **6 MB** to leave headroom.
- **Hard cap**: ≤ **8 MB** (reject or downscale further if exceeded).
- **Max dimension**: **2048 px** (long edge) for higher detail.
- Output format: **JPEG** (quality ~0.85) for predictable size.

### Mobile Screens Required/Affected

- `mobile/app/(app)/(tabs)/inventory/products/pos-tile-crop.tsx`
- `mobile/app/(app)/(tabs)/inventory/products/pos-tile-crop.phone.tsx`
- `mobile/app/(app)/(tabs)/inventory/products/pos-tile-crop.tablet.tsx`
- `mobile/app/(app)/(tabs)/inventory/products/pos-tile-photo-library.phone.tsx`
- `mobile/app/(app)/(tabs)/inventory/products/pos-tile-recents.phone.tsx`
- `mobile/app/(app)/(tabs)/inventory/products/pos-tile.phone.tsx`
- `mobile/app/(app)/(tabs)/inventory/products/create.tsx`

### Governance/Constraints

- **Deterministic navigation**: `replace()` + returnTo/rootReturnTo.
- **Double‑tap prevention** + Busy overlay during crop.
- **No dropdowns/drawers**, visible actions only.
- **Media governance**: client never chooses bucket/path; only `MediaKind` is sent.

### Do Not Touch

- UDQI inventory quantities.
- POS layout/navigation rules.
- Media security rules + bucket governance.

---

## 2026-02-06 — Copy Casing Governance Update

### Summary

- **Subtitles, helper text, and hints must use sentence case** (not Title Case) for consistency in BizAssist UI copy.
- **Body copy should not be Title Case**.

---

## 2026-02-07 — Feature Design Locked: Auth Refresh Token Rotation Hardening

### Summary

Harden refresh token rotation to prevent dev-time disconnects while preserving strict security. This design keeps rotation + reuse detection but avoids false-positive mass logout and ensures mobile refresh is single-flight with safe retry.

### Canonical Behavior (API)

1. **Refresh** validates JWT and finds the refresh token by hash.
2. If **revoked**: treat as reuse, revoke all sessions for the user, bump `tokenVersion`, return `REFRESH_TOKEN_REUSE_DETECTED`.
3. If **expired**: revoke only that token, return `REFRESH_TOKEN_EXPIRED`.
4. If **not found**: return `REFRESH_TOKEN_NOT_FOUND` (no mass logout).
5. If **valid**: in a single DB transaction:
   - Create new refresh token row.
   - Mark old token `revokedAt` (do not delete).
   - Issue new access + refresh tokens.

### Token Version Rules (API)

- **Only** bump `tokenVersion` on **logout all**, **password reset**, or explicit admin action.
- **Single-session logout** revokes just the current refresh token (no version bump).

### Mobile Requirements

- **Single-flight refresh**: only one refresh call at a time; others wait for the same promise.
- **401 retry**: on 401 from non-auth routes, refresh once then retry the original request once.
- **Atomic token update**: update access + refresh together; prevent stale overwrites.
- **Failure handling**: if refresh fails with reuse/expired/not-found → clear tokens and route to auth.

### Error Envelope Codes (Stable)

`REFRESH_TOKEN_EXPIRED`, `REFRESH_TOKEN_REVOKED`, `REFRESH_TOKEN_REUSE_DETECTED`, `REFRESH_TOKEN_NOT_FOUND`, `INVALID_REFRESH_TOKEN`.

### Constraints

- **No cookies** (token-based mobile auth only).
- **Standard error envelope** preserved.
- **Feature-first structure** preserved.
- **No UI layout changes**.

---

## 2026-02-08 — Abuse Cap Governance: Categories + Custom Units

### Summary

To prevent abuse, the API enforces business-scoped caps on:

- Categories: **200**
- Custom units: **100**

These limits are configurable via env and surfaced to mobile with explicit error codes and friendly UI copy.

### Server Details

Env vars:

- `MAX_CATEGORIES_PER_BUSINESS` (default 200)
- `MAX_CUSTOM_UNITS_PER_BUSINESS` (default 100)

Error codes:

- `CATEGORY_LIMIT_REACHED`
- `CUSTOM_UNIT_LIMIT_REACHED`

### Mobile Behavior

- Category create screen shows: "You've reached the maximum of X categories."
- Custom unit create screen shows: "You've reached the maximum of X custom units."

---

## 2026-02-08 — Feature Design Locked: Discounts (Create + Edit Flow, V1)

### Summary

Lock the Inventory-driven **Create Discount** and **Edit Discount** flows for V1. Discounts remain POS-only pricing modifiers and **never** touch the inventory ledger.

### Canonical User Flow

1. Inventory tab → **Discounts** list.
2. Tap **Create** → Create Discount screen.
3. Tap a **discount row** → Edit Discount screen.
4. Save on Create/Edit → `replace()` back to Discounts list, or `returnTo` if launched from POS.
5. Cancel/back on Create/Edit → deterministic `replace()` to list or `returnTo`.

### V1 Decisions (Locked)

- **Types:** fixed only (`PERCENT`, `FIXED`).
- **Scope:** defined at application time only (`SaleDiscount` snapshot), not on `Discount` definitions.
- **Stackable default:** **false** (align API + mobile for conservative behavior).
- **Discount Visibility (user-scoped):** add a separate visibility preference layer (Hide/Restore) that controls what appears in Discount pickers. This is non-destructive and reversible, and is **separate** from Archive/Restore lifecycle governance.

### Governance/Constraints

- **No dropdowns/drawers** in operational flows. Use full-screen pickers or segmented controls.
- **Deterministic navigation** with `replace()` and `returnTo`.
- **Busy overlay + double-tap prevention** for Create/Save actions.
- **Tablet-first parity**: phone/tablet variants must be updated together.
- **Visibility governance:** pickers show active + not hidden discounts; archived never selectable; currently selected discount remains visible read-only even if hidden.
- **Copy casing**: helper text and hints in sentence case.

### Do Not Touch

- Inventory ledger logic and UDQI quantity behavior.
- POS layout/navigation structure.
- Media governance rules and upload pipeline constraints.

---

## 10. Ledger‑Referenced Configuration Governance

Certain configuration entities in BizAssist are **ledger‑referenced**. If a POS Sale or Inventory record can reference the entity, it must follow archive‑only lifecycle rules.

This applies to:

- Units
- Categories
- Discounts
- (future) Taxes
- (future) Payment Methods

### Rules

- These entities must **never be hard deleted**.
- Allowed lifecycle actions only: **Create, Edit metadata, Archive, Restore**.
- Archived entities must remain visible in historical records for audit integrity.
- Picker screens must show **active only**; management screens may show **active + archived** via filters.
- Visibility (Hide/Restore) is a **separate user‑scoped preference** and must not be conflated with archive.

---

## 2026-02-15 — Services Governance Locked: Units + Cost + POS Quantity + Lifecycle

**Reference name:** Service Unit Semantics (v1)

### Summary

Lock Service (ProductType=SERVICE) behavior for creation, POS selling, and lifecycle so unit semantics are explicit, reporting is credible, and inventory logic never leaks into Services.

### Locked Rules

#### 1) Unit selection (no silent defaults)

- Services must require explicit unit selection (required field).
- Do NOT silently default to `Hour`.
- UI may visibly preselect a suggested unit, but it must be shown and changeable (i.e., the user is still making an explicit selection).

#### 2) Recommended unit options for Services

- Time units: `Minute`, `Hour`, `Day`, `Shift`, `Session`
- Engagement units: `Service`, `Job`, `Visit`, `Booking`, `Project`, `Package`, `Trip`
- Target-based units (conditional): `Vehicle`, `Room`, `Page`, `Seat`, `Head`, `Ticket`, `Item`

#### 3) Service Cost (optional)

- Service creation may include optional `cost` for margin reporting.
- Cost is interpreted as **cost per selected unit**.
- Cost must never drive inventory behavior.

#### 4) POS quantity rules for Services

- When adding a Service to cart: default quantity = `1`.
- Quantity entry:
  - Time-based units: allow decimals per `Unit.precisionScale`.
  - Engagement/target units: integer-only.
- Changing unit must reset quantity to `1` (no auto-conversion).

#### 5) Lifecycle governance

- Services follow `Active` / `Archived` only.
- Archived Services are excluded from POS and cannot be added to cart.
- Services have **no stock UI**, **no Adjust Stock**, and **no Recent Activity / InventoryMovement** surfaces.
- Visibility toggles (if used) are Settings-owned only, not Inventory-owned.

### Rationale

Avoid hidden assumptions (silent Hour default), preserve auditability, and keep reporting semantics consistent across multi-unit service businesses.

## 2026-02-19 — GTIN Governance Locked

### Summary

Lock GTIN (Global Trade Item Number) behavior across BizAssist to standardize barcode handling and ensure retail-grade correctness.

### Locked Rules

- GTIN is optional.
- Unique per business if present.
- Used for barcode scanning and fast POS lookup.
- Hidden/disabled for Services.
- UI label standardized as `GTIN (Barcode)`.
- Placeholder standardized as `Scan or enter UPC / EAN / ISBN`.

## 2026-02-21 — Cognitive-Emotional UX Governance Locked (App + Website)

### Summary

Persist a mandatory UX governance framework for all app and website development:

1. Halo Effect
2. Cognitive Load + Cognitive Fluency
3. Micro-Interactions + Peak-End Rule

### Locked Rules

- This framework is a default release requirement for new or modified user flows.
- First-view clarity and perceived quality are mandatory (Halo Effect).
- Decision friction must be minimized and copy must stay clear/predictable (Cognitive Fluency).
- Critical interactions must provide immediate feedback and clear end-state closure (Peak-End).

### Implementation Masterplan (Canonical)

- `docs/COGNITIVE_EMOTIONAL_UX_MASTERPLAN.md`
- `docs/MASTERPLAN_GUIDE.md`
- `docs/UI_GOVERNANCE.md`
- `docs/PR_CHECKLIST.md`

## 2026-02-21 — Cancel Button Behavior Governance Locked

### Summary

Lock canonical cancel behavior across process flows so cancellation is safe, deterministic, and semantically distinct from back navigation.

### Locked Rules

- `Cancel` must never commit writes (`create`, `update`, `archive`, `restore`).
- `Cancel` discards unsaved local state for the active process session.
- Cancel navigation must use deterministic `replace()`:
  - use `returnTo` when valid and non-self;
  - otherwise use a fixed flow fallback route.
- Do not rely on arbitrary history pop for cancel behavior.
- If unsaved changes exist, show discard confirmation (`Keep editing` / `Discard changes`) before exiting.
- Cancel actions must be navigation-locked/idempotent to prevent double-tap races.
- Semantics contract:
  - header-left on process screens uses `Close/Exit`;
  - in-content secondary action uses `Cancel`;
  - `Back` is reserved for detail/picker/history navigation.

## 2026-03-03 — Square Alignment Locked: Item Options / Variations + Modifier Flow

### Summary

Reviewed current Square US help documentation on March 3, 2026 and locked the Square-aligned reference behavior for BizAssist item creation and modifier flows.

### Source Basis (Square US Help)

- Item options and variations:
  - https://squareup.com/help/us/en/article/6689-item-options
  - https://squareup.com/help/us/en/article/5093-add-edit-items
- Modifiers:
  - https://squareup.com/help/us/en/article/5119-create-and-edit-modifiers
  - https://squareup.com/help/us/en/article/5696-customize-modifiers-for-order-entry
- Archive / restore baseline reference (items only; used as lifecycle analogy because no direct modifier archive help article was found):
  - https://squareup.com/help/us/en/article/8060-archive-or-unarchive-items

### Locked Rules — Create Item with Options and Variations

- Variations and modifiers remain separate concepts:
  - variations are fixed sellable forms of the item (for example size, color, pack);
  - modifiers are checkout-time customizations (for example toppings, add-ons, requests).
- BizAssist `Create Item` must keep the primary item flow item-first:
  - define core item data first;
  - then attach options / variations;
  - then attach modifier sets separately.
- Option / variation authoring must stay item-owned in the create/edit item workflow:
  - `Create Variation` belongs in the item process;
  - reusable option-set behavior may be supported later, but item creation must still feel local and immediate.
- Variation setup should generate the item’s concrete sellable variants, not become a second catalog type.
- Modifiers must not be created inline inside the variation builder.

### Locked Rules — Modifier Feature Flow

- Modifier set creation remains a dedicated management flow:
  - `Create New` -> `Modifiers` -> `Create Modifier Set`.
- Item screens are primarily for attaching existing modifier sets, not for full modifier authoring.
- Square-aligned assignment pattern for BizAssist:
  - in `Create Item` and `Edit Item`, show available modifier sets inline in the item form;
  - selecting a set is an attach/detach action in-place;
  - avoid a primary `Select / Create Modifiers` button as the main interaction when inline assignment is practical.
- Empty state rule:
  - if no modifier sets exist, show helper text plus a secondary CTA to `Create Modifier Set`;
  - after creation, return to the item flow and auto-select the newly created modifier set.
- Modifier set configuration rules should remain on the dedicated modifier screen:
  - set name;
  - option rows;
  - selection rules (`min` / `max`);
  - apply-to-items flow.
- Item-level modifier behavior can support per-item assignment and ordering; item-level overrides are allowed as future scope, but they should remain item-scoped and not silently rewrite the shared base set.

### Locked Rules — Modifier Create / Edit / Archive / Restore

- Create:
  - use a dedicated create screen for modifier-set authoring;
  - support adding option rows, pricing, and selection rules before save.
- Edit:
  - editing a modifier set should happen from the Modifiers manager, not inside the item form;
  - item forms should only attach/detach existing sets.
- Archive / Restore:
  - Square’s current public help docs reviewed here describe create, edit, apply, remove, reorder, and item archive behavior, but no direct modifier-set archive / restore help article was found.
  - Therefore BizAssist keeps modifier archive / restore as a product-owned lifecycle extension.
  - BizAssist archive rule:
    - archived modifier sets are hidden from active item assignment and excluded from checkout use;
    - existing historical data must remain intact.
  - BizAssist restore rule:
    - restored modifier sets return to the active library and become attachable again.
  - Do not hard-delete modifier sets as the default operational path.

### Implementation Implications for BizAssist

- `Create Item`:
  - keep inline modifier assignment in the `Modifiers` section;
  - if modifier sets exist, show set rows with secondary option-summary text;
  - if none exist, show helper text and `Create Modifier Set`.
- `Select Modifiers` picker can remain as a secondary utility for large libraries, but it is not the primary UX pattern.
- `Create Modifier Set` must preserve context return so creating from item setup returns to the item flow and rehydrates selection.
- Modifier ordering should be treated as meaningful:
  - default order is library-owned;
  - item-level presentation order may be item-owned if BizAssist later exposes override ordering.
