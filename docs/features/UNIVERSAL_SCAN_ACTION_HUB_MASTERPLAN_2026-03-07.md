# Universal Scan Action Hub Masterplan (2026-03-07)

Status: Approved design
Scope: Bottom tab scanner behavior when launch context has no immediate barcode consumer
Owners: Mobile navigation + Inventory/POS scanner UX

## 1) Problem Statement

When scanner is opened from a screen with no barcode input/search consumer, immediate redirect behavior is ambiguous and can feel incorrect.

## 2) Goals

- Keep contextual scanner flows deterministic and unchanged.
- Add explicit post-scan decision UX for non-contextual launches.
- Preserve workspace isolation (POS scan remains in POS wrapper route; Inventory scan remains in Inventory wrapper route).
- Maintain existing scan result contract (`scannedBarcode`, `q`, `returnTo`, `draftId`).

## 3) Non-Goals

- No Prisma schema change.
- No mandatory API endpoint changes for V1.
- No broad navigation architecture rewrite.

## 4) Feature Design

### 4.1 Scan launch intent

Scanner launch must carry intent:

- `scanIntent=contextual` when launched by a screen with a known barcode consumer.
- `scanIntent=universal` when launched from bottom tab scan button without a known consumer.

### 4.2 Contextual flow (unchanged)

- Scan accepted.
- Return immediately to `returnTo`.
- Consumer screen handles payload (`scannedBarcode` and/or `q`).

### 4.3 Universal flow (new)

- Scan accepted.
- Stay in scanner screen and show a dynamic action section.
- Dynamic section includes:
  - editable barcode input (prefilled from scan result)
  - focused list of barcode-heavy actions
  - deterministic cancel/back path

### 4.4 Dynamic action section: required actions

V1 required list:

- Search Inventory (open inventory list/search with `q`)
- Create Item with Barcode (open create item flow with barcode prefill)
- Find in POS Catalog (open POS flow with search/scanned barcode prefill)

Optional utility:

- Copy barcode

### 4.5 Barcode editability policy

- In universal flow, scanned barcode value is editable with sanitizer/validation guardrails.
- In contextual flow, keep current direct return; editing occurs in destination field screen.

## 5) UX and Navigation Governance

- Do not change scanner layout structure outside dynamic section rendering.
- Dynamic section is hidden for contextual flow and visible only for universal flow post-capture.
- Maintain route wrappers:
  - Inventory: `/(app)/(tabs)/inventory/scan`
  - POS: `/(app)/(tabs)/pos/scan`
- POS launches must not redirect into inventory scan route.

## 6) API Ownership

V1:

- No API ownership change required.
- Mobile-only orchestration and routing behavior.

V2 (optional):

- If exact product resolution by barcode is introduced, ownership belongs to catalog/inventory product query module.

## 7) Data Model / DTO Impact

V1:

- Prisma: no change
- API DTOs: no change
- Route params only:
  - add optional `scanIntent`
  - optional `scanOriginWorkspace`

## 8) Acceptance Criteria

- Contextual flows remain deterministic and unchanged.
- Universal flow displays dynamic action section after scan success.
- Universal flow barcode value is editable and validated.
- Actions route correctly to barcode-heavy destinations.
- No workspace cross-switch regression in POS scan wrapper behavior.

## 9) QA Checklist

- Launch scanner from barcode-aware screen -> no dynamic section, returns directly.
- Launch scanner from non-barcode screen -> dynamic section appears after capture.
- Edit scanned value and execute each action successfully.
- Phone and tablet parity for action section behavior.
- POS scan wrapper isolation remains intact.

## 10) Risks and Mitigations

- Risk: action list grows and becomes noisy.
- Mitigation: keep strict V1 shortlist and postpone secondary actions.

- Risk: behavior divergence across wrappers.
- Mitigation: intent and action handling centralized in scanner screen logic with wrapper-preserved routing.

- Risk: validation inconsistency.
- Mitigation: reuse existing GTIN sanitization/validation utilities.
