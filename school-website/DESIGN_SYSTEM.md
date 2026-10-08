# SCMS v12 — School Website Studio Design System

## Purpose
A compact, accessible, international-quality foundation for Website Studio UI.

## Principles
1. Template-first: schools configure content, not layout geometry.
2. Progressive disclosure: show the next useful action without overwhelming the editor.
3. Consistent interaction: the same action has the same visual and behavioral meaning.
4. Accessibility first: keyboard focus, readable contrast, semantic controls, reduced-motion support.
5. Responsive by default: controls remain usable on small screens.
6. Safe publishing: visual polish must never weaken tenant isolation or publication authorization.

## Interaction states
Every interactive control should account for default, hover, focus-visible, active, disabled, loading, success, and error.

## Form guidance
Labels must be persistent; placeholders are supplementary. Required fields must be explicit. Validation errors appear next to the relevant field. Do not rely on color alone.

## Responsive behavior
Minimum interactive target: 44px. Avoid horizontal scrolling in primary workflows. On narrow screens, stack controls rather than shrinking text below readable sizes.

## Accessibility
Prefer native semantic controls. Preserve visible keyboard focus. Respect prefers-reduced-motion. Use descriptive names for icon-only controls. Maintain logical heading hierarchy.

## UX quality gate
Before a Website Studio UI change is merged: keyboard-only flow is usable; focus is visible; mobile layout does not overflow; loading/error/success states are defined; no private SCMS data is introduced into public website UI.
