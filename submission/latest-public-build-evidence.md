# PROXY ZERO — latest public build evidence

This file records only the currently verified public Stage 1 build. It is an
additive refresh packet so the existing staged submission draft can remain
untouched until its owner is ready to reconcile it.

## Public release

| Field | Verified value |
| --- | --- |
| Public URL | `https://proxy-zero-openai-2026.netlify.app/` |
| Git commit | `f41d043f958c749856ad19aaa97c28654746789c` |
| Netlify production deploy | `6a8d21283822c69a4e498fbe` |
| `release.json` SHA-256 | `acefd60a5bf7cbf8122df364e8673b7b9ea5f1e4f9192adebd4574002baa596a` |
| App bundle manifest SHA-256 | `fe16901716c61e35a18add542123f342c5741dc4fd10cfad2a62c7b8ea93d547` |
| Public manifest SHA-256 | `e292e5985acc5f800a50074ada36147d3c81ef473ebcd690dfca987203a14520` |
| Release provenance SHA-256 | `7376df4c1c1b8ff5297acdb7c91c495422259e8fdb5755b3423f3d735ff1c4cf` |
| Public manifest files | **37** |

The public verifier downloaded all 37 declared files and matched every byte
count and SHA-256 digest. A clean Chromium session then completed the public
title -> fighter-select -> combat flow at a 1280x720 viewport with zero page,
request, or HTTP errors.

## Build and gameplay gates

- TypeScript: passed.
- Unit and integration suite: **36 files, 289 tests passed**.
- Production Vite build: passed.
- Asset budget: **12,737,314 / 15,000,000 gzip bytes** at initial load and
  **14,607,846 / 40,000,000 raw bytes** in the distribution.
- Chromium end-to-end suite: **11 / 11 passed**, including exact controls,
  focus recovery, corrupted-save recovery, audio rejection, mobile notice,
  release-route hardening, and authored-screen capture.

## Fresh public screenshots

The following screenshots were captured from the production URL with ordinary
keyboard input. They are stored under `submission/screenshots-v2/` so the older
staged evidence is not silently overwritten.

| File | Dimensions | Bytes | SHA-256 |
| --- | ---: | ---: | --- |
| `01-title.png` | 1280x720 | 238,515 | `d15c56a0b5367b61b80e7237a572c7eee426e53286e8c8a62cc24e7bfee05a62` |
| `02-fighter-select.png` | 1280x720 | 204,571 | `d75d908ad65238b050dcd477e2b287f82ec0243be387501eed20b3d8de838f64` |
| `03-combat.png` | 1280x720 | 541,978 | `43ef8179931807d19bcce662530fd7f3f4ab13378a3b6c8a8c8c73f07ba5482e` |
| `04-combo.png` | 1280x720 | 541,285 | `dbb26f662a49f2ae758f20b7b92e08190d19e617a6ffb77a98aaff276da3b0b1` |
| `05-enemy-telegraph.png` | 1280x720 | 541,387 | `f08cd22cc64a5150c479b75530679fd3e53030385a33bbe64877ef696bfd20f8` |

## Reconciliation note

Before final form entry, replace references to commit `71ec355` and Netlify
deploy `6a8d04ab03d984d5de156b41` in the existing staged submission documents with
the verified values above. The existing 1920x1080 thumbnail remains visually
strong and was intentionally not overwritten by this refresh.
