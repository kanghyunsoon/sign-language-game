package backend.ssafy.suhwa.auth.service;

import backend.ssafy.suhwa.auth.domain.RefreshToken;
import backend.ssafy.suhwa.auth.repository.RefreshTokenRepository;
import backend.ssafy.suhwa.common.exception.BusinessException;
import backend.ssafy.suhwa.common.exception.ErrorCode;
import backend.ssafy.suhwa.common.security.JwtTokenProvider;
import backend.ssafy.suhwa.user.domain.User;
import backend.ssafy.suhwa.user.repository.UserRepository;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Duration;
import java.time.LocalDateTime;
import java.util.HexFormat;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class AuthService {

    private final UserRepository userRepository;
    private final RefreshTokenRepository refreshTokenRepository;
    private final PasswordEncoder passwordEncoder;
    private final JwtTokenProvider jwtTokenProvider;

    @Value("${jwt.refresh-token-expiration-ms}")
    private long refreshTokenExpirationMs;

    @Transactional
    public TokenPair login(String email, String rawPassword) {
        User user = userRepository.findByEmail(email)
                .orElseThrow(() -> new BusinessException(ErrorCode.INVALID_CREDENTIALS));
        if (user.isDeleted()) {
            throw new BusinessException(ErrorCode.ACCOUNT_WITHDRAWN);
        }
        if (!passwordEncoder.matches(rawPassword, user.getPasswordHash())) {
            throw new BusinessException(ErrorCode.INVALID_CREDENTIALS);
        }
        return issueTokens(user.getId());
    }

    @Transactional
    public TokenPair refresh(String rawRefreshToken) {
        RefreshToken stored = refreshTokenRepository.findByToken(hash(rawRefreshToken))
                .orElseThrow(() -> new BusinessException(ErrorCode.INVALID_REFRESH_TOKEN));
        if (!stored.isValid()) {
            throw new BusinessException(ErrorCode.INVALID_REFRESH_TOKEN);
        }
        stored.revoke();
        return issueTokens(stored.getUserId());
    }

    @Transactional
    public void logout(Long userId) {
        refreshTokenRepository.revokeAllByUserId(userId);
    }

    private TokenPair issueTokens(Long userId) {
        String accessToken = jwtTokenProvider.createAccessToken(userId);
        String rawRefreshToken = UUID.randomUUID().toString();
        RefreshToken refreshToken = RefreshToken.builder()
                .userId(userId)
                .token(hash(rawRefreshToken))
                .expiresAt(LocalDateTime.now().plus(Duration.ofMillis(refreshTokenExpirationMs)))
                .build();
        refreshTokenRepository.save(refreshToken);
        return new TokenPair(accessToken, rawRefreshToken);
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

    public record TokenPair(String accessToken, String refreshToken) {
    }
}
