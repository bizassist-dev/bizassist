# Scan Frame-Gated Scanner Flow Masterplan (2026-03-07)

Status: Approved design
Scope: `mobile` scanner behavior across Inventory and POS wrapper routes
Owners: Mobile Inventory + POS flows

## 1) Problem Statement

Current scanner behavior may capture a barcode outside the intended scan frame when multiple barcodes are visible in the camera preview.

## 2) Goals

- Accept scans only when the detected barcode is inside the on-screen scan box.
- Preserve existing return flow behavior (`returnTo`, `draftId`, `scannedBarcode`, `q`).
- Keep POS scan in POS flow (`/(app)/(tabs)/pos/scan`) and Inventory scan in Inventory flow.

## 3) Non-Goals

- No OCR/text scanning.
- No multi-barcode selection UI.
- No backend/API contract changes.

## 4) Functional Design

### 4.1 In-frame acceptance rule

- On each barcode event, read detector geometry (`bounds` or `cornerPoints`) when available.
- Compute barcode center point in preview coordinates.
- Accept only if center point is inside the scan window rectangle.
- Ignore events outside the frame.

### 4.2 Reliability fallback (metadata variability)

Because geometry metadata may vary by device/OS:

- If geometry is missing, apply a safe confirmation fallback before accepting:
  - same barcode value observed repeatedly within a short window, or
  - short hold duration for the same value.
- Keep lock/debounce to avoid duplicate processing.

### 4.3 Return flow contract

- Keep current scan return contract unchanged:
  - `scannedBarcode` for barcode-driven fields.
  - `q` for search-driven screens.
  - preserve `returnTo` + `draftId` where provided.

### 4.4 UX behavior

- Keep the existing scan frame as the canonical capture area.
- Helper text should state: only barcodes inside the frame are captured.
- No additional confirmation modal in the default happy path.

## 5) Route and flow governance

- Inventory wrapper route: `/(app)/(tabs)/inventory/scan`.
- POS wrapper route: `/(app)/(tabs)/pos/scan`.
- Bottom tab scanner action must route by current workspace scope and must not cross-switch to Inventory when launched from POS.

## 6) Acceptance Criteria

- A barcode outside the scan frame does not trigger acceptance when geometry metadata is present.
- Barcodes inside the frame are accepted and routed back to origin flow.
- POS scan stays in POS wrapper flow and exits back to POS origin.
- Existing barcode consumers continue to work:
  - POS search
  - Product create/edit barcode
  - Variation barcode

## 7) QA Checklist

- Single barcode centered in frame -> accepted.
- Multiple barcodes visible, target in frame and others outside -> only target accepted.
- Barcode only outside frame -> not accepted.
- POS launch -> scan -> exit returns to POS origin.
- Inventory launch -> scan -> exit returns to Inventory origin.
- Device coverage: iOS + Android, phone + tablet.

## 8) Risks and Mitigations

- Risk: geometry metadata inconsistency by platform/device.
- Mitigation: confirmation fallback and conservative acceptance rules.

## 9) Rollout Strategy

- Implement behind existing scanner flow with no API change.
- Validate with targeted QA in POS and Inventory workflows.
- If field regressions are detected, keep fallback path to current acceptance behavior temporarily while collecting device-specific data.
