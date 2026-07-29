package backend.ssafy.suhwa.auth.repository;

import static org.assertj.core.api.Assertions.assertThat;

import backend.ssafy.suhwa.auth.domain.RefreshToken;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.data.jpa.test.autoconfigure.DataJpaTest;
import org.springframework.test.context.TestPropertySource;

@DataJpaTest
@TestPropertySource(properties = "spring.jpa.hibernate.ddl-auto=create-drop")
class RefreshTokenRepositoryTest {

    @Autowired
    private RefreshTokenRepository refreshTokenRepository;

    @Test
    void findByToken_returnsStoredToken() {
        RefreshToken saved = refreshTokenRepository.save(RefreshToken.builder()
                .userId(1L)
                .token("hashed-token-value")
                .expiresAt(LocalDateTime.now().plusDays(14))
                .build());

        Optional<RefreshToken> found = refreshTokenRepository.findByToken("hashed-token-value");

        assertThat(found).isPresent();
        assertThat(found.get().getId()).isEqualTo(saved.getId());
        assertThat(found.get().isValid()).isTrue();
    }

    @Test
    void revokeAllByUserId_revokesOnlyThatUsersActiveTokens() {
        refreshTokenRepository.save(RefreshToken.builder()
                .userId(2L).token("t1").expiresAt(LocalDateTime.now().plusDays(1)).build());
        refreshTokenRepository.save(RefreshToken.builder()
                .userId(2L).token("t2").expiresAt(LocalDateTime.now().plusDays(1)).build());
        refreshTokenRepository.save(RefreshToken.builder()
                .userId(3L).token("t3").expiresAt(LocalDateTime.now().plusDays(1)).build());

        refreshTokenRepository.revokeAllByUserId(2L);

        List<RefreshToken> all = refreshTokenRepository.findAll();
        assertThat(all)
                .filteredOn(rt -> rt.getUserId().equals(2L))
                .allMatch(rt -> !rt.isValid());
        assertThat(all)
                .filteredOn(rt -> rt.getUserId().equals(3L))
                .allMatch(RefreshToken::isValid);
    }

    /**
     * 조건부 UPDATE가 회전 권한의 심판 역할을 한다. 유효한 토큰은 1을 반환하고, 같은 토큰에 대한
     * 두 번째 호출은 0이 되어야 한다 — 동시 요청 중 하나만 통과시키는 성질이 여기서 나온다.
     */
    @Test
    void revokeIfValid_returnsOneOnlyForTheFirstCall() {
        refreshTokenRepository.save(RefreshToken.builder()
                .userId(10L).token("rotatable").expiresAt(LocalDateTime.now().plusDays(1)).build());

        assertThat(refreshTokenRepository.revokeIfValid("rotatable")).isEqualTo(1);
        assertThat(refreshTokenRepository.revokeIfValid("rotatable"))
                .as("이미 무효화된 토큰은 다시 회전될 수 없다")
                .isZero();
        assertThat(refreshTokenRepository.findByToken("rotatable").orElseThrow().isValid()).isFalse();
    }

    @Test
    void revokeIfValid_returnsZero_whenExpired() {
        refreshTokenRepository.save(RefreshToken.builder()
                .userId(11L).token("stale").expiresAt(LocalDateTime.now().minusMinutes(1)).build());

        assertThat(refreshTokenRepository.revokeIfValid("stale")).isZero();
    }

    @Test
    void revokeIfValid_returnsZero_whenTokenUnknown() {
        assertThat(refreshTokenRepository.revokeIfValid("never-issued")).isZero();
    }

    @Test
    void isValid_returnsFalse_whenExpired() {
        RefreshToken expired = refreshTokenRepository.save(RefreshToken.builder()
                .userId(4L).token("expired-token").expiresAt(LocalDateTime.now().minusMinutes(1)).build());

        assertThat(expired.isValid()).isFalse();
    }
}
