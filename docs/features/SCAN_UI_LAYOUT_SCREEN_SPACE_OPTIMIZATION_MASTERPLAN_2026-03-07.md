# Scan UI Layout and Screen Space Optimization Masterplan (2026-03-07)

Status: Approved design
Scope: Mobile scanner UI layout behavior for phone + tablet in contextual and universal scan modes
Owners: Mobile scanner UX + navigation flows

## 1) Problem Statement

Scanner overlays and dynamic universal action section can compete for vertical space, causing overlap, reduced target area, and poor readability on smaller screens.

## 2) Goals

- Keep scanner clear and legible across phone and tablet.
- Preserve current scanner architecture and navigation rules.
- Ensure dynamic universal section does not collide with bottom tab bar or safe areas.
- Keep CTA hierarchy usable without bloating visible actions.

## 3) Non-Goals

- No scanner flow ownership changes.
- No API or Prisma changes.
- No tab architecture changes.

## 4) Layout Model (Locked)

Scanner layout is split into 3 vertical zones:

- Zone A: Header + helper row (fixed top)
- Zone B: Scan canvas + scan box (flex middle)
- Zone C: Universal action hub (fixed bottom; visible only in universal mode post-capture)

### 4.1 Zone A rules

- Keep compact and stable height.
- Helper text defaults to concise single-line semantics.
- Close button remains inline with helper row.

### 4.2 Zone B rules

- Scan box is responsive (not hard-fixed globally).
- Compute from available height and clamp to bounded sizes.
- Vertical bias is slightly upward when universal action hub is visible.

### 4.3 Zone C rules

- Show only in `scanIntent=universal` after successful capture.
- Hide in contextual flow.
- Constrain sheet height by viewport class and enable internal scrolling for overflow.

## 5) Sizing Governance (Phone/Tablet)

### 5.1 Phone sizing

- Action hub max height target: 38% to 45% of viewport height.
- Scan box clamp target: min 220, max 320.
- Keep one primary CTA and up to two secondary visible actions.

### 5.2 Tablet sizing

- Action hub max height target: 30% to 36% of viewport height.
- Scan box clamp target: min 280, max 420.
- Preserve same action hierarchy, with wider card and lower relative height.

## 6) Universal Action Hub Density Rules

- Primary visible actions capped to focused shortlist.
- Additional utility actions should be secondary and non-disruptive.
- Do not exceed practical button stack depth for short screens; use progressive disclosure if needed.

## 7) Bottom Safe-Area and Tab Bar Reservation

- Always reserve bottom tab bar + safe-area inset when placing universal action hub.
- Action hub must never visually collide with tab bar chrome.

## 8) Keyboard and Editing Behavior

- Barcode input in universal mode is editable.
- On keyboard open, preserve action hub usability by allowing content scroll and keeping CTA visibility deterministic.

## 9) Acceptance Criteria

- No visual overlap between universal action hub and bottom tab bar on supported devices.
- Scan box remains fully visible and usable in both contextual and universal modes.
- Universal action hub remains readable and actionable on phone + tablet.
- CTA hierarchy remains clear (one primary + focused secondary actions).

## 10) QA Checklist

- iOS + Android phone portrait: scan box, helper row, action hub spacing validated.
- Tablet landscape + portrait: same flow semantics, no overlap.
- Universal mode with long content and keyboard open: no clipped primary CTA.
- Contextual mode: no universal hub rendered.

## 11) Risks and Mitigations

- Risk: fixed offsets break on smaller devices.
- Mitigation: bounded responsive sizing from available height, not single constant offsets.

- Risk: overcrowded universal hub.
- Mitigation: strict action list and progressive disclosure for secondary utilities.
