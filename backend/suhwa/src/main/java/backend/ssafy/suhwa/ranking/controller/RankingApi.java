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

    @Operation(summary = "게임 종류별 Top 5 랭킹 및 본인 순위 조회 (변경 — gameType 필수 파라미터 추가)", description =
            "지정한 게임 종류의 Top 5 + 본인 순위. 다른 게임 종류의 결과는 절대 섞이지 않는다(FR-025). "
                    + "지문자 1:1 대전/테트리스 대전은 승수(SUM) 내림차순(동률 시 패수 오름차순, FR-026), "
                    + "테트리스 솔로는 최고 점수(MAX) 내림차순(FR-029)으로 정렬한다. 탈퇴한 사용자는 제외. "
                    + "요청자가 해당 게임 종류를 한 번도 플레이하지 않았으면 me는 null이다(US9 AC4).")
    @ApiResponse(responseCode = "200", description = "조회 성공")
    @ApiResponse(responseCode = "400", description = "gameType 누락 또는 잘못된 값")
    @GetMapping("/rankings")
    ResponseEntity<RankingResponse> getRankings(
            @LoginUser Long userId, @RequestParam GameResultType gameType);
}
