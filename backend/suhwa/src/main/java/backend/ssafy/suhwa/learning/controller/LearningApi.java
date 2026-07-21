package backend.ssafy.suhwa.learning.controller;

import backend.ssafy.suhwa.common.config.OpenApiConfig;
import backend.ssafy.suhwa.common.security.LoginUser;
import backend.ssafy.suhwa.learning.domain.SignCategory;
import backend.ssafy.suhwa.learning.dto.SignResponse;
import backend.ssafy.suhwa.learning.dto.TestResultRequest;
import backend.ssafy.suhwa.learning.dto.WrongAnswerRequest;
import backend.ssafy.suhwa.learning.dto.WrongAnswerResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import java.util.List;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;

@Tag(name = "Learning")
@SecurityRequirement(name = OpenApiConfig.BEARER_SCHEME_NAME)
public interface LearningApi {

    @Operation(summary = "카테고리별 학습 콘텐츠 목록 조회")
    @ApiResponse(responseCode = "200", description = "노출 가능한(is_active=true) 콘텐츠 목록 (FR-015)")
    @GetMapping("/signs")
    ResponseEntity<List<SignResponse>> listSigns(@RequestParam SignCategory category);

    @Operation(summary = "오답 신고")
    @ApiResponse(responseCode = "201", description = "오답 기록 저장 (FR-016)")
    @ApiResponse(responseCode = "404", description = "존재하지 않는 콘텐츠 ID (Edge Case)")
    @PostMapping("/wrong-answers")
    ResponseEntity<Void> reportWrongAnswer(@LoginUser Long userId, @RequestBody @Valid WrongAnswerRequest request);

    @Operation(summary = "카테고리별 최근 오답노트 조회")
    @ApiResponse(responseCode = "200", description = "최근 신고순 최대 5건 (FR-017)")
    @GetMapping("/wrong-answers")
    ResponseEntity<List<WrongAnswerResponse>> listWrongAnswers(
            @LoginUser Long userId, @RequestParam SignCategory category);

    @Operation(summary = "테스트 결과 보고", description = "정답 수 기반 펫 경험치 반영은 1차 범위 제외(Out of Scope)")
    @ApiResponse(responseCode = "201", description = "결과 저장 (FR-018)")
    @PostMapping("/test-results")
    ResponseEntity<Void> reportTestResult(@LoginUser Long userId, @RequestBody @Valid TestResultRequest request);
}
