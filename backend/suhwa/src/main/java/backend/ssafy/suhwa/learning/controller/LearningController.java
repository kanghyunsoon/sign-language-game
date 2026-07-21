package backend.ssafy.suhwa.learning.controller;

import backend.ssafy.suhwa.learning.domain.SignCategory;
import backend.ssafy.suhwa.learning.dto.SignResponse;
import backend.ssafy.suhwa.learning.dto.TestResultRequest;
import backend.ssafy.suhwa.learning.dto.WrongAnswerRequest;
import backend.ssafy.suhwa.learning.dto.WrongAnswerResponse;
import backend.ssafy.suhwa.learning.service.SignService;
import backend.ssafy.suhwa.learning.service.TestResultService;
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
    private final TestResultService testResultService;

    @Override
    public ResponseEntity<List<SignResponse>> listSigns(SignCategory category) {
        List<SignResponse> responses = signService.getActiveSignsByCategory(category).stream()
                .map(SignResponse::from)
                .toList();
        return ResponseEntity.ok(responses);
    }

    @Override
    public ResponseEntity<Void> reportWrongAnswer(Long userId, WrongAnswerRequest request) {
        wrongAnswerService.reportWrongAnswer(userId, request.signId());
        return ResponseEntity.status(HttpStatus.CREATED).build();
    }

    @Override
    public ResponseEntity<List<WrongAnswerResponse>> listWrongAnswers(Long userId, SignCategory category) {
        return ResponseEntity.ok(wrongAnswerService.getRecentWrongAnswers(userId, category));
    }

    @Override
    public ResponseEntity<Void> reportTestResult(Long userId, TestResultRequest request) {
        testResultService.reportTestResult(
                userId, request.category(), request.totalCount(), request.correctCount());
        return ResponseEntity.status(HttpStatus.CREATED).build();
    }
}
