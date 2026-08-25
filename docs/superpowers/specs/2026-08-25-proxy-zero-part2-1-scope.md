# PROXY ZERO Part 2-1 Scope

## Goal

Create an additive, runtime-neutral campaign/content seam for the roughly 30-minute commercial expansion, then prove one small Stage 2 opening encounter through the existing deterministic wave director.

## Frozen campaign contract

- Five full stages with 30 minutes of target play time in total.
- Three formal boss capstones and two boss-grade elite capstones.
- HAN, MINA, and JIN remain the complete roster; each expansion must reach at least three unique techniques and eighteen authored combat animations (up from the Stage 1 baseline of two techniques and sixteen clips).
- Arcade entry remains character select directly into combat, with `LIFE ×2` and no story cutscenes.
- Stage 1 is the compatibility anchor and must keep its current behavior.

## Part 2-1 implementation

1. Add pure TypeScript campaign and combat-slice contracts plus fail-fast validators.
2. Add an immutable five-stage campaign topology without wiring it into Phaser.
3. Add one Stage 2 opening-wave slice using only existing enemy IDs.
4. Unit-test topology counts, duration, arcade invariants, immutability, invalid content rejection, and an immediate deterministic spawn through the existing wave director.

## Hard boundaries

- Do not change graphics, backgrounds, HUD, input, deployment, existing Stage 1 content, or scene files.
- Do not add cutscenes, story flow, save migration, new assets, new enemy behavior, balance changes, or runtime routing.
- Stage 2 capstone gameplay, Stages 3–5 content, new moves/animations, audio, difficulty, and polish belong to later scoped work. Part 2-2 does not begin here.

## Acceptance

- Only new documentation, domain/content directories, and a focused unit test are added.
- The first opening-wave enemy is emitted at time zero and the first-spawn budget stays at or below four seconds.
- Campaign validation rejects any drift from five stages, three bosses, two boss-grade elites, the 30-minute target sum, immediate arcade entry, `LIFE ×2`, no cutscenes, or the full three-character roster.
- Focused tests, full unit/integration tests, TypeScript checking, and the production build pass.
