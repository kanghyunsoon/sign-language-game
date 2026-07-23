package backend.ssafy.suhwa.game.dto;

/** 001의 hostScore/guestScore 방식을 대체(FR-021/033). 생략하거나 null이면 무승부. */
public record GameResultRequest(Long winnerUserId) {
}
