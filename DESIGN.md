# Sunk: design direction

Reading this as a consumer money ledger for people with too many subscriptions,
in a quiet paper-and-ink visual language, dial ENERGY 2 / RHYTHM 2 / MOTION 1.

The direction below was written by the agent from the product brief, not supplied
by the owner. It is a proposal, not a brand guideline. The owner can replace it
without touching the code's structure.

## What it is

Sunk is a private subscription ledger. It answers one question before the money
leaves: what am I still paying for, and what would stopping give back?

## Identity

The product looks like a statement, not a dashboard. Paper, ink, a hairline rule,
and one running total. The name is the joke and the warning: sunk cost.

- **Paper ground, not white.** A ledger is a document you read, so the surface is
  warm paper (#F4EFE4), not the blue-white of a SaaS panel.
- **Ink, not grey.** Text is near-black (#1B1915). Muted text (#6E675C) is used
  only where it passes AA on paper.
- **One accent: oxide red (#A63A2B).** It marks money leaving: a price increase,
  a cancellation, an overdue renewal. Nothing else uses it.
- **Green only for returned money (#2E6B4C).** Savings and completed
  cancellations. It never decorates a neutral element.
- **No icons.** Labels carry the meaning. A glyph next to "Cancel" would repeat
  the word.
- **Serif for the total, sans for the controls.** Georgia (with Iowan Old Style
  and Times fallbacks) gives the running total the voice of a printed statement.
  Controls use the system UI face so they stay legible at small sizes.
- **Tabular numerals everywhere.** Columns of money must line up.

## Composition

- **The ledger is the hero.** On the landing page, the sample ledger is a working
  control, not a screenshot. Selecting a row strikes it through and updates the
  annual figure.
- **Rows, not cards.** Subscriptions are comparable line items. Cards would break
  the column alignment that makes the total readable.
- **One focal point per screen.** The monthly total is the largest element on the
  ledger. Everything else defers to it.
- **Asymmetry on the landing page.** Copy left, working ledger right. Below that,
  a full-width list of behaviors, a narrow privacy note, then two purchase
  options. The sections do not repeat the same shape.
- **No decorative grid, glow, glass, or gradient.** A hairline rule separates
  ledger rows because rows need separation. That is the only line work.

## Motion

MOTION 1: hover and focus transitions, plus a short dialog entrance. No scroll
reveals, no loops, no parallax. `prefers-reduced-motion` removes the dialog
transition.

## Type scale

- Display: `clamp(2.6rem, 7vw, 5.2rem)` for the landing headline.
- Total: `clamp(2.4rem, 6vw, 4rem)`, tabular.
- Body: 1rem to 1.125rem, line height 1.55.
- Labels: 0.75rem, letter spacing 0.06em, uppercase only for table headers.

## Themes

Light is the default because the product is paper. A dark theme is shipped
because people open money apps at night. Both use the same tokens and are
verified for contrast and focus visibility.

## What this is not

- Not a bank dashboard. No account balances, no transactions feed, no charts
  without a question.
- Not a budgeting app. It tracks recurring commitments, not spending categories.
- Not a cancellation service. It gives the user the link, the date, and the
  numbers; the user cancels.
