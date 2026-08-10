package backend.ssafy.suhwa.gameresult.domain;

/** game_results 전용 게임 종류 3종. game_rooms 전용 GameType과는 값 집합이 달라 별도 enum이다(research.md #3). */
public enum GameResultType {
    SIGN_DUEL, TETRIS_DUEL, TETRIS_SOLO
}
