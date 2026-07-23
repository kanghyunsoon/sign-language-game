package backend.ssafy.suhwa.gameresult.dto;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;

/** 승자·상대방 정보는 요구하지 않는다(FR-028) — 솔로는 상대가 없다. */
public record SoloResultRequest(@NotNull @Min(0) Integer score) {
}
