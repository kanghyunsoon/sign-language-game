package backend.ssafy.suhwa.ranking.dto;

import java.util.List;

public record RankingResponse(List<RankingEntry> top, RankingEntry me) {
}
