# PROXY ZERO — Codex 협업 기록 초안

## 기록 범위

- 기준 제출 브랜치: `codex/firstvibe/proxy-zero-stage1-submission`
- 기준 공개 후보: `9c66977` — `fix: run release build cross-platform`
- 현재 상태: 공개 후보 `9c66977`에서 분기한 **별도 제출 패키지 초안**입니다.
- 이 브랜치는 제출 문서와 썸네일을 기록하되 공개 게임 후보 SHA를 변경하지 않습니다.
- `submission/thumbnail-1920x1080.png`는 검증된 원본을 유지합니다.
- 공개 배포와 최종 검증을 완료했다는 의미가 아닙니다.

## 기획 문서에 기록된 제품 결정

아래는 사람이 확정한 것으로 단정하지 않고, 저장소의 설계 문서와 구현 계획에 기록된 결정으로 구분합니다.

- 논리 캔버스는 640×360이며 PC 브라우저용 16:9 게임을 목표로 합니다.
- 타이틀 → 캐릭터 선택 → 즉시 전투 흐름을 사용하고, 긴 컷신·대화·강제 브리핑은 Stage 1에서 제외합니다.
- HAN·MINA·JIN 세 캐릭터, J/K/L/; 네 공격 입력, `LIFE ×2`, 한 번의 Continue, 세 구역, 한 명의 엘리트, 한 명의 최종보스, 결과·랭크를 Stage 1 핵심 범위로 정의했습니다.
- 계획 문서는 1단계 제출 범위와 이후 상업 확장 범위를 분리하며, 이 기록에는 Stage 2 기능을 포함하지 않습니다.
- Task 19 제출 목표는 200자 이내 한국어 소개, 16:9 썸네일, 최대 3분(180초) 이내 실제 플레이 영상이며, 현재 영상 초안의 목표는 02:57(177초)입니다.

근거 문서: `docs/superpowers/specs/2026-08-24-proxy-zero-stage-one-design.md`, `docs/superpowers/plans/2026-08-24-proxy-zero-stage-one.md`.

## Git에서 확인되는 구현 이력

커밋 작성자 표시는 Git의 기록값일 뿐, 사람과 AI의 기여를 추정하는 근거로 사용하지 않습니다.

| 커밋 | 기록된 내용 |
|---|---|
| `9069dde` | 웹 게임 셸 스캐폴드 |
| `9fe0e5e` | 결정론적 고정 스텝 도메인 |
| `a8f850b` | 키보드 입력 버퍼 |
| `d05f203` | 캐릭터와 공격 체인 |
| `622060f` | 결정론적 전투 커널 |
| `53a6bab` | 첫 플레이 가능한 전투 그레이박스 |
| `e31e01d` | 목숨·Continue·체크포인트 |
| `7ce55d7` | 결정론적 적과 웨이브 |
| `4ab35a1` | N-9 Depot 구역 |
| `004b853` | 전투 아이템과 인벤토리 HUD |
| `d2e569e` | Service Train과 엘리트 전투 |
| `7d8e5b2` | Flooded Tunnel과 최종보스 |
| `0f292a7` | 원본 캐릭터 스프라이트 atlas |
| `afcf834` | 전투 프레젠테이션과 오디오 폴리시 |
| `8b31e02` | 결과 화면과 기본 릴리스 게이트 |
| `b2b00e2` | 동결 빌드 기반 밸런스 증거·첫 전투 안내 |
| `b24727e` | GitHub Pages·Netlify 공개 릴리스 파이프라인 |
| `9c66977` | Windows를 포함한 교차 플랫폼 release build 수정 |

설계 문서 잠금과 수용 기준 강화도 Git에 기록되어 있습니다: `bd4ab20` (`docs: lock PROXY ZERO stage one design`), `512ea0d` (`docs: tighten stage one acceptance gates`), `87fbb92` (`docs: add proxy zero stage one implementation plan`).

## AI·사람·다중 에이전트 역할 구분

- **제품 결정:** 설계 문서에 적힌 범위와 수용 기준을 사실로 기록합니다. 이 문서에서는 결정자를 추정하지 않습니다.
- **Codex 구현:** Git 커밋에서 확인되는 코드·테스트·자산 변경을 커밋 제목으로만 요약합니다.
- **병렬 검토:** Primary Codex는 통합과 실행 검증을 맡고, 서로 다른 보조 에이전트는 균형 증거, 배포 계약, 공개 보안, 제출 표현을 겹치지 않게 읽기 전용으로 검토했습니다. 아래에는 실제 발견과 반영 결과만 기록합니다.
- **사람 검토:** 계획 문서의 수동 플레이·브라우저 확인 요구는 확인 절차이지 완료 증거가 아닙니다. 현재 기록에는 그 결과를 확정할 별도 보고가 없습니다.

## 독립 검토가 바꾼 결과

| 검토 범위 | 발견 | Primary Codex의 반영·검증 |
|---|---|---|
| 균형·FPS 증거 | 별도 플레이 영상 촬영 런이 공식 FPS 기록에 섞일 수 있었습니다. | 영상 런을 `officialEvidenceEligible: false`로 분리하고 verifier가 캡처 보고서를 거부하도록 수정했습니다. 최신 캡처 보고서를 의도적으로 섞은 합성 회귀 검사에서도 공식 HAN 기록만 선택되는 것을 확인했습니다. |
| 동결 빌드 동일성 | 실행 중인 오래된 로컬 preview가 현재 Git `HEAD`의 측정값으로 잘못 기록될 수 있었습니다. | 빌드 때 commit·dirty 상태를 번들에 봉인하고 runner와 verifier가 현재 clean `HEAD`와 모두 일치할 때만 공식 기록으로 받도록 수정했습니다. 기본 공개 접근에서는 QA hook이 노출되지 않는 E2E도 추가했습니다. |
| Pages·Netlify 릴리스 | Pages E2E가 `dist`를 다시 빌드해 먼저 생성한 `release.json`을 지울 수 있었고, 수동 번들의 SHA 주장도 실제 바이트와 결속되지 않았습니다. | E2E 뒤 최종 release build → metadata → size → upload 순서로 바꾸고, 파일별 SHA-256·app bundle digest·public manifest digest를 기록해 변경된 `dist`를 거부하도록 설계했습니다. |
| 공개 배포 보안·표현 | `dist` 링크/경로 이탈 위험과 제출 소개의 “데모” 표현이 각각 배포 안전성과 완성작 인상을 약하게 만들었습니다. | release root·하위 링크·realpath containment를 fail-closed로 검사하고, 소개문은 기능 범위를 유지한 113자 “2D 벨트스크롤 액션 게임”으로 수정했습니다. |

## 테스트·브라우저 검증·자산 QA

| 영역 | 저장소에서 확인되는 사실 | 현재 상태 |
|---|---|---|
| 단위·통합 테스트 | 공개 후보 `9c66977`에서 `npm run test:run`을 실행했습니다. | **35개 테스트 파일·275개 테스트 통과** |
| 브라우저 E2E | 공개 후보에서 실제 Chrome으로 시작·조작·포커스·저장 복구·오디오 거부·모바일 안내·QA hook 비노출을 검사했습니다. | **Playwright Chrome E2E 10개 통과** |
| 타입·빌드·자산 게이트 | 공개 후보에서 typecheck, production build, release build, metadata SHA 봉인, asset budget을 실행했습니다. | **모두 통과**. 초기 gzip9 5,234,413 bytes, release metadata 포함 dist raw 7,070,530 bytes. |
| 캐릭터 자산 | `docs/qa/task13-asset-provenance.md`는 원본 프롬프트로 만든 actor source, 결정론적 atlas 생성, 원본성 제한, 출력 해시·바이트를 기록합니다. actor payload 합계는 5,370,445 bytes로 문서의 Task 13 6MB 목표 아래입니다. | Task 13 QA 문서에 기록된 사실. 전체 빌드 15MB/40MB 게이트는 별도 검증 필요. |
| 제출 썸네일 | 기존 `submission/thumbnail-1920x1080.png`는 shipped player/enemy/boss atlas, 기존 gameplay concept, 현재 1280×720 전투 캡처를 참조해 built-in image generation으로 제작했고, 두 번째 정밀 편집에서 정확한 `PROXY ZERO` 제목을 추가한 **검증된 최종 PNG 자산**입니다. 크기는 1920×1080, 4,845,241 bytes이며 외부 로고와 가짜 HUD를 넣지 않았습니다. | 10MB 권장 상한 이내. 이 Task 19에서는 파일을 수정하지 않았습니다. |
| 배포 | 계획은 GitHub Pages를 목표로 하지만 현재 기록에는 확정 공개 URL이 없습니다. | **TODO: URL·커밋·워크플로·Chrome/Edge 결과 기록** |
| 성능·완주 시간 | `9c66977`의 balance observer smoke에서 build commit 일치, `dirty=false`, active time 0부터 관찰 시작을 확인했습니다. | **Smoke 통과**. HAN·MINA·JIN 클리어와 Continue 실패 런의 실제 시간·FPS는 **TODO**. |

## 개인정보·과장 방지

- 계정, 토큰, 이메일, 로컬 사용자 경로, 비공개 URL은 기록하지 않습니다.
- “세계 최초”, “수상 확정”, “완벽한 최적화”, “상용급” 같은 검증 불가능한 표현은 사용하지 않습니다.
- 공개 URL, FPS, 로딩 시간, 최종 영상 길이, 콘솔 오류 없음, 누락 자산 없음은 실제 검증 전까지 모두 미확정으로 둡니다.

## 최종 제출 화면 재확인 TODO

- [ ] 전체 제출 화면(썸네일·영상·텍스트)에서 외부 로고·가짜 HUD·미검증 주장이 없는지 최종 재확인
- [ ] 02:57(177초) 목표와 03:00(180초) 상한, 인코딩·전환 안전 여유 3초가 영상 파일과 일치하는지 확인

## 런타임·배포 검증 TODO

- [ ] 정확한 제출 커밋에서 단위·통합 테스트 실행 결과 기록
- [ ] 타입 검사·프로덕션 빌드·자산 용량 게이트 결과 기록
- [ ] Chrome과 Edge에서 공개 URL 실행 결과 기록
- [ ] 공개 URL, Pages workflow run, 배포 커밋 기록
- [ ] 첫 화면·캐릭터 선택·전투·아이템·엘리트·보스·결과를 실제 브라우저에서 확인
- [ ] FPS 샘플과 실제 완주 시간 기록
- [ ] 최종 영상의 실제 길이와 첫 60초 필수 장면 확인
