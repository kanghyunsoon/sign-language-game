package backend.ssafy.suhwa.learning.repository;

import backend.ssafy.suhwa.learning.domain.SignCategory;
import backend.ssafy.suhwa.learning.domain.WrongAnswerLog;
import backend.ssafy.suhwa.learning.dto.WrongAnswerResponse;
import java.util.List;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface WrongAnswerLogRepository extends JpaRepository<WrongAnswerLog, Long> {

    /**
     * 오답노트 조회를 응답 DTO 프로젝션 단일 쿼리로 처리한다(FR-009). 이전에는 로그 목록을 먼저
     * 조회한 뒤 signId로 {@code findAllById}를 한 번 더 던져 애플리케이션에서 조인했다(2쿼리 +
     * 인메모리 조인).
     *
     * <p>{@code WrongAnswerLog}와 {@code Sign}은 이 코드베이스의 일관된 방침대로 연관관계 매핑
     * 없이 식별자(`signId`)로만 참조하므로 조인 조건을 명시하는 ad-hoc JOIN이 불가피하다(FR-010).
     * 그 조인을 서비스가 아니라 이 쿼리 한 곳으로 모아, 조회 경로마다 조인 방식이 갈리지 않게 한다.
     */
    @Query("SELECT new backend.ssafy.suhwa.learning.dto.WrongAnswerResponse("
            + "w.id, "
            + "new backend.ssafy.suhwa.learning.dto.SignResponse("
            + "s.id, s.category, s.label, s.referenceMediaUrl, s.tip), "
            + "w.wrongAt) "
            + "FROM WrongAnswerLog w JOIN Sign s ON w.signId = s.id "
            + "WHERE w.userId = :userId AND s.category = :category "
            + "ORDER BY w.wrongAt DESC")
    List<WrongAnswerResponse> findRecentByUserIdAndCategory(
            @Param("userId") Long userId, @Param("category") SignCategory category, Pageable pageable);
}
