package backend.ssafy.suhwa.ranking.controller;

import backend.ssafy.suhwa.common.config.OpenApiConfig;
import backend.ssafy.suhwa.common.security.LoginUser;
import backend.ssafy.suhwa.gameresult.domain.GameResultType;
import backend.ssafy.suhwa.ranking.dto.RankingResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;

@Tag(name = "Ranking")
@SecurityRequirement(name = OpenApiConfig.BEARER_SCHEME_NAME)
public interface RankingApi {

    @Operation(
            summary = "게임 종류별 Top 5와 내 순위 조회",
            description = "TETRIS_SOLO는 사용자별 최소 score(진행 시간, 초)를 오름차순으로 정렬하고 "
                    + "동일 score에는 1, 1, 3 방식의 공동 순위를 부여합니다. "
                    + "대전은 승수 내림차순, 동률이면 패배 수 오름차순입니다.")
    @ApiResponse(responseCode = "200", description = "Top 5와 로그인 사용자의 순위")
    @ApiResponse(responseCode = "400", description = "gameType 누락 또는 잘못된 값")
    @ApiResponse(responseCode = "401", description = "인증 필요")
    @GetMapping("/rankings")
    ResponseEntity<RankingResponse> getRankings(
            @LoginUser Long userId, @RequestParam GameResultType gameType);
}
