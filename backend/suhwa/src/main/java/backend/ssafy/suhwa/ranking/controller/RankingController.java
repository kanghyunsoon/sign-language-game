package backend.ssafy.suhwa.ranking.controller;

import backend.ssafy.suhwa.gameresult.domain.GameResultType;
import backend.ssafy.suhwa.ranking.dto.RankingResponse;
import backend.ssafy.suhwa.ranking.service.RankingService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequiredArgsConstructor
public class RankingController implements RankingApi {

    private final RankingService rankingService;

    @Override
    public ResponseEntity<RankingResponse> getRankings(Long userId, GameResultType gameType) {
        return ResponseEntity.ok(rankingService.getRankings(userId, gameType));
    }
}
