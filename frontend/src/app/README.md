# App composition boundary

최종 플랫폼 router와 전역 provider를 두는 공동 영역이다. 홈·학습·인증·프로필 담당자가 route를 조립하고 게임은 `/game/*` 한 지점에 `GameModule`로 마운트한다. 게임 내부 페이지를 이 폴더로 옮기지 않는다.
