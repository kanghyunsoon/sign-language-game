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
        String rawRefreshToken = UUID.randomUUID().toString();
        RefreshToken refreshToken = RefreshToken.builder()
                .userId(userId)
                .token(hash(rawRefreshToken))
                .expiresAt(LocalDateTime.now().plus(Duration.ofMillis(refreshTokenExpirationMs)))
                .build();
        refreshTokenRepository.save(refreshToken);
        return rawRefreshToken;
    }

    /**
     * 재발급 요청 검증 후 사용된 토큰을 무효화하고, 소유자 userId를 반환한다.
     * 저장되지 않았거나 이미 만료·무효화된 토큰이면 {@link ErrorCode#INVALID_REFRESH_TOKEN}.
     */
    @Transactional
    public Long rotate(String rawRefreshToken) {
        RefreshToken stored = refreshTokenRepository.findByToken(hash(rawRefreshToken))
                .orElseThrow(() -> new BusinessException(ErrorCode.INVALID_REFRESH_TOKEN));
        if (!stored.isValid()) {
            throw new BusinessException(ErrorCode.INVALID_REFRESH_TOKEN);
        }
        stored.revoke();
        return stored.getUserId();
    }

    /** 해당 사용자의 유효한 refresh token을 모두 무효화한다(로그아웃·탈퇴 시). */
    @Transactional
    public void revokeAll(Long userId) {
        refreshTokenRepository.revokeAllByUserId(userId);
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
