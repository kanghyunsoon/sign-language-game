package backend.ssafy.suhwa.learning.dto;

import backend.ssafy.suhwa.learning.domain.WrongAnswerLog;
import java.time.LocalDateTime;

public record WrongAnswerResponse(Long id, SignResponse sign, LocalDateTime wrongAt) {

    public static WrongAnswerResponse of(WrongAnswerLog log, SignResponse sign) {
        return new WrongAnswerResponse(log.getId(), sign, log.getWrongAt());
    }
}
