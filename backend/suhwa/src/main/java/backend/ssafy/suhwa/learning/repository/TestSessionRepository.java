package backend.ssafy.suhwa.learning.repository;

import backend.ssafy.suhwa.learning.domain.TestSession;
import java.util.List;
import java.util.Optional;
import jakarta.persistence.LockModeType;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface TestSessionRepository extends JpaRepository<TestSession, Long> {

    Optional<TestSession> findByIdAndUserId(Long id, Long userId);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select session from TestSession session where session.id = :id")
    Optional<TestSession> findByIdForUpdate(@Param("id") Long id);

    List<TestSession> findByUserIdAndCompletedAtIsNotNullOrderByCompletedAtDesc(
            Long userId, Pageable pageable);
}
