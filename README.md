# PROXY ZERO

PROXY ZERO는 PC 브라우저에서 바로 실행하는 Stage 1 벨트스크롤 액션 게임입니다. 시작 화면에서 HAN, MINA, JIN 중 한 명을 고른 뒤, 키보드 조작으로 전투와 아이템 사용을 진행합니다.

현재 코드에는 타이틀 → 캐릭터 선택 → 전투 → 결과 화면 흐름과 세 개의 Stage 1 구역(N-9 Depot, Service Train, Flooded Tunnel)이 포함되어 있습니다. 공개 배포 전에는 아래 검증과 릴리스 체크리스트를 완료해야 합니다.

## PC 키보드 조작

전투를 시작한 뒤에는 게임 캔버스를 한 번 클릭해 키보드 포커스를 맞춥니다.

| 상황 | 조작 |
| --- | --- |
| 시작 화면 | `Enter`, `Space`, 또는 `J` |
| 캐릭터 선택 | `A` / `D`, `←` / `→`, 또는 `1` / `2` / `3` |
| 선택 확정 | `Enter` 또는 `Space` |
| 이동 | `W` / `A` / `S` / `D` |
| 왼손 / 오른손 공격 | `J` / `K` |
| 왼발 / 오른발 공격 | `L` / `;` |
| 점프 | `Space` |
| 아이템 선택 | `Q` (보유 아이템 순환) |
| 아이템 줍기 / 사용 | `E` (현재 선택 아이템) |
| Game Over Continue | `Enter` |

## 로컬 실행

Node.js 22 이상과 npm이 설치된 환경에서 실행합니다.

```bash
npm ci
npm run dev
```

터미널에 표시되는 로컬 주소를 브라우저에서 엽니다.

## 검증

```bash
npm run verify
```

공개 배포의 `release.json` raw bytes SHA-256·파일 크기·SHA-256·커밋 무결성은 공개 HTTPS URL, 40자리 배포 SHA, 그리고 사전에 기록한 `release.json` SHA-256을 지정해 자동 검증합니다(리디렉션은 실패 처리되며 URL의 trailing slash는 정규화됩니다).

PowerShell:

```powershell
$env:PROXY_ZERO_PUBLIC_URL = "https://공개-호스트/경로"
$env:PROXY_ZERO_EXPECTED_COMMIT = "40자리-배포-커밋-SHA"
$env:PROXY_ZERO_EXPECTED_RELEASE_SHA256 = "64자리-release.json-raw-bytes-sha256"
npm run qa:public
```

`qa:public`은 배포 파일과 release manifest의 무결성만 확인합니다. Chrome 시크릿 창, Edge, 두 번째 네트워크에서 최초 접속·플레이·콘솔/Network 상태를 확인하는 수동 검증은 이를 대체하지 않으며 [릴리스 체크리스트](docs/qa/release-checklist.md)에 별도로 기록합니다.

`provider`는 빌드·스탬프 경로(`github-pages`, `netlify`, `local`)만 검증하며 공개 호스트와 자동 결속하지 않습니다. 수동 Netlify fallback은 로컬에서 metadata를 기록할 수 있으므로 `provider: local`도 허용하고, 실제 호스트는 공개 URL과 배포 증거로 확인합니다.

배포 전 공개 브라우저 검증 항목은 [릴리스 체크리스트](docs/qa/release-checklist.md)를 사용합니다.

## GitHub Pages 배포

`.github/workflows/deploy-pages.yml`은 `main` 푸시와 수동 실행을 빌드 대상으로 삼습니다. 실제 Pages 배포는 `main`에서 실행된 경우에만 수행됩니다. 저장소 Settings → Pages의 배포 원본은 **GitHub Actions**로 설정해야 합니다.

공개 URL: **첫 GitHub Pages 배포가 성공한 뒤 Actions의 `github-pages` 환경 URL을 이곳에 기록합니다. 현재는 미정입니다.**

## Netlify fallback 배포

GitHub Pages가 사용 불가한 경우에만 Netlify를 fallback 호스트로 사용합니다. 루트 `netlify.toml`은 Vite 정적 출력인 `dist`를 게시하고, 타입 검사·단위/통합 테스트·프로덕션 빌드·용량 검사를 게이트로 실행합니다. GitHub Actions나 Playwright 브라우저 다운로드에 의존하지 않습니다.

수동 Netlify 배포는 동결 커밋에서 `npm run verify`를 통과한 뒤 `npm run release:build`, `npm run release:metadata`, `npm run qa:size`를 이 순서대로 완료한 **기존 `dist` 폴더만** 게시합니다. `release:build`는 Vite 빌드 직후 현재 clean Git SHA와 `release.json`·`release-build.json`을 제외한 앱 파일의 SHA-256 목록·manifest SHA-256을 `dist/release-build.json`에 기록합니다. metadata 단계는 현재 앱 bytes를 독립 재계산해 이 값이 현재 HEAD와 정확히 일치하지 않으면 실패합니다. Netlify CLI는 기본적으로 build를 실행하므로, 검증된 bytes를 그대로 게시하려면 반드시 `--no-build`를 사용합니다. 한 릴리스에는 GitHub Pages 또는 Netlify 중 실제로 선택한 하나의 공개 URL만 체크리스트에 기록합니다.

```powershell
$env:PROXY_ZERO_EXPECTED_RELEASE_SHA256 = (Get-FileHash -LiteralPath .\dist\release.json -Algorithm SHA256).Hash.ToLowerInvariant()
netlify deploy --dir .\dist --prod --no-build --site <SITE_ID>
```

위 SHA-256은 배포 **전에** 로컬 `dist/release.json`에서 기록하고, 공개 URL에서 다시 가져온 값으로 덮어쓰지 않습니다.

두 호스트 모두 빌드 뒤 `npm run release:metadata`로 `dist/release.json`을 생성합니다. 이 파일은 동결 커밋 SHA, `dirty: false`, build provenance, 앱 bundle manifest와 구분된 **최종 공개 manifest**를 기록합니다. 최종 공개 manifest는 `release.json` 자신만 제외하고 `release-build.json`을 포함합니다. release 단계는 dist root와 하위 경로가 symlink·Windows junction/reparse point가 아니며 실제 repository root 밖으로 벗어나지 않는지 먼저 확인하고, 하나라도 맞지 않으면 빌드·삭제·metadata 기록을 중단합니다. `provider: local`은 수동 prebuilt `dist`를 **로컬에서 빌드·기록했다**는 뜻이며 호스트 판정은 아니므로, 이 경우 Netlify 호스팅 여부는 실제 공개 URL과 Netlify 배포 증거로 확인합니다.
