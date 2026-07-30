package backend.ssafy.suhwa.gameresult.repository;

import backend.ssafy.suhwa.gameresult.domain.SoloSession;
import jakarta.persistence.LockModeType;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface SoloSessionRepository extends JpaRepository<SoloSession, String> {

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select session from SoloSession session where session.id = :id")
    Optional<SoloSession> findByIdForUpdate(@Param("id") String id);

    List<SoloSession> findByUserIdAndCompletedAtIsNotNullOrderByCompletedAtDesc(Long userId);
}
