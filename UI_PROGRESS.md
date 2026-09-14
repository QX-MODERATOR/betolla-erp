# UI batch — 2026-09-14
- Delivery: light Betolla palette, clearer header and summary, customer/phone/area/order search, detailed list default and single-column mobile cards, touch targets and keyboard focus.
- Global Arabic typography changed to Tajawal; browser zoom enabled. No API/storage changes.
- Verified: TypeScript noEmit passed; narrow mobile browser rendered heading, summary, search and filters. Isolated preview has no orders: populated cards, financial actions and desktop visual check are unverified.
- Existing data persistence/partial-collection defects remain outside this UI batch. No production connection used.
- Next: inspect populated delivery cards using isolated fixtures and validate desktop/modal layout before extending design to other sections.
- Focused ESLint did not finish and was stopped; lint is unverified. TypeScript passed again after final edits.
