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

    @Test
    void isValid_returnsFalse_whenExpired() {
        RefreshToken expired = refreshTokenRepository.save(RefreshToken.builder()
                .userId(4L).token("expired-token").expiresAt(LocalDateTime.now().minusMinutes(1)).build());

        assertThat(expired.isValid()).isFalse();
    }
}
