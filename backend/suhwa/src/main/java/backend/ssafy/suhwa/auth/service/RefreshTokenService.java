package backend.ssafy.suhwa.auth.service;

import backend.ssafy.suhwa.auth.domain.RefreshToken;
import backend.ssafy.suhwa.auth.repository.RefreshTokenRepository;
import backend.ssafy.suhwa.common.exception.BusinessException;
import backend.ssafy.suhwa.common.exception.ErrorCode;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Duration;
import java.time.LocalDateTime;
import java.util.HexFormat;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * refresh token 발급·회전·무효화 및 저장 형식(SHA-256 해시)을 담당한다(spec 004 FR-002, AUTH-01-02).
 *
 * <p>DB에는 원문 대신 해시만 저장한다. 발급 시 원문을 클라이언트에 반환하고, 검증은 입력 원문을
 * 다시 해싱해 화이트리스트와 대조한다. 재발급(rotate) 시 사용한 토큰은 즉시 무효화한다.
 */
@Service
@RequiredArgsConstructor
public class RefreshTokenService {

    private final RefreshTokenRepository refreshTokenRepository;

    @Value("${jwt.refresh-token-expiration-ms}")
    private long refreshTokenExpirationMs;

    /** 새 refresh token을 발급하고 해시를 저장한 뒤, 클라이언트에 줄 원문을 반환한다. */
    @Transactional
    public String issue(Long userId) {
        return createToken(userId);
    }

    /**
     * 재발급 요청을 검증해 기존 토큰을 무효화하고, 같은 트랜잭션에서 새 토큰을 발급한다.
     * 저장되지 않았거나 이미 만료·무효화된 토큰이면 {@link ErrorCode#INVALID_REFRESH_TOKEN}.
     *
     * <p>무효화와 발급을 반드시 한 트랜잭션에 둔다. 둘로 쪼개면 사이에서 실패했을 때 기존 토큰은
     * 이미 폐기됐는데 새 토큰이 없어 <b>사용자가 강제 로그아웃된다</b> — DB 순간 장애, 커넥션
     * 타임아웃(3초), 풀 고갈 어느 것이든 트리거가 된다.
     *
     * <p>동시성은 {@link RefreshTokenRepository#revokeIfValid}의 조건부 UPDATE가 담당한다.
     * 영향 행 수가 1인 요청만 통과하므로 동일 토큰으로 동시에 들어온 요청 중 하나만 성공한다.
     */
    @Transactional
    public RotatedToken rotateAndIssue(String rawRefreshToken) {
        String hashedToken = hash(rawRefreshToken);
        Long userId = refreshTokenRepository.findByToken(hashedToken)
                .map(RefreshToken::getUserId)
                .orElseThrow(() -> new BusinessException(ErrorCode.INVALID_REFRESH_TOKEN));

        if (refreshTokenRepository.revokeIfValid(hashedToken) != 1) {
            throw new BusinessException(ErrorCode.INVALID_REFRESH_TOKEN);
        }
        return new RotatedToken(userId, createToken(userId));
    }

    /** 회전 결과 — 토큰 소유자와 새로 발급된 refresh token 원문. */
    public record RotatedToken(Long userId, String rawRefreshToken) {}

    /** 해당 사용자의 유효한 refresh token을 모두 무효화한다(로그아웃·탈퇴 시). */
    @Transactional
    public void revokeAll(Long userId) {
        refreshTokenRepository.revokeAllByUserId(userId);
    }

    private String createToken(Long userId) {
        String rawRefreshToken = UUID.randomUUID().toString();
        RefreshToken refreshToken = RefreshToken.builder()
                .userId(userId)
                .token(hash(rawRefreshToken))
                .expiresAt(LocalDateTime.now().plus(Duration.ofMillis(refreshTokenExpirationMs)))
                .build();
        refreshTokenRepository.save(refreshToken);
        return rawRefreshToken;
    }

    private String hash(String rawToken) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] hashBytes = digest.digest(rawToken.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(hashBytes);
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 알고리즘을 사용할 수 없습니다.", e);
        }
    }
}
