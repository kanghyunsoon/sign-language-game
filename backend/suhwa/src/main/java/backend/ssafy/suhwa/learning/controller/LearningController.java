package backend.ssafy.suhwa.learning.controller;

import backend.ssafy.suhwa.learning.domain.SignCategory;
import backend.ssafy.suhwa.learning.dto.SignResponse;
import backend.ssafy.suhwa.learning.dto.TestCompletionRequest;
import backend.ssafy.suhwa.learning.dto.TestSessionResponse;
import backend.ssafy.suhwa.learning.dto.TetrisWeightResponse;
import backend.ssafy.suhwa.learning.dto.WrongAnswerRequest;
import backend.ssafy.suhwa.learning.dto.WrongAnswerResponse;
import backend.ssafy.suhwa.learning.service.SignService;
import backend.ssafy.suhwa.learning.service.TestSessionService;
import backend.ssafy.suhwa.learning.service.WrongAnswerService;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequiredArgsConstructor
public class LearningController implements LearningApi {

    private final SignService signService;
    private final WrongAnswerService wrongAnswerService;
    private final TestSessionService testSessionService;

    @Override
    public ResponseEntity<List<SignResponse>> listSigns(SignCategory category) {
        List<SignResponse> responses =
                signService.getActiveSignsByCategory(category).stream().map(SignResponse::from).toList();
        return ResponseEntity.ok(responses);
    }

    @Override
    public ResponseEntity<Void> reportWrongAnswer(Long userId, WrongAnswerRequest request) {
        wrongAnswerService.reportWrongAnswer(userId, request.testSessionId(), request.signId());
        return ResponseEntity.status(HttpStatus.CREATED).build();
    }

    @Override
    public ResponseEntity<List<WrongAnswerResponse>> listWrongAnswers(
            Long userId, SignCategory category) {
        return ResponseEntity.ok(wrongAnswerService.getRecentWrongAnswers(userId, category));
    }

    @Override
    public ResponseEntity<List<TetrisWeightResponse>> getTetrisWeights(Long userId) {
        return ResponseEntity.ok(wrongAnswerService.getTetrisWeightsFromRecentTests(userId));
    }

    @Override
    public ResponseEntity<TestSessionResponse> startTestSession(Long userId) {
        TestSessionResponse response = TestSessionResponse.from(testSessionService.startTest(userId));
        return ResponseEntity.status(HttpStatus.CREATED).body(response);
    }

    @Override
    public ResponseEntity<TestSessionResponse> completeTestSession(
            Long userId, Long testSessionId, TestCompletionRequest request) {
        return ResponseEntity.ok(testSessionService.completeTest(
                userId, testSessionId, request.correctCount(), request.totalCount()));
    }
}
