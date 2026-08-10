# Frontend workspace

한컴타자연습의 학습→연습→게임으로 이어지는 정보 구조를 제품 레퍼런스로 삼되, 상표·문구·이미지·코드를 복제하지 않는다. MVP에서 플랫폼 팀은 홈, 인증, 프로필, 학습을 맡고 게임 팀은 게임 선택 이후를 맡는다.

```text
frontend/src/
├─ app/                  # 최종 router/provider 조립, 공동 협의 영역
├─ shared/mediapipe/     # 전 프런트 공용 MediaPipe 추적 엔진
├─ features/
│  ├─ home/             # 기본·메인 페이지 (다른 프런트 담당)
│  ├─ auth/             # 회원가입·로그인 (다른 프런트 담당)
│  ├─ profile/          # 사용자 프로필 (다른 프런트 담당)
│  └─ learning/         # 지문자 학습·연습 (다른 프런트 담당)
├─ game/                 # 게임 선택 이후 전체와 게임 전용 recognition (게임 팀 담당)
├─ App.tsx               # 현재 게임 단독 실행 entry; 통합 시 host가 교체
└─ main.tsx
```

게임 파트의 안정적인 병합 단위는 `src/game`, `public/guides`, `public/mediapipe`, `scripts/setup-mediapipe-assets.mjs`다. `package.json`, lockfile, `App.tsx`, `main.tsx`, 전역 `styles.css`는 공동 파일이므로 다른 프런트 변경과 함께 병합해야 한다.

상세 게임 구조와 호스트 연결 방법은 `src/game/README.md`, 백엔드 연결은 `src/game/docs/backend-contracts.md`를 따른다.

## Git 병합 단위

게임 파트만 올릴 때 우선 포함할 독립 영역은 다음과 같다.

- `frontend/src/game/`
- `frontend/public/guides/`
- `frontend/public/mediapipe/`
- `frontend/scripts/setup-mediapipe-assets.mjs`
- `game-ai-dev-server/`
- `game-dev-backend/`
- `game-contracts/`

다음 파일은 다른 프런트 파트와 공유하는 병합 지점이므로 PR에서 별도로 확인한다.

- `frontend/package.json`, `frontend/package-lock.json`
- `frontend/src/App.tsx`, `frontend/src/main.tsx`, `frontend/src/styles.css`
- `frontend/vite.config.ts`, `frontend/tsconfig*.json`

브라우저 라우터는 `frontend/src/main.tsx`가 한 번만 생성하고, `frontend/src/App.tsx`는 `/game/*` 한 지점에서 `GameModule`을 마운트한다. 게임 내부 라우팅은 `frontend/src/game/app/GameModuleRoutes.tsx`가 상대 경로만 소유하므로 홈·학습·인증·프로필 파트와 게임 화면 파일이 직접 충돌하지 않는다. 개발·테스트 환경도 별도의 중첩 라우터를 만들지 않고 호스트 라우터를 주입한다. 다만 위 공유 파일은 충돌 가능성이 0이 아니므로 통합 브랜치에서 함께 병합한다.

## 공용 인식 계층

`src/shared/mediapipe`는 MediaPipe 초기화, hand/pose tracker, worker fallback과 공용 좌표 타입만 제공한다. React 화면, 사용자 등록, 지문자 AI 연결, 게임 판정은 포함하지 않는다.

`src/game/recognition`은 이 공용 엔진을 사용해 사용자·손 소유권, Python WebSocket, Temporal Decoder와 게임 입력을 조립한다. 따라서 게임 진행은 기존 경계를 유지하고 다른 프런트 기능은 필요한 MediaPipe 엔진만 재사용할 수 있다.
