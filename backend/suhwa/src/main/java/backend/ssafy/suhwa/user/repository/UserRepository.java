package backend.ssafy.suhwa.user.repository;

import backend.ssafy.suhwa.user.domain.User;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface UserRepository extends JpaRepository<User, Long> {

    Optional<User> findByEmail(String email);

    boolean existsByEmail(String email);

    List<User> findTop5ByDeletedAtIsNullOrderByWinCountDescLossCountAsc();

    @Query("SELECT COUNT(u) + 1 FROM User u WHERE u.deletedAt IS NULL AND "
            + "(u.winCount > :winCount OR (u.winCount = :winCount AND u.lossCount < :lossCount))")
    long countHigherRanked(@Param("winCount") int winCount, @Param("lossCount") int lossCount);
}
