# Task 13 actor asset provenance

## Ownership and permitted use

All actor source images in `art/source/task13/` were generated during the PROXY ZERO Codex production task from original prompts. They do not contain third-party game art, named characters, logos, trademarks, or copied assets. The resulting atlases and metadata are project-authored build artifacts intended for PROXY ZERO.

The five original reference PNGs are retained as immutable evidence. Four `*-keyed.png` production siblings replace their baked preview checker with a uniform magenta or green matte while preserving the original character pixels and white costume details. Runtime files are generated only from the keyed siblings; the original sources remain available for visual comparison.

## Deterministic transformation

`scripts/generate-sprite-atlas.mjs` performs the complete offline transformation with `pngjs`:

1. samples the four-corner chroma key and converts key distance to alpha;
2. finds adaptive foreground-projection valleys instead of assuming equal pose spacing;
3. slices the three player strips and the lower six rows of the 9-by-8 roster;
4. removes isolated compression specks and the three proven distant edge-cut remnants from the player down-pose slots;
5. applies one shared scale per profile and aligns every cell bottom-center;
6. records profile-wide visible alpha bounds for stable 640x360 edge clamping;
7. writes three RGBA PNG sheets plus Phaser multiatlas and animation manifests.

No runtime image generation, remote API, secret, or paid asset is required. `npm run art:sprites` reproduces the shipped output locally.

## Current shipped output

| File | SHA-256 | Bytes |
|---|---|---:|
| `actors_players.png` | `cccd0f1873403b4b3470e414b9557b4d18d8f3a94fc580d98325a3c97bac5073` | 2,442,604 |
| `actors_enemies.png` | `14fac668977e17d2d07cfdecc5c5c8489242a450dc2e90a439befa43c84813b8` | 1,993,884 |
| `actor_boss.png` | `85cc56b0b83b569510d0b699164f4a320cd53adaccf638801052d4bdb7605c69` | 764,455 |
| `actors.multiatlas.json` | `6de978bf076a322ad22dbded1ad2ab9847679d0bc85b75ba6ba62a030cf5e113` | 134,116 |
| `actors.anim.json` | `d4d68169d9e9ce756dfd8379269783dfb45900eb3eaa4084e343f8498db267e8` | 35,386 |

The actor payload totals 5,370,445 bytes, below the current six-megabyte Task 13 target. Formal whole-build 15 MB initial / 40 MB distribution enforcement remains owned by Task 16.

## Automated evidence

`tests/unit/animationManifest.test.ts` runs the exporter into two independent temporary directories and requires byte-identical hashes for all five outputs. It also checks all nine profiles, all authored attack mappings, frame uniqueness/completeness, atlas bounds, untrimmed pivots, exact idle target heights, bottom baselines, distinct player silhouettes, actual per-profile visible alpha bounds, 640x360 clamp limits, and the absence of significant distant connected components in every generated frame.

`tests/integration/actorPresentation.test.ts` proves deterministic domain-clock frame selection, priority order, normal-enemy reducer-ID reverse mapping, and elite/boss telegraphs. Phaser wall-clock animation is not authoritative, so full hitstop preserves the current pose.
