package backend.ssafy.suhwa.auth.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.BDDMockito.willThrow;

import backend.ssafy.suhwa.auth.domain.RefreshToken;
import backend.ssafy.suhwa.auth.repository.RefreshTokenRepository;
import backend.ssafy.suhwa.common.exception.BusinessException;
import backend.ssafy.suhwa.common.exception.ErrorCode;
import backend.ssafy.suhwa.user.domain.User;
import backend.ssafy.suhwa.user.repository.UserRepository;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;

/**
 * refresh token 회전의 원자성을 실제 트랜잭션 위에서 검증한다.
 *
 * <p>클래스 수준 {@code @Transactional}을 쓰지 않는다 — 동시 요청이 서로의 커밋을 볼 수 있어야
 * 경쟁을 재현할 수 있고, 롤백 검증도 실제 커밋 경계가 있어야 의미가 있다. 그래서 생성한 데이터는
 * {@link #cleanUp()}에서 직접 정리한다.
 */
@SpringBootTest
class RefreshTokenRotationIntegrationTest {

    @Autowired
    private AuthService authService;

    @Autowired
    private RefreshTokenService refreshTokenService;

    @MockitoSpyBean
    private RefreshTokenRepository refreshTokenRepository;

    @Autowired
    private UserRepository userRepository;

    private Long userId;

    @BeforeEach
    void setUp() {
        userId = userRepository.save(User.builder()
                        .email("rotation-" + UUID.randomUUID() + "@test.com")
                        .passwordHash("hashed")
                        .nickname("회전")
                        .build())
                .getId();
    }

    @AfterEach
    void cleanUp() {
        // refresh_tokens.user_id는 ON DELETE RESTRICT라 토큰을 먼저 지워야 사용자를 지울 수 있다.
        refreshTokenRepository.deleteAll(tokensOfUser());
        userRepository.deleteById(userId);
    }

    /**
     * 동일 토큰으로 동시에 들어온 재발급 요청 중 정확히 하나만 성공해야 한다. 조회 후 무효화로
     * 나뉘어 있으면 여러 요청이 모두 검증을 통과해 각자 새 토큰 쌍을 받아가고, 회전의 보안
     * 속성("이전 토큰 재사용 = 탈취 신호")이 깨진다. 네트워크 재시도가 겹치는 정상 상황에서도
     * 재현되는 조건이다.
     */
    @Test
    void concurrentRefreshWithSameToken_onlyOneSucceeds() throws Exception {
        String rawToken = refreshTokenService.issue(userId);

        int threads = 8;
        CountDownLatch start = new CountDownLatch(1);
        ExecutorService pool = Executors.newFixedThreadPool(threads);
        List<Future<Boolean>> results = new ArrayList<>();
        try {
            for (int i = 0; i < threads; i++) {
                results.add(pool.submit(() -> {
                    start.await();
                    try {
                        authService.refresh(rawToken);
                        return true;
                    } catch (BusinessException e) {
                        assertThat(e.getCode()).isEqualTo(ErrorCode.INVALID_REFRESH_TOKEN.name());
                        return false;
                    }
                }));
            }
            start.countDown();

            long succeeded = 0;
            for (Future<Boolean> result : results) {
                if (result.get(20, TimeUnit.SECONDS)) {
                    succeeded++;
                }
            }
            assertThat(succeeded)
                    .as("동일 토큰으로 회전할 수 있는 요청은 하나뿐이어야 한다")
                    .isEqualTo(1);
        } finally {
            pool.shutdownNow();
        }
    }

    /**
     * 새 토큰 발급이 실패하면 기존 토큰의 무효화도 함께 되돌아가야 한다. 무효화와 발급이 서로 다른
     * 트랜잭션이면 기존 토큰은 폐기됐는데 새 토큰은 없어 사용자가 강제 로그아웃된다.
     */
    @Test
    void issueFailure_rollsBackRevocation_soExistingTokenStaysValid() {
        String rawToken = refreshTokenService.issue(userId);
        willThrow(new DataIntegrityViolationException("발급 단계 강제 실패"))
                .given(refreshTokenRepository).save(any(RefreshToken.class));

        assertThatThrownBy(() -> authService.refresh(rawToken)).isInstanceOf(RuntimeException.class);

        assertThat(tokensOfUser())
                .as("발급이 실패했으면 기존 토큰이 그대로 살아 있어야 한다")
                .hasSize(1)
                .allMatch(RefreshToken::isValid);
    }

    private List<RefreshToken> tokensOfUser() {
        return refreshTokenRepository.findAll().stream()
                .filter(token -> token.getUserId().equals(userId))
                .toList();
    }
}
