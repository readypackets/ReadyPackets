# WCAG 2.2 AA public-site audit basis

**Sources consulted:**

1. W3C, [Web Content Accessibility Guidelines (WCAG) 2.2](https://www.w3.org/TR/WCAG22/), W3C Recommendation, 12 December 2024.
2. W3C Web Accessibility Initiative, [What's New in WCAG 2.2](https://www.w3.org/WAI/standards-guidelines/wcag/new-in-22/).
3. W3C Web Accessibility Initiative, [How to Meet WCAG (Quick Reference)](https://www.w3.org/WAI/WCAG22/quickref/).

## Applied audit baseline

WCAG 2.2 is the current target for new ReadyPackets public-site work. It is backward-compatible with WCAG 2.1 and 2.0, and W3C recommends the current version for accessibility work. This release targets **Level AA**. The audit covers the four WCAG principles: perceivable, operable, understandable, and robust.

The 2.2 additions given particular implementation attention are: Focus Not Obscured (Minimum) (2.4.11, AA), Dragging Movements (2.5.7, AA), Target Size (Minimum) (2.5.8, AA), Consistent Help (3.2.6, A), Redundant Entry (3.3.7, A), and Accessible Authentication (Minimum) (3.3.8, AA).

| Requirement | Public-site implementation focus |
| --- | --- |
| 2.4.11 Focus Not Obscured (AA) | Preserve a visible, sufficiently offset focus target beneath the sticky header; modal and mobile navigation focus must be contained and recover predictably. |
| 2.5.7 Dragging Movements (AA) | Do not make public-site functions depend on dragging; any future draggable control requires a single-pointer alternative. |
| 2.5.8 Target Size (AA) | Ensure pointer targets are at least 24×24 CSS pixels or satisfy the spacing exception; retain the project’s 44px mobile controls where appropriate. |
| 3.2.6 Consistent Help (A) | Keep contact and self-service help pathways in a consistent relative order in the shared header/footer. |
| 3.3.7 Redundant Entry (A) | Retain previously supplied information within a multi-step flow when it is requested again, except where security makes re-entry necessary. |
| 3.3.8 Accessible Authentication (AA) | Allow password manager support and paste; retain accessible alternatives such as the existing magic-link mechanism rather than using CAPTCHA or cognitive puzzles. |

## Important limitation

Automated checks and source inspection can identify many errors, but WCAG conformance requires representative manual keyboard and assistive-technology evaluation as well. This release documents technical remediation and regression checks; it does not claim legal certification or replace an independent accessibility audit.

## Deployed verification — 2026-08-12

The production route `https://myportal.readypackets.com/accessibility` returned successfully over HTTPS and rendered the accessibility statement, visible support pathways, FAQ link, contact link, shared header, and shared footer. Keyboard verification confirmed that a first Tab key press reaches the **Skip to main content** link and makes it visible at the top-left of the viewport, rather than leaving it visually hidden. This confirms the shared skip-link control is present and reachable before primary navigation on the deployed public page.
