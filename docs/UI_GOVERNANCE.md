Quick index:
- Bottom sheet vs modal selection criteria: see **MASTERPLAN 1.13 Bottom Sheet vs Modal Selection Governance (Locked)** and **memory 2026-03-05 Bottom Sheet vs Modal Selection Lock**.

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

# UI Governance

**Goal:** A single, business-grade design language across iOS and Android, consistent on phone and tablet.

This document defines the “how” of UI: surfaces, buttons, rows, typography, states, and interaction rules.

---

## 0. Cognitive-Emotional UX Governance (App + Website)

This framework is mandatory for premium UX quality across mobile app and website.

### 0.1 Principle 1 - Halo Effect
- First viewport must communicate value + primary action clearly.
- Visual polish (spacing, hierarchy, alignment, motion) must be release-ready.
- Perceived loading quality must be intentional (`skeleton` over long spinner where possible).

### 0.2 Principle 2 - Cognitive Load + Cognitive Fluency

## Header Governance

- Top headers are fixed top chrome.
- Top headers must stay pinned while the screen body scrolls.
- Do not place the primary top header inside scrollable content.
- If a screen needs sticky in-card subheaders, those are separate from the primary top header and must not replace it.
- One dominant task per screen.
- Use progressive disclosure for advanced controls.
- Labels/microcopy must be concrete and predictable.
- Favor familiar interaction patterns in operational workflows.
- Moving forward, the default screen shell is:
  - fixed top header
  - scrollable body underneath
  - no giant outer wrapper card around the whole screen
  - bottom safe-area scrim handled by the screen shell rather than custom one-off overlays

### 0.3 Principle 3 - Micro-Interactions + Peak-End Rule
- Every tap/action returns immediate feedback.
- Validation feedback should be inline and corrective.
- End each critical flow with closure (confirmation + what happens next).

### 0.4 Release Gate (Required)
- UX work is not done unless all three principles pass for affected flows.
- Use `docs/COGNITIVE_EMOTIONAL_UX_MASTERPLAN.md` for phased implementation and KPI governance.

---

## 1. Layout Standards

### 1.1 Device rules
- **Phone:** portrait-only
- **Tablet:** portrait + landscape allowed

### 1.2 Containers
- Use `BAIScreen` as the root.
- Treat the screen as the canvas; `BAIScreen` owns the page shell.
- Use `BAISurface` for independent sections, not as one giant full-screen wrapper by default.
- Avoid raw bordered `<View>` cards; default to `BAISurface`.

### 1.2.1 Base screen shell (locked)
- Canonical shell:
  - `BAIScreen` root
  - fixed top header above the body
  - one main body scroll owner
  - section surfaces inside the body
  - bottom safe-area scrim when the screen runs into the dock / safe-area edge
- Standard screen paddings:
  - phone horizontal body padding: `12`
  - tablet horizontal body padding: `16`
  - section-to-section vertical gap: `12`
  - section surface inner padding: `16`
  - extra bottom breathing margin above dock/safe-area overlap: `12`
  - keyboard-open bottom padding for the standard scrolling shell: `250`
- Hide the vertical scrollbar on polished operational screens unless usability clearly requires it.
- Prefer centered bounded content width on large screens.
- On narrow screens, stack horizontally competitive hero/action/stat layouts instead of forcing tablet-style side-by-side composition.

### 1.3 Spacing
- Use consistent padding patterns (do not improvise spacing per screen).
- Ensure list containers “kiss” the bottom tab bar (avoid floating gaps).
- Start from `paddingTop: 0`; spacing should not be used to compensate for broken shell ownership.

---

## 2. BAISurface (Primary Container)

BAISurface is the default container component.

### 2.1 Radius system (locked)
- Default surface radius: **24**
- Medium: 20
- Compact: 16
- Hero: 28–32
- Full-bleed: 0

Buttons/inputs remain smaller radius (8–12). Do not apply surface radii to controls.

### 2.2 Visual treatment
- Subtle border + shadow
- Minimal Android elevation (avoid “card stack” look)

---

## 3. Typography (BAIText)

- Use `BAIText` variants (h1/h2/subtitle/body/caption/numeric).
- Avoid platform fonts divergence; let the theme handle it.
- Always provide readable contrast; do not hardcode text colors unless absolutely necessary.

---

## 4. Buttons (BAIButton)

### 4.1 Button hierarchy
- **Primary solid**: single commit action per screen (Save, Continue, Create)
- **Secondary outline**: alternatives (Cancel, Later)
- **Tertiary soft/ghost**: utilities (Learn more, View details)

### 4.2 Contrast rule (locked)
Button title color must be computed dynamically for contrast against the actual background color (enabled and disabled).
No hard-coded title colors.

### 4.3 Action gating rule (locked)
- Any irreversible or write action uses global Busy Overlay (theme-aware).
- All buttons must respect `disabled` and `loading/busy` states.
- Prevent double submissions: disable immediately when pressed, re-enable only on completion.

---

## 5. Inputs (BAITextInput + editors)

- Enforce maxLength via `FIELD_LIMITS` (single source).
- Validate on submit; show deterministic error messages.
- For large text (Description/Notes), prefer drill-in editor screens over huge inline textareas.

### 5.1 Process Form Keyboard + Draft Governance (locked)

- Process forms with text input must implement keyboard avoidance.
- Process forms with text input must support tap-outside keyboard dismiss.
- Multi-field process forms must use **form draft persistence** (aka draft state persistence) so in-progress values survive transient interruptions until explicit save/discard.

---

## 6. Switches (BAISwitchRow)

- Switches must not be “surprise toggles.” The label must clearly describe the effect.
- Disabled state blocks interaction and dims.
- If a toggle triggers a write, use Busy Overlay or disable until completion.

---

## 7. Rows & Navigation Affordances

### 7.1 BAIPressableRow (default row)
Use for any drill-in action or picker navigation.

### 7.2 Canonical chevron (locked)
Standardize disclosure chevrons across the app:

```tsx
<MaterialCommunityIcons name="chevron-right" size={30} />
```

Do not use other chevrons or sizes.

### 7.3 No hidden actions
Avoid overflow menus for operational flows. If an action exists, it must be visible.

---

## 8. Loading / Error / Empty (mandatory)

Every list and picker must implement all three:
- Loading state
- Error state (with Retry)
- Empty state (with guidance and a CTA)

Do not ship screens that assume “data always exists”.

### 8.1 Copy Casing + Process Copy Proof (locked)

- Status/system copy must be sentence case (for example: `Loading ...`, `Could not load ...`, `... not found.`).
- Avoid duplicate process titles inside cards when the same title is already in the header.

## 8.2 Lifecycle Process Screens (Archive/Restore)

- Archive and Restore actions must navigate to dedicated process screens.
- Lifecycle process cards should apply interactive surface treatment (`surfaceInteractive`) to keep visual parity with governance rows/cards.
- Confirm success with deterministic post-action navigation closure.

## 8.3 Compact Number Format (Business Locale)

- Count labels on management/ledger screens must use business-locale compact formatting helpers (for example `formatCompactNumber`) rather than ad-hoc `toLocaleString` or raw numeric rendering.

---

## 9. Tablet UI Rules

Allowed tablet advantages:
- two-pane layouts (list + detail)
- inline inspectors
- persistent toolbars

Not allowed:
- drawers
- dropdowns in operational flows
- hidden “more” menus for primary actions

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

### 3.4 Media governance

AI background removal is allowed **only** for product images, not avatars/covers/logos.

#### 3.4.1 Media delivery governance (public vs private) — locked
BizAssist must use a tiered delivery policy by `MediaKind` to balance POS-grade performance with privacy.

**Public delivery (stable URLs; cache-friendly; recommended for speed):**
- `product-image` → bucket `product-media` **PUBLIC**
- `business-logo`, `business-cover` → bucket `business-assets` **PUBLIC** (default)

**Private delivery (signed URLs; used only when privacy is required):**
- `user-avatar`, `user-cover` → bucket `user-media` **PRIVATE** by default

**Rules (non-negotiable):**
1. **Never sign what you do not need to protect.** Signed URLs introduce cache misses and list/tile latency in mobile and web.
2. **Public buckets must return stable public URLs** via `getPublicUrl(path)` (no token query params). These URLs are the canonical delivery format for product and business branding images.
3. **Private buckets may return signed URLs**, but the API must not rotate URL identities on every read:
   - Cache `{bucket, path} → {signedUrl, expiresAt}` and reuse until near expiry (refresh only within a short grace window).
4. **Cache headers for public images must be aggressive** for immutable assets (e.g., `public, max-age=31536000, immutable`) to maximize CDN + client cache hit rate.
5. **Mobile must use `expo-image` with disk cache** for list/tile surfaces.
6. **Web must consume the same delivery URLs** (public URLs for product/branding; signed URLs only for user-private media when required).

**Objective:** Product and POS tile imagery must be instant after first load; privacy controls apply only to user identity media.
