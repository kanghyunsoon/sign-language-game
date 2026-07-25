package backend.ssafy.suhwa.auth.service;

import backend.ssafy.suhwa.auth.dto.TokenResponse;
import backend.ssafy.suhwa.common.exception.BusinessException;
import backend.ssafy.suhwa.common.exception.ErrorCode;
import backend.ssafy.suhwa.common.security.JwtTokenProvider;
import backend.ssafy.suhwa.user.domain.User;
import backend.ssafy.suhwa.user.service.UserService;
import lombok.RequiredArgsConstructor;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;

/**
 * 인증 유스케이스(로그인·재발급·로그아웃)를 조율한다(spec 004 FR-001~003, AUTH-01-02).
 *
 * <p>refresh token의 저장 형식·수명은 {@link RefreshTokenService}가, 회원 조회는
 * {@link UserService}가 책임진다. 여기서는 흐름만 엮는다.
 *
 * <p>BCrypt 검증(FR-003)은 CPU 바운드 작업이라 DB 트랜잭션 밖에서 수행한다. 그래서 이 클래스의
 * 메서드에는 클래스/메서드 수준 {@code @Transactional}을 두지 않고, DB 쓰기는 위임 서비스의
 * 트랜잭션 경계 안에서만 일어나게 한다(커넥션 점유 시간 최소화).
 */
@Service
@RequiredArgsConstructor
public class AuthService {

    private final UserService userService;
    private final RefreshTokenService refreshTokenService;
    private final PasswordEncoder passwordEncoder;
    private final JwtTokenProvider jwtTokenProvider;

    public TokenResponse login(String email, String rawPassword) {
        User user = userService.findActiveByEmail(email);
        // BCrypt matches는 트랜잭션 밖에서 수행(FR-003) — 커넥션을 잡은 채 해시 연산하지 않는다.
        if (!passwordEncoder.matches(rawPassword, user.getPasswordHash())) {
            throw new BusinessException(ErrorCode.INVALID_CREDENTIALS);
        }
        return issueTokens(user.getId());
    }

    public TokenResponse refresh(String rawRefreshToken) {
        Long userId = refreshTokenService.rotate(rawRefreshToken);
        return issueTokens(userId);
    }

    public void logout(Long userId) {
        refreshTokenService.revokeAll(userId);
    }

    private TokenResponse issueTokens(Long userId) {
        String accessToken = jwtTokenProvider.createAccessToken(userId);
        String rawRefreshToken = refreshTokenService.issue(userId);
        return new TokenResponse(accessToken, rawRefreshToken);
    }
}
