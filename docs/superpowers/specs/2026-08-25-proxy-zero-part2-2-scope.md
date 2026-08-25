# PROXY ZERO Part 2-2 Scope

## Goal

Turn the Part 2-1 campaign topology into a testable, runtime-neutral progression slice without connecting it to Phaser or modifying Stage 1 presentation work.

## Additive slice

- Define the authored `Stage 1 → 2 → 3 → 4 → 5 → complete` route.
- Validate that all five stages are reachable in order and therefore all three bosses and both boss-grade elites are reachable.
- Advance campaign state only from an explicit stage-clear event.
- Create stage-start checkpoints and a single-Continue contract that restores `LIFE ×2` directly into combat with no cutscene.
- Prove a Stage 3 opening-wave fixture against existing enemy resolvers and the deterministic wave director.

## Hard boundaries

- Add new domain, content, documentation, and test files only.
- Do not modify Stage 1 content, graphics, scenes, HUD, input, deployment, or existing Part 2-1 files.
- Do not add start cinematics, long-form story, new assets, runtime enemy AI, capstone gameplay, or Phaser routing.
- Part 2-2 stops at contracts and the verified Stage 3 opening fixture.

## Acceptance

- Route validation rejects missing, duplicate, skipped, cyclic, or out-of-order stages.
- Every capstone is reported reachable with exactly three bosses and two boss-grade elites.
- Stage clear reaches campaign completion only after Stage 5.
- Continue rejects exhausted use and restores only stage position, `LIFE ×2`, and immediate combat; combat state is not serialized.
- The focused tests, complete test suite, type check, production build, and `git diff --check` pass.
