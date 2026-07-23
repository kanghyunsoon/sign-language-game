package backend.ssafy.suhwa.game.domain;

/** 대전 모드 게임 종류(정원 2, 실시간 연결 필요). 솔로는 game_rooms를 쓰지 않으므로 포함하지 않는다(FR-027). */
public enum GameType {
    SIGN_DUEL, TETRIS_DUEL
}
