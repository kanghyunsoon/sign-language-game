package backend.ssafy.suhwa.ranking.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import java.util.List;

public record RankingResponse(
        @Schema(description = "게임 종류별 상위 5명")
        List<RankingEntry> top,
        @Schema(description = "로그인 사용자의 순위. 해당 게임 기록이 없으면 null", nullable = true)
        RankingEntry me) {
}
