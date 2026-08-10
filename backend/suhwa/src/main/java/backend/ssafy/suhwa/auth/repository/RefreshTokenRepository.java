package backend.ssafy.suhwa.auth.repository;

import backend.ssafy.suhwa.auth.domain.RefreshToken;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface RefreshTokenRepository extends JpaRepository<RefreshToken, Long> {

    Optional<RefreshToken> findByToken(String token);

    /**
     * 아직 유효한 토큰만 무효화하고 영향 행 수를 반환한다. 검증과 무효화가 하나의 조건부 UPDATE로
     * 합쳐지므로, 동일 토큰으로 동시에 들어온 요청 중 **1을 받은 요청만** 회전을 진행할 수 있다.
     *
     * <p>조회 후 무효화(read-then-write)로 나누면 두 요청이 모두 검증을 통과해 각자 새 토큰 쌍을
     * 발급받고, 회전의 보안 속성("이전 토큰 재사용 = 탈취 신호")이 깨진다. 애플리케이션 락 없이
     * DB가 직렬화를 보장하게 하는 것이 이 쿼리의 목적이다.
     *
     * @return 무효화된 행 수. 1이면 이 요청이 회전 권한을 얻었고, 0이면 토큰이 없거나 이미
     *     무효화·만료됐거나 다른 요청이 먼저 가져간 것이다
     */
    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("UPDATE RefreshToken rt SET rt.revokedAt = CURRENT_TIMESTAMP "
            + "WHERE rt.token = :token AND rt.revokedAt IS NULL "
            + "AND rt.expiresAt > CURRENT_TIMESTAMP")
    int revokeIfValid(@Param("token") String token);

    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("UPDATE RefreshToken rt SET rt.revokedAt = CURRENT_TIMESTAMP "
            + "WHERE rt.userId = :userId AND rt.revokedAt IS NULL")
    void revokeAllByUserId(@Param("userId") Long userId);
}
