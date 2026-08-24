# PROXY ZERO Stage 1 릴리스 체크리스트

이 문서는 공개 배포 증거를 남기기 위한 체크리스트입니다. 각 항목은 실제 배포 후보 커밋과 공개 URL에서 확인한 뒤 상태와 증거를 기록합니다.

## 릴리스 식별

| 항목 | 상태 | 증거 |
| --- | --- | --- |
| 배포 후보 Git SHA | ⬜ | `SHA:` |
| 배포 대상 브랜치가 `main`인지 | ⬜ | `branch / SHA:` |
| 전체 로컬 검증 게이트 성공 | ⬜ | `명령 / 실행 시각 / 결과:` |
| 공개 release 무결성 verifier 성공 | ⬜ | `PROXY_ZERO_PUBLIC_URL / PROXY_ZERO_EXPECTED_COMMIT / PROXY_ZERO_EXPECTED_RELEASE_SHA256 / npm run qa:public / 결과:` |
| GitHub Pages 선택 시 Actions workflow run 성공 | ⬜/해당 없음 | `workflow run URL / 사유:` |
| GitHub Pages 선택 시 환경 URL과 배포 SHA 일치 | ⬜/해당 없음 | `public URL / SHA / 사유:` |

## 호스팅 경로

GitHub Pages가 기본 공개 호스트입니다. Pages를 사용할 수 없는 경우에만 Netlify fallback을 선택합니다. Netlify를 선택한 수동 배포는 동결 커밋에서 전체 로컬 `npm run verify`를 통과한 뒤 `npm run release:build`, `npm run release:metadata`, `npm run qa:size`를 이 순서대로 통과한 기존 `dist`만 게시합니다. `release-build.json`은 앱 bundle(두 release JSON 제외)의 파일별 SHA-256과 manifest SHA-256을 고정하고, `release:metadata`는 현재 bytes를 독립 재계산해 정확히 일치하지 않으면 실패합니다. 최종 `release.json`의 public manifest는 `release.json` 자신만 제외하고 `release-build.json`을 포함하므로 두 digest를 혼동하지 않습니다. release 단계는 symlink·Windows junction/reparse point·repository 밖 realpath를 fail closed로 거부합니다. Netlify의 Git 연결 빌드는 타입 검사·단위/통합 테스트·최종 release build·metadata·용량 검사를 수행하며 Playwright 브라우저 다운로드에는 의존하지 않습니다.

| 항목 | 상태 | 증거 |
| --- | --- | --- |
| 선택한 호스트가 GitHub Pages 또는 Netlify fallback인지 | ⬜ | `host / 사유:` |
| Netlify fallback 사용 시 로컬 `verify`와 최종 `release:build`·`release:metadata`·`qa:size` 성공 | ⬜ | `명령 / SHA / 실행 시각:` |
| 수동 Netlify 배포 전 로컬 `release.json` SHA-256 고정 및 `--no-build` 사용 | ⬜ | `local release SHA-256 / deploy 명령:` |
| Netlify fallback URL과 배포 후보 SHA 일치 | ⬜ | `public URL / SHA:` |
| 공개 `release.json`의 SHA·`dirty=false`·app bundle/public manifest SHA 일치 | ⬜ | `URL / commit / app SHA / public SHA:` |
| 수동 Netlify fallback의 `provider=local`과 실제 Netlify URL 일치 | ⬜/해당 없음 | `release.json provider / Netlify URL / 사유:` |

한 릴리스에는 실제로 선택한 호스트의 공개 URL 하나만 최종 증거로 기록합니다. 선택하지 않은 호스트 전용 항목은 `해당 없음`과 사유를 기록하며 차단 항목으로 계산하지 않습니다.

`npm run qa:public`은 공개 `release.json` raw bytes SHA-256과 manifest 파일의 HTTP 응답·크기·SHA-256·커밋 무결성을 자동 확인합니다. Chrome 시크릿 창, Microsoft Edge, 두 번째 네트워크 검증은 게임 플레이·브라우저 캐시/콘솔·네트워크 경로를 확인하는 수동 증거이며 verifier의 성공만으로 대체하지 않습니다.

## 공개 URL 브라우저 검증

| 항목 | 상태 | 증거 |
| --- | --- | --- |
| Chrome 시크릿 창에서 최초 접속·플레이 가능 | ⬜ | `브라우저 버전 / 결과 / 시각:` |
| Microsoft Edge에서 최초 접속·플레이 가능 | ⬜ | `브라우저 버전 / 결과 / 시각:` |
| 두 번째 네트워크에서 접속 가능 | ⬜ | `네트워크 유형 / 결과 / 시각:` |
| 로그인, localhost 또는 로컬 파일 의존 없음 | ⬜ | `확인 결과:` |
| 타이틀 → 캐릭터 선택 → 전투 → 결과 흐름 확인 | ⬜ | `선택 캐릭터 / 결과:` |
| 필수 에셋 요청에 404 없음 | ⬜ | `Network 기록 또는 스크린샷:` |
| 콘솔 차단 오류 없음 | ⬜ | `Console 기록 또는 스크린샷:` |

## 성능·용량 기록

| 항목 | 상태 | 증거 |
| --- | --- | --- |
| 최초 의미 있는 화면까지의 로드 시간 | ⬜ | `기기 / 네트워크 / 측정값:` |
| FPS 표본 | ⬜ | `구간 / 평균 / 최저 / 측정 방법:` |
| 배포 `dist` 자산 크기 | ⬜ | `총합 / 큰 파일 목록:` |
| 알려진 비차단 제한 | ⬜ | `제한 / 사용자 영향 / 후속 조치:` |
| 알려진 차단 문제 없음 | ⬜ | `확인자 / 시각:` |

## 최종 판정

| 판정 | 상태 | 증거 |
| --- | --- | --- |
| 위 차단 항목 모두 해소 | ⬜ | `검토자 / 시각:` |
| 공개 URL 재검증 완료 | ⬜ | `URL / 시각:` |
| 릴리스 승인 | ⬜ | `승인자 / 시각:` |

공개 URL, workflow run URL, SHA는 추측으로 채우지 않습니다. 실제 배포가 완료된 뒤의 값만 기록합니다.
