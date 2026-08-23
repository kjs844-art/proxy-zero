# PROXY ZERO Stage 1 Implementation Plan

> **For Codex:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Keep Stage 2 out of every implementation task.

**Goal:** Ship a polished, immediately playable 8–12 minute PC-browser belt-scrolling arcade demo with three characters, four-limb combat, two lives, one Continue, three zones, one elite, one final boss, results, and a public submission URL.

**Architecture:** Phaser 3 owns scenes, input collection, rendering, camera, and audio. Deterministic 60 Hz pure-TypeScript domain modules own movement, X/Y/Z combat, buffered attacks, hits, lives, checkpoints, waves, items, and ranking. Content is data-driven, while presentation observes emitted domain events. This keeps combat testable without a browser and lets art/VFX work proceed without changing rules.

**Tech Stack:** Vite 8.2.2, TypeScript 7.0.2, Phaser 3.90.0, Vitest 4.1.1, static GitHub Pages, original procedural/canvas-authored placeholder assets upgraded to original pixel-hybrid sprites and audio.

**Approved source:** `docs/superpowers/specs/2026-08-24-proxy-zero-stage-one-design.md`

**Working branch:** `codex/firstvibe/proxy-zero-stage1`

**Progress rule:** Only award the documented percentage after the matching tests/build/play evidence pass. Every two hours: inspect Spark, assign one non-overlapping Stage 1 task if idle, test, build, commit, push, and report evidence.

---

## Task 1: Establish the web project and quality gates

**Files:**
- Create: `.gitignore`
- Create: `.npmrc`
- Create: `package.json`
- Create: `package-lock.json`
- Create: `index.html`
- Create: `tsconfig.json`
- Create: `vite.config.ts`
- Create: `vitest.config.ts`
- Create: `src/vite-env.d.ts`
- Create: `src/styles.css`
- Create: `src/main.ts`
- Create: `src/app/createGame.ts`
- Create: `tests/unit/smoke.test.ts`

**Step 1: Write the failing smoke test**

```ts
import { describe, expect, it } from 'vitest'
import { GAME_HEIGHT, GAME_WIDTH } from '../../src/app/createGame'

describe('game shell', () => {
  it('uses the approved 16:9 logical canvas', () => {
    expect([GAME_WIDTH, GAME_HEIGHT]).toEqual([640, 360])
  })
})
```

**Step 2: Run the test to verify it fails**

Run: `npm test -- --run tests/unit/smoke.test.ts`
Expected: FAIL because `src/app/createGame.ts` does not exist.

**Step 3: Create the minimal Vite/Phaser shell**

- Pin the dependency versions listed above and expose `typecheck`, `test:run`, `build`, `verify`, `qa:e2e`, `qa:fps`, `qa:size`, and `qa:public` scripts as the permanent release interface.
- Use `base: './'` so the same build works locally and under GitHub Pages.
- Set the logical canvas to 640×360 with FIT scaling, centered auto layout, nearest-neighbor sampling, and exact 2× presentation at 1280×720.
- Make `createGame(parent)` the only place that constructs `Phaser.Game`.
- Add `.npm-cache/`, `node_modules/`, `dist/`, `test-results/`, and `playwright-report/` to `.gitignore`.
- Set `cache=.npm-cache` in `.npmrc` to avoid the machine-level npm cache permission failure.

**Step 4: Verify**

Run: `npm install`
Run: `npm test -- --run tests/unit/smoke.test.ts`
Run: `npm run typecheck`
Run: `npm run build`
Expected: all pass and `dist/index.html` exists.

**Step 5: Commit**

```bash
git add .gitignore .npmrc package.json package-lock.json index.html tsconfig.json vite.config.ts vitest.config.ts src tests
git commit -m "build: scaffold proxy zero web game"
```

## Task 2: Define domain contracts and fixed-step runtime

**Files:**
- Create: `src/domain/shared/types.ts`
- Create: `src/domain/combat/types.ts`
- Create: `src/domain/combat/tuning.ts`
- Create: `src/domain/run/types.ts`
- Create: `src/runtime/FixedStepRunner.ts`
- Create: `tests/unit/FixedStepRunner.test.ts`

**Step 1: Write failing fixed-step tests**

Test that:
- 16.6667 ms advances one domain step.
- a 50 ms render gap advances three domain steps.
- a single frame cannot run more than five catch-up steps.
- paused time advances zero steps.

**Step 2: Run and confirm failure**

Run: `npm test -- --run tests/unit/FixedStepRunner.test.ts`

**Step 3: Implement minimal contracts**

Use these stable identities:

```ts
export type CharacterId = 'han' | 'mina' | 'jin'
export type ZoneId = 'n9-depot' | 'service-train' | 'flooded-tunnel'
export type ItemId = 'emp' | 'repair-kit'
export type LimbInput = 'right-hand' | 'left-hand' | 'right-foot' | 'left-foot'
export interface Vec3 { x: number; y: number; z: number }
```

Use a 60 Hz accumulator with a five-step catch-up cap. Phaser delta is input only; no combat rule may read a Phaser body or tween.

**Step 4: Verify and commit**

Run: `npm test -- --run tests/unit/FixedStepRunner.test.ts`
Run: `npm run typecheck`
Commit: `feat: add deterministic fixed step domain`

## Task 3: Implement keyboard input and the 180 ms action buffer

**Files:**
- Create: `src/domain/combat/inputBuffer.ts`
- Create: `src/phaser/input/KeyboardInputAdapter.ts`
- Create: `tests/unit/inputBuffer.test.ts`
- Create: `tests/unit/KeyboardInputAdapter.test.ts`

**Step 1: Write failing tests**

Cover FIFO order; default 180 ms; attack-specific 140 ms and 220 ms bounds; consumption just before and expiration after the boundary; pause freezing domain time; `event.repeat` ignored; no simultaneous-key technique; and `preventDefault()` only while the canvas owns focus.

**Step 2: Implement**

- Movement is continuous state.
- `J/K/L/;/Space/Q/E` are keydown edges.
- Buffer entries contain sequence, edge, enqueue time, expiration, and optional attack candidate.
- The adapter never interprets combos.

**Step 3: Verify and commit**

Run: `npm test -- --run tests/unit/inputBuffer.test.ts tests/unit/KeyboardInputAdapter.test.ts`
Commit: `feat: add keyboard input buffer`

## Task 4: Implement attack data and combo resolution

**Files:**
- Create: `src/domain/combat/comboResolver.ts`
- Create: `src/content/attacks.ts`
- Create: `src/content/characters.ts`
- Create: `tests/unit/comboResolver.test.ts`
- Create: `tests/unit/characters.test.ts`

**Step 1: Write failing tests**

Cover:
- four normal attacks per character;
- two fixed techniques, one jump attack, and one unique super per character;
- longest completed recipe wins;
- no recipe delays the immediate normal attack;
- max-gap, grounded/airborne, and meter requirements;
- exact approved HP/damage/speed/move scales;
- scripted 10-second training DPS remains within ±5% after tuning.

**Step 2: Implement data-first attacks**

Every attack defines startup, active, recovery, 140–220 ms buffer, hitbox, damage, hitstun, knockback, launch, hit count, meter, grounded/airborne flags, and super armor. Calculate the cancel boundary as:

```ts
const cancelStartMs = startupMs + activeMs * (1 - 0.35)
```

**Step 3: Verify and commit**

Run: `npm test -- --run tests/unit/comboResolver.test.ts tests/unit/characters.test.ts`
Commit: `feat: define characters and attack chains`

## Task 5: Implement pure combat simulation

**Files:**
- Create: `src/domain/combat/combatReducer.ts`
- Create: `src/domain/combat/hitResolver.ts`
- Create: `tests/unit/combatReducer.test.ts`
- Create: `tests/integration/combatLoop.test.ts`

**Step 1: Write failing rule tests**

Cover startup/active/recovery; active-tail cancel; X/Y/Z move and landing; light/heavy/finisher hitstop 45/75/110 ms; per-target hit caps; damage; hitstun; knockback; 850 ms knockdown; 450 ms wake invulnerability; hitstop not double-advancing; and emitted combat events.

**Step 2: Implement reducer and collision math**

- Use deterministic AABB overlap in X/Y plus Z range.
- Sort actor IDs before resolving hits to ensure stable order.
- Clear transient events at the beginning of each fixed step.
- Freeze combat timers during hitstop, but consume hitstop itself.
- Keep presentation-only shake, particles, and sound out of state.

**Step 3: Verify and commit**

Run: `npm test -- --run tests/unit/combatReducer.test.ts tests/integration/combatLoop.test.ts`
Commit: `feat: implement deterministic combat kernel`

## Task 6: Create the five-scene playable greybox

**Files:**
- Create: `src/app/GameServices.ts`
- Create: `src/phaser/scenes/BootScene.ts`
- Create: `src/phaser/scenes/TitleScene.ts`
- Create: `src/phaser/scenes/CharacterSelectScene.ts`
- Create: `src/phaser/scenes/CombatScene.ts`
- Create: `src/phaser/scenes/ResultsScene.ts`
- Create: `src/phaser/actors/ActorView.ts`
- Create: `src/presentation/HudController.ts`
- Modify: `src/app/createGame.ts`
- Create: `tests/integration/sceneFlow.test.ts`

**Step 1: Write the failing flow test**

Assert the typed route `Boot → Title → CharacterSelect → Combat → Results`, all three choices, character confirmation enabling input by simulated 2 seconds, and the first enemy spawning by simulated 4 seconds.

**Step 2: Implement the playable loop**

- Boot generates or loads the minimum texture atlas and checks mobile/save/audio.
- Title is a single `PRESS START` screen.
- Character select shows HAN/MINA/JIN with immediate keyboard choice.
- Combat maps domain actors to Phaser views using `screenY = y - z` and `depth = y`.
- Results initially accepts a debug-clear signal, later replaced by the stage director.
- Use original geometric silhouettes only as temporary greybox art.

**Step 3: Manual smoke check**

Run: `npm run dev -- --host 127.0.0.1`
Verify: press start, select each character, WASD, Space, J/K/L/;, and one enemy can be defeated.

**Step 4: Verify and commit**

Run: `npm test -- --run tests/integration/sceneFlow.test.ts`
Run: `npm run build`
Commit: `feat: deliver first playable combat greybox`

**Progress gate:** Movement/camera/collision can earn up to 10%; combat can begin earning its 20% only after this browser smoke check.

## Task 7: Implement run lives, death, Continue, and checkpoint storage

**Files:**
- Create: `src/domain/run/runReducer.ts`
- Create: `src/runtime/CheckpointStore.ts`
- Create: `tests/unit/runReducer.test.ts`
- Create: `tests/unit/CheckpointStore.test.ts`
- Modify: `src/phaser/scenes/CombatScene.ts`

**Step 1: Write failing tests**

Cover start `LIFE ×2`; first death `2→1`; same-wave respawn with full HP and 1,200 ms invulnerability; second death Game Over; one Continue only; Continue restores zone start, LIFE×2, full HP, saved inventory, zero score, rank cap C; no enemy HP/boss phase/combo/temporary effect restoration; corrupt and unsupported save reset safely.

**Step 2: Implement and integrate**

The first-life respawn retains current wave state. Continue recreates the full current zone from the checkpoint. Store only schema-versioned approved checkpoint fields in localStorage.

**Step 3: Verify and commit**

Run: `npm test -- --run tests/unit/runReducer.test.ts tests/unit/CheckpointStore.test.ts`
Commit: `feat: add lives continue and checkpoints`

## Task 8: Implement enemies, seeded decisions, and wave recovery

**Files:**
- Create: `src/content/enemies.ts`
- Create: `src/domain/enemies/types.ts`
- Create: `src/domain/enemies/enemyBrain.ts`
- Create: `src/domain/waves/waveDirector.ts`
- Create: `src/runtime/SeededRandom.ts`
- Create: `tests/unit/enemyBrain.test.ts`
- Create: `tests/unit/waveDirector.test.ts`

**Step 1: Write failing tests**

Cover two base bodies and their variants; same seed gives same intent sequence; telegraphed attack ranges; spawn order/delay; clear only after all orders and defeats; offscreen return after 2 seconds; forced re-entry after 8 seconds without progress; never teleport beside the player; zone-reset reconstruction.

**Step 2: Implement**

Use small state machines: patrol/chase/telegraph/attack/recover/guard/down. Brains consume immutable domain snapshots and injected RNG only.

**Step 3: Verify and commit**

Run: `npm test -- --run tests/unit/enemyBrain.test.ts tests/unit/waveDirector.test.ts`
Commit: `feat: add deterministic enemies and waves`

## Task 9: Build Zone 1, N-9 Depot, from start to clear

**Files:**
- Create: `src/content/stage1.ts`
- Create: `src/phaser/world/ZoneRenderer.ts`
- Create: `src/phaser/world/HazardView.ts`
- Create: `tests/integration/depotZone.test.ts`
- Modify: `src/phaser/scenes/CombatScene.ts`

**Step 1: Write a failing zone integration test**

Assert arrival, three escalating waves, arena locks/unlocks, no progression deadlock, target simulated duration, and transition card under 2 seconds.

**Step 2: Implement a three-minute playable depot**

Teach movement and all four attacks through enemy arrangement, not text. Use wet rail-yard parallax, tungsten pools, cyan reflections, and warning-red accents.

**Step 3: Manual play and verify**

Run all unit/integration tests and build. Play HAN once from title to zone clear.
Commit: `feat: complete n9 depot zone`

## Task 10: Implement EMP, repair kit, and inventory UI

**Files:**
- Create: `src/domain/items/itemReducer.ts`
- Create: `src/content/items.ts`
- Create: `src/presentation/InventoryHud.ts`
- Create: `tests/unit/itemReducer.test.ts`
- Modify: `src/phaser/scenes/CombatScene.ts`

**Step 1: Write failing tests**

Cover Q cycling; E prioritizing a nearby pickup over use; EMP radius/duration and boss resistance; repair cap at max HP; checkpoint serialization; consumed item removal.

**Step 2: Implement and integrate**

Keep only two one-slot counts. Make the selected item and count readable without opening a menu.

**Step 3: Verify and commit**

Run: `npm test -- --run tests/unit/itemReducer.test.ts`
Commit: `feat: add combat items and inventory hud`

## Task 11: Build Zone 2 and the elite fight

**Files:**
- Modify: `src/content/stage1.ts`
- Create: `src/content/elites.ts`
- Create: `src/phaser/world/TrainBackdrop.ts`
- Create: `tests/integration/trainZone.test.ts`

**Step 1: Write failing integration tests**

Cover moving-background lifecycle, fall-warning recovery, mixed waves, both item drops, elite telegraph/pattern/defeat, and transition to zone 3.

**Step 2: Implement a three-minute train zone**

Use a looping parallax train, authored warning strips, controlled platform hazards, and one elite built from the heavy base body with a unique silhouette and two readable patterns.

**Step 3: Verify and commit**

Run targeted tests, full suite, build, and manual zone play.
Commit: `feat: add service train and elite battle`

## Task 12: Build Zone 3 and the final boss

**Files:**
- Modify: `src/content/stage1.ts`
- Create: `src/content/bosses.ts`
- Create: `src/phaser/world/TunnelBackdrop.ts`
- Create: `tests/integration/tunnelBoss.test.ts`

**Step 1: Write failing integration tests**

Cover electrified puddle telegraph/safe lane; train-entry warning; boss phase thresholds; deterministic pattern loops; boss reset on Continue; final defeat to Results.

**Step 2: Implement a four-minute tunnel finale**

Give the boss three phase variations over two core moves plus one environmental interaction. Do not add story dialogue or a new system.

**Step 3: Verify and commit**

Run targeted tests, full suite, build, and play all zones once.
Commit: `feat: complete flooded tunnel boss finale`

## Task 13: Replace greybox characters with a coherent original rigged pixel-hybrid set

**Files:**
- Create: `scripts/generate-sprite-atlas.mjs`
- Create: `public/assets/sprites/actors_players.png`
- Create: `public/assets/sprites/actors_enemies.png`
- Create: `public/assets/sprites/actor_boss.png`
- Create: `public/assets/sprites/actors.multiatlas.json`
- Create: `public/assets/sprites/actors.anim.json`
- Create: `public/assets/sprites/presentation.atlas.json`
- Create: `src/content/animations.ts`
- Modify: `src/phaser/actors/ActorView.ts`
- Create: `tests/unit/animationManifest.test.ts`

**Step 1: Lock the minimum animation manifest**

Use one shared 13–14-part humanoid joint layout with character-specific pixel parts and integer-snapped 10 FPS key poses. Prioritize readable silhouettes and key poses: idle, walk, jump, four attacks, hit, down, get-up, super, and pickup/use. Reuse joint motion and lower-body poses where it does not erase character identity. Enemies use idle/walk/telegraph/attack/hit/down; the elite adds armor/weapon overlays and the boss adds only its pattern poses. Target on-screen heights are players 112–124 px, normal enemies 96–128 px, elite 136 px, and boss 160–176 px.

**Step 2: Generate/export original atlases**

Use one deterministic script or clearly licensed generated source files, nearest-neighbor sampling, fixed pivots, and JSON part/joint metadata. Limit runtime art to four actor sheets, nine background layers, three presentation sheets, and three metadata files. Keep the complete asset folder under 40 MB.

**Step 3: Validate and commit**

Test that every manifest key exists in the atlas. Manually check all three silhouettes at gameplay scale.
Commit: `art: replace combat greybox with original fighters`

## Task 14: Finish HUD, hit feel, adaptive VFX, and audio

**Files:**
- Create: `src/presentation/CombatVfx.ts`
- Create: `src/presentation/AudioBus.ts`
- Create: `src/presentation/PerformanceGovernor.ts`
- Create: `scripts/generate-audio.mjs`
- Create: `public/assets/audio/`
- Modify: `src/presentation/HudController.ts`
- Create: `tests/unit/PerformanceGovernor.test.ts`
- Create: `tests/unit/AudioBus.test.ts`

**Step 1: Write failing resilience tests**

Cover low-effect mode after <45 FPS for 2 seconds, rule state unchanged by effect mode, audio-start rejection not blocking play, focus pause, combo reset, and HUD LIFE/health/meter/item consistency.

**Step 2: Implement polish**

Add event-driven hit sparks, brief flashes, directional knockback trails, approved hitstop, restrained camera shake, damage numbers only if readable, and original WebAudio-generated impacts/alarms/loop. Low-effect mode reduces only particles and shake.

**Step 3: Verify and commit**

Run all tests/build and inspect one captured gameplay frame from each zone.
Commit: `feat: polish combat presentation and audio`

## Task 15: Implement results, rank, pause-time accounting, and replay

**Files:**
- Create: `src/domain/run/rankCalculator.ts`
- Create: `tests/unit/rankCalculator.test.ts`
- Modify: `src/phaser/scenes/ResultsScene.ts`
- Modify: `src/phaser/scenes/CombatScene.ts`

**Step 1: Write failing tests**

Cover active-time-only timing; score/combo/hits/Continue factors; S–D thresholds; Continue rank capped at C; game-over record; instant retry; focus loss excluded from time and buffers.

**Step 2: Implement and verify**

Results must show time, score, max combo, hits taken, Continue status, rank, retry, and title. Avoid extra menus.

Run targeted tests, full suite, and build.
Commit: `feat: add ranking results and replay flow`

## Task 16: Add browser smoke tests and operational safeguards

**Files:**
- Modify: `package.json`
- Create: `playwright.config.ts`
- Create: `e2e/launch.spec.ts`
- Create: `e2e/controls.spec.ts`
- Create: `e2e/resilience.spec.ts`
- Create: `scripts/check-asset-budget.mjs`

**Step 1: Add failing browser tests**

Cover Chrome-compatible launch; first screen under 10 seconds; title→selection→combat; keyboard focus behavior; focus-loss pause/resume; corrupt localStorage recovery; audio denial; reload safety; mobile keyboard-only notice. Use Edge for the final manual pass if a bundled Playwright Edge channel is unavailable.

**Step 2: Add asset budget checks**

Fail CI when compressed initial assets exceed 15 MB or total public/build assets exceed 40 MB.

**Step 3: Verify and commit**

Run: `npm run test:run`
Run: `npm run typecheck`
Run: `npm run build`
Run: `npm run qa:e2e`
Run: `npm run qa:size`
Commit: `test: add browser and asset release gates`

## Task 17: Balance the complete run and freeze features

**Files:**
- Modify: `src/content/attacks.ts`
- Modify: `src/content/characters.ts`
- Modify: `src/content/enemies.ts`
- Modify: `src/content/stage1.ts`
- Create: `docs/qa/balance-runs.md`

**Step 1: Run three no-Continue normal playthroughs**

Record character, clear time, deaths, hits, max combo, score, rank, browser, and average/low FPS. Median must be 9–11 minutes and every run 8–12 minutes.

**Step 2: Tune data only**

Adjust wave count, health, damage, and telegraph windows. Do not add features or large assets after hour 36. Re-run deterministic and browser tests after each tuning pass.

**Step 3: Verify all three characters**

Complete at least one full run per character, plus one Continue path and one total Game Over path.
Commit: `balance: freeze proxy zero stage one content`

## Task 18: Deploy the public build

**Files:**
- Create: `.github/workflows/deploy-pages.yml`
- Create: `README.md`
- Create: `docs/qa/release-checklist.md`

**Step 1: Add GitHub Pages workflow**

Build on pushes to `main` and upload only `dist`. Use least-privilege Pages permissions and npm lockfile installation.

**Step 2: Validate before merge**

Run the full local gate. Merge the reviewed Stage 1 branch into `main`, push, wait for Pages, then test the public URL in a private Chrome window, Edge, and a second network if available.

**Step 3: Record evidence**

Document deployment URL, commit hash, workflow run, browser results, load time, asset sizes, FPS sample, and known non-blocking limitations.
Commit: `ci: deploy proxy zero to github pages`

## Task 19: Produce submission assets and final handoff

**Files:**
- Create: `submission/title-and-description-ko.md`
- Create: `submission/codex-collaboration.md`
- Create: `submission/video-shot-list.md`
- Create: `submission/thumbnail-1920x1080.png`
- Create: `submission/final-verification.md`

**Step 1: Create the submission package**

- Title: `PROXY ZERO`
- Korean introduction: at most 200 characters and arcade-first.
- Thumbnail: original 16:9 key art based on the shipped characters and actual color language.
- Video: at most 3 minutes of actual gameplay, showing immediate start, all three choices, four-limb combo, items, elite, boss, and results.
- Collaboration log: summarize design, Spark audits/tasks, implementation, tests, and Git checkpoints without exposing private data.

**Step 2: Final release gate**

Re-run full unit/integration/E2E/build/asset gates on the exact deployed commit. Confirm no login, no localhost URL, no missing assets, no console-blocking error, and no unlicensed material.

**Step 3: Final Git checkpoint**

Commit and push the submission package. Report 100% only after the deployed URL and every mandatory submission artifact are verified.

---

## Parallel ownership map

- **Primary Codex:** integration, active branch, progress accounting, final decisions, merges, deploy, submission.
- **Spark 5.3:** exactly one bounded idle-time task at a time; start with contract/test audits, then isolated implementation work in a separate branch/worktree after its file boundary is declared.
- **Subagent A:** pure domain/test modules only.
- **Subagent B:** original asset manifest/generator and presentation assets only.
- **Subagent C:** browser QA, Pages workflow, and submission checklist only.

No two agents edit the same file concurrently. Every delegated result is reviewed, tested, and integrated by Primary Codex. Spark never receives Stage 2 scope during Stage 1.

## Stage 1 hard stop rules

- If greybox combat is not enjoyable by the 8-hour gate, reduce background decoration before touching combat scope.
- If Zone 1 is not complete by the 16-hour gate, reduce enemy variants and parallax layers.
- At hour 36, freeze new features and large assets.
- Never cut the four attack keys, all three selectable characters, LIFE×2, one elite, one final boss, or public browser execution.
- Never count documentation, generated placeholders, or unverified code as finished gameplay percentage.
