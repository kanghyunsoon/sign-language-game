package backend.ssafy.suhwa.learning.controller;

import backend.ssafy.suhwa.common.config.OpenApiConfig;
import backend.ssafy.suhwa.common.security.LoginUser;
import backend.ssafy.suhwa.learning.domain.SignCategory;
import backend.ssafy.suhwa.learning.dto.SignResponse;
import backend.ssafy.suhwa.learning.dto.ActivityCompletionResponse;
import backend.ssafy.suhwa.learning.dto.PracticeSessionResponse;
import backend.ssafy.suhwa.learning.dto.TestCompletionRequest;
import backend.ssafy.suhwa.learning.dto.TestSessionResponse;
import backend.ssafy.suhwa.learning.dto.TetrisWeightResponse;
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
import org.springframework.web.bind.annotation.PathVariable;
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

    @Operation(summary = "테트리스 출제 가중치 조회")
    @ApiResponse(
            responseCode = "200",
            description = "활성 자·모음 전체의 출제 가중치. 최근 완료 테스트 5회에 오답이 없으면 1.0")
    @GetMapping("/wrong-answers/tetris-weights")
    ResponseEntity<List<TetrisWeightResponse>> getTetrisWeights(@LoginUser Long userId);

    @Operation(summary = "연습 세션 시작")
    @PostMapping("/practice-sessions")
    ResponseEntity<PracticeSessionResponse> startPracticeSession(@LoginUser Long userId);

    @Operation(summary = "연습 세션 완료")
    @PostMapping("/practice-sessions/{practiceSessionId}/complete")
    ResponseEntity<ActivityCompletionResponse> completePracticeSession(
            @LoginUser Long userId, @PathVariable Long practiceSessionId);

    @Operation(summary = "테스트 세션 시작")
    @ApiResponse(responseCode = "201", description = "테스트 세션 생성 완료")
    @PostMapping("/test-sessions")
    ResponseEntity<TestSessionResponse> startTestSession(@LoginUser Long userId);

    @Operation(summary = "테스트 세션 완료")
    @ApiResponse(responseCode = "200", description = "테스트 세션 완료 처리")
    @ApiResponse(responseCode = "404", description = "존재하지 않거나 본인 소유가 아닌 테스트 세션")
    @ApiResponse(responseCode = "409", description = "이미 완료된 테스트 세션")
    @PostMapping("/test-sessions/{testSessionId}/complete")
    ResponseEntity<TestSessionResponse> completeTestSession(
            @LoginUser Long userId,
            @PathVariable Long testSessionId,
            @RequestBody @Valid TestCompletionRequest request);
}
