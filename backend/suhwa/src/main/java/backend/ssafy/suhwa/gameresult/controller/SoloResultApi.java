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

@Tag(name = "SoloResults", description = "테트리스 솔로 결과")
@SecurityRequirement(name = OpenApiConfig.BEARER_SCHEME_NAME)
public interface SoloResultApi {

    @Operation(
            summary = "테트리스 솔로 결과 저장",
            description = "완료까지 걸린 시간을 초 단위 score로 전송합니다. "
                    + "60초 이하 15 XP, 90초 이하 10 XP, 120초 이하 5 XP를 지급하며 "
                    + "120초 초과는 XP를 지급하지 않습니다.")
    @ApiResponse(responseCode = "201", description = "결과 저장과 XP 반영 완료")
    @ApiResponse(responseCode = "400", description = "score 누락 또는 1 미만")
    @ApiResponse(responseCode = "401", description = "인증 필요")
    @PostMapping("/solo-results")
    ResponseEntity<SoloResultResponse> reportSoloResult(
            @LoginUser Long userId, @RequestBody @Valid SoloResultRequest request);
}
