# Platform feature ownership

이 폴더는 게임 밖 MVP 기능의 소유권 경계다. 각 담당자는 자신의 feature에서 페이지·API·상태를 관리하고 다른 feature 내부 구현을 직접 import하지 않는다. 공통 router 조립은 `src/app`, 게임은 독립 패키지 경계인 `src/game`을 사용한다.
