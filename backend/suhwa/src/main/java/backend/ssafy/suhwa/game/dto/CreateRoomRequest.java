package backend.ssafy.suhwa.game.dto;

import backend.ssafy.suhwa.game.domain.GameType;
import backend.ssafy.suhwa.game.domain.SymbolRange;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

/** 방 제목/기호 범위/게임 종류를 필수로 받는다. 방장 닉네임은 로그인한 사용자의 userId로 조회해 서버가 채운다. */
public record CreateRoomRequest(
        @NotBlank String roomTitle, @NotNull SymbolRange symbolRange, @NotNull GameType gameType) {
}
