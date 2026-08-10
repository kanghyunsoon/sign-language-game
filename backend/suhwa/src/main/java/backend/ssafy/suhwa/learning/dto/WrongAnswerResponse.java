package backend.ssafy.suhwa.learning.dto;

import java.time.LocalDateTime;

/**
 * 오답노트 응답. {@code WrongAnswerLogRepository}의 DTO 프로젝션 쿼리가 이 생성자를 직접
 * 호출하므로(FR-009), 엔티티에서 조립하던 정적 팩터리는 더 이상 두지 않는다.
 */
public record WrongAnswerResponse(Long id, SignResponse sign, LocalDateTime wrongAt) {
}
