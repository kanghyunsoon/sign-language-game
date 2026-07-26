package backend.ssafy.suhwa.user.service;

import backend.ssafy.suhwa.auth.service.RefreshTokenService;
import backend.ssafy.suhwa.common.exception.BusinessException;
import backend.ssafy.suhwa.common.exception.ErrorCode;
import backend.ssafy.suhwa.user.domain.User;
import backend.ssafy.suhwa.user.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class UserService {

    private final UserRepository userRepository;
    private final RefreshTokenService refreshTokenService;
    private final PasswordEncoder passwordEncoder;

    /**
     * 회원 가입. BCrypt 해싱(FR-003)은 CPU 바운드라 DB 트랜잭션 밖에서 수행하고, 저장만
     * 리포지토리 트랜잭션으로 커밋한다 — 해시 연산 동안 커넥션을 점유하지 않는다.
     */
    public User signup(String email, String rawPassword, String nickname) {
        if (userRepository.existsByEmail(email)) {
            throw new BusinessException(ErrorCode.EMAIL_ALREADY_EXISTS);
        }
        String passwordHash = passwordEncoder.encode(rawPassword);
        User user = User.builder()
                .email(email)
                .passwordHash(passwordHash)
                .nickname(nickname)
                .build();
        return userRepository.save(user);
    }

    /**
     * 로그인용 활성 회원 조회(FR-001). 탈퇴 회원은 {@code @SQLRestriction}로 조회 자체에서
     * 제외되므로, 없으면 자격 증명 오류로 처리한다(탈퇴 여부를 응답으로 구분해 노출하지 않음).
     */
    @Transactional(readOnly = true)
    public User findActiveByEmail(String email) {
        return userRepository.findByEmail(email)
                .orElseThrow(() -> new BusinessException(ErrorCode.INVALID_CREDENTIALS));
    }

    @Transactional(readOnly = true)
    public User getActiveUser(Long userId) {
        // 탈퇴 회원은 @SQLRestriction로 조회에서 제외되므로 findById가 곧 활성 회원 여부다.
        return userRepository.findById(userId)
                .orElseThrow(() -> new BusinessException(ErrorCode.USER_NOT_FOUND));
    }

    @Transactional
    public User updateProfile(Long userId, String nickname, String profileImageUrl) {
        User user = getActiveUser(userId);
        user.updateProfile(nickname, profileImageUrl);
        return user;
    }

    @Transactional
    public void withdraw(Long userId) {
        User user = getActiveUser(userId);
        user.withdraw();
        refreshTokenService.revokeAll(userId);
    }
}
