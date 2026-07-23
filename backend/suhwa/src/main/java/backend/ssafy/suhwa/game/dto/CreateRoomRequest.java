package backend.ssafy.suhwa.game.dto;

import backend.ssafy.suhwa.game.domain.GameType;
import jakarta.validation.constraints.NotNull;

/** 001에는 요청 바디가 없었음 — 대전 모드 게임 종류를 필수로 받는다(FR-017). */
public record CreateRoomRequest(@NotNull GameType gameType) {
}
