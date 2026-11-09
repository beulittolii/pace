# Adaptive vocabulary stage layout

Approved: keep the current PACE style while letting the remaining ordinary vocabulary cards fill their container: one card full-width, two equal halves, three existing equal columns. On mobile stack remaining cards without orphan dividers or empty slots. Apply to both schedule detail and student vocabulary lists. Keep exclusions, ordering, attempts and grading unchanged.

Approaches: use CSS implicit equal-width columns based on the actual rendered cards (chosen); passing a separate count from JavaScript duplicates existing rendering decisions; replacing cards with a different design adds unnecessary visual change. Remove fixed three-column utility classes, let the shared stage grid create one column per actual card, and retain the detail surface's current padding and real-card-only dividers. Mobile explicitly resets the grid to one column. No new dependencies or database changes.

Verify actual browser geometry at desktop, tablet and mobile widths for all seven nonempty ordinary-mode combinations, including passed/locked cards, the detail modal and the student list. Publish through the existing main/GitHub Pages flow after tests and review.
