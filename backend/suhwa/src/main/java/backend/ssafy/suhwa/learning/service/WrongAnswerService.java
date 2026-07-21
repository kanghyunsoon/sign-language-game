package backend.ssafy.suhwa.learning.service;

import backend.ssafy.suhwa.common.exception.BusinessException;
import backend.ssafy.suhwa.common.exception.ErrorCode;
import backend.ssafy.suhwa.learning.domain.Sign;
import backend.ssafy.suhwa.learning.domain.SignCategory;
import backend.ssafy.suhwa.learning.domain.WrongAnswerLog;
import backend.ssafy.suhwa.learning.dto.SignResponse;
import backend.ssafy.suhwa.learning.dto.WrongAnswerResponse;
import backend.ssafy.suhwa.learning.repository.SignRepository;
import backend.ssafy.suhwa.learning.repository.WrongAnswerLogRepository;
import java.util.List;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class WrongAnswerService {

    private static final int RECENT_LIMIT = 5;

    private final WrongAnswerLogRepository wrongAnswerLogRepository;
    private final SignRepository signRepository;

    @Transactional
    public void reportWrongAnswer(Long userId, Long signId) {
        Sign sign = signRepository.findById(signId)
                .orElseThrow(() -> new BusinessException(ErrorCode.SIGN_NOT_FOUND));
        wrongAnswerLogRepository.save(WrongAnswerLog.builder()
                .userId(userId)
                .signId(sign.getId())
                .build());
    }

    public List<WrongAnswerResponse> getRecentWrongAnswers(Long userId, SignCategory category) {
        List<WrongAnswerLog> logs = wrongAnswerLogRepository.findRecentByUserIdAndCategory(
                userId, category, PageRequest.of(0, RECENT_LIMIT));

        Map<Long, Sign> signsById = signRepository
                .findAllById(logs.stream().map(WrongAnswerLog::getSignId).toList())
                .stream()
                .collect(Collectors.toMap(Sign::getId, Function.identity()));

        return logs.stream()
                .map(log -> WrongAnswerResponse.of(log, SignResponse.from(signsById.get(log.getSignId()))))
                .toList();
    }
}
