package backend.ssafy.suhwa.learning.service;

import backend.ssafy.suhwa.learning.domain.SignCategory;
import backend.ssafy.suhwa.learning.domain.TestResult;
import backend.ssafy.suhwa.learning.repository.TestResultRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class TestResultService {

    private final TestResultRepository testResultRepository;

    @Transactional
    public void reportTestResult(Long userId, SignCategory category, int totalCount, int correctCount) {
        testResultRepository.save(TestResult.builder()
                .userId(userId)
                .category(category)
                .totalCount(totalCount)
                .correctCount(correctCount)
                .build());
    }
}
