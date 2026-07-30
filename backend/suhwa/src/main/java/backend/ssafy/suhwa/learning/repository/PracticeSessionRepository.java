package backend.ssafy.suhwa.learning.repository;

import backend.ssafy.suhwa.learning.domain.PracticeSession;
import jakarta.persistence.LockModeType;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface PracticeSessionRepository extends JpaRepository<PracticeSession, Long> {

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select session from PracticeSession session where session.id = :id")
    Optional<PracticeSession> findByIdForUpdate(@Param("id") Long id);
}
