package backend.ssafy.suhwa.learning.repository;

import backend.ssafy.suhwa.learning.domain.SignCategory;
import backend.ssafy.suhwa.learning.domain.WrongAnswerLog;
import java.util.List;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface WrongAnswerLogRepository extends JpaRepository<WrongAnswerLog, Long> {

    @Query("SELECT w FROM WrongAnswerLog w JOIN Sign s ON w.signId = s.id "
            + "WHERE w.userId = :userId AND s.category = :category "
            + "ORDER BY w.wrongAt DESC")
    List<WrongAnswerLog> findRecentByUserIdAndCategory(
            @Param("userId") Long userId, @Param("category") SignCategory category, Pageable pageable);
}
