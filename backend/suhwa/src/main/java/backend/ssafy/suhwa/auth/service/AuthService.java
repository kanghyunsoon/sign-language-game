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

    /**
     * refresh token 회전. 기존 토큰 무효화와 새 토큰 발급이 {@link RefreshTokenService}의 한
     * 트랜잭션 안에서 함께 처리된다 — 둘로 쪼개면 사이에서 실패했을 때 기존 토큰은 폐기됐는데
     * 새 토큰이 없어 사용자가 강제 로그아웃된다.
     *
     * <p>클래스 주석의 "트랜잭션 없음" 방침은 BCrypt 때문이며 {@code login}에만 해당한다.
     * 이 경로에는 해싱 연산이 없어 두 쓰기를 묶지 못할 이유가 없다. 액세스 토큰 서명은 DB 작업이
     * 아니므로 트랜잭션이 끝난 뒤 수행한다.
     */
    public TokenResponse refresh(String rawRefreshToken) {
        RefreshTokenService.RotatedToken rotated = refreshTokenService.rotateAndIssue(rawRefreshToken);
        return new TokenResponse(
                jwtTokenProvider.createAccessToken(rotated.userId()), rotated.rawRefreshToken());
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
