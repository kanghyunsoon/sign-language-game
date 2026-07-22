package backend.ssafy.suhwa.ranking.controller;

import backend.ssafy.suhwa.common.config.OpenApiConfig;
import backend.ssafy.suhwa.common.security.LoginUser;
import backend.ssafy.suhwa.ranking.dto.RankingResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;

@Tag(name = "Ranking")
@SecurityRequirement(name = OpenApiConfig.BEARER_SCHEME_NAME)
public interface RankingApi {

    @Operation(summary = "Top 5 랭킹 및 본인 순위 조회", description =
            "승수 내림차순 상위 5명(동점 시 패 수 적은 순, FR-032)과 요청자 본인 순위(FR-031). "
                    + "탈퇴한 사용자는 제외(FR-033).")
    @ApiResponse(responseCode = "200", description = "조회 성공")
    @GetMapping("/rankings")
    ResponseEntity<RankingResponse> getRankings(@LoginUser Long userId);
}
