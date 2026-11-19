# Ink & Spark implementation plan

**Goal:** Implement the approved light theme from https://claude.ai/artifact/BZtERFLqBT8tjbZvPtAxhc in the real learning application.

**Architecture:** Keep all authored colors in the existing theme.css. Repoint every semantic alias, retain stable palette identifiers, and introduce a brand accent separate from primary actions. Use one decorative SVG sticker component and shared brand component; preserve all real learning and settings behavior.

**Scope:** White/ink surfaces, restrained yellow, local Bricolage/Inter fonts, 1px outlines and 2px selection, desktop/mobile Today and Settings, consistent secondary screens. No design-review toolbar or fictional providers in production. No dark mode.

- [x] Repoint semantic theme roles and add shape/font tokens; retain the color guard.
- [x] Add shared brand and coherent decorative stickers for Today and empty states.
- [x] Update layout, typography, control states and mobile navigation/settings.
- [x] Run check, build, full test suite; inspect desktop and mobile in the browser.

Verification focuses on actual behavior already covered by the suite; visual changes are checked in the running app instead of tests that mirror CSS. Inspect overflow, keyboard focus, disabled controls, provider drawer, all settings sections, and secondary learning screens.

Validation: npm run check (zero errors/warnings), npm run build, npm test (39 files / 163 tests); desktop Today and all three Settings sections, 390px Today/Settings and real provider bottom sheet inspected. Independent review found a footer contrast issue, fixed to ink. Mobile navigation received a follow-up review with no new findings. No saved settings or paid AI requests were changed during visual checks.
