package backend.ssafy.suhwa.user.service;

import backend.ssafy.suhwa.auth.repository.RefreshTokenRepository;
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
@Transactional(readOnly = true)
public class UserService {

    private final UserRepository userRepository;
    private final RefreshTokenRepository refreshTokenRepository;
    private final PasswordEncoder passwordEncoder;

    @Transactional
    public User signup(String email, String rawPassword, String nickname) {
        if (userRepository.existsByEmail(email)) {
            throw new BusinessException(ErrorCode.EMAIL_ALREADY_EXISTS);
        }
        User user = User.builder()
                .email(email)
                .passwordHash(passwordEncoder.encode(rawPassword))
                .nickname(nickname)
                .build();
        return userRepository.save(user);
    }

    public User getActiveUser(Long userId) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new BusinessException(ErrorCode.USER_NOT_FOUND));
        if (user.isDeleted()) {
            throw new BusinessException(ErrorCode.USER_NOT_FOUND);
        }
        return user;
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
        refreshTokenRepository.revokeAllByUserId(userId);
    }
}
