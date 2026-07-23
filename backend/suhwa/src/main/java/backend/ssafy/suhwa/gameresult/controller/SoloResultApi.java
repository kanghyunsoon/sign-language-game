package backend.ssafy.suhwa.gameresult.controller;

import backend.ssafy.suhwa.common.config.OpenApiConfig;
import backend.ssafy.suhwa.common.security.LoginUser;
import backend.ssafy.suhwa.gameresult.dto.SoloResultRequest;
import backend.ssafy.suhwa.gameresult.dto.SoloResultResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;

@Tag(name = "SoloResults")
@SecurityRequirement(name = OpenApiConfig.BEARER_SCHEME_NAME)
public interface SoloResultApi {

    @Operation(summary = "테트리스 솔로 결과(점수) 보고", description =
            "대전 모드의 게임방 개념과 완전히 별도인 엔드포인트다(FR-027) — 방 생성, 실시간 연결, "
                    + "준비/시작 절차를 전혀 요구하지 않는다. 점수만 받아 기록하며(FR-028), 위·변조 여부는 "
                    + "검증하지 않는다(spec.md Assumptions, 의도적 결정). 동일 사용자가 여러 번 호출해도 "
                    + "각각 개별 기록으로 남는다(중복 방지 없음).")
    @ApiResponse(responseCode = "201", description = "점수 기록 완료")
    @ApiResponse(responseCode = "400", description = "score 누락 또는 음수")
    @PostMapping("/solo-results")
    ResponseEntity<SoloResultResponse> reportSoloResult(
            @LoginUser Long userId, @RequestBody @Valid SoloResultRequest request);
}
