package backend.ssafy.suhwa.user.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.BDDMockito.given;

import backend.ssafy.suhwa.auth.service.RefreshTokenService;
import backend.ssafy.suhwa.common.exception.BusinessException;
import backend.ssafy.suhwa.common.exception.ErrorCode;
import backend.ssafy.suhwa.growth.service.PetGrowthService;
import backend.ssafy.suhwa.user.domain.User;
import backend.ssafy.suhwa.user.repository.UserRepository;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.transaction.PlatformTransactionManager;

@ExtendWith(MockitoExtension.class)
class UserServiceTest {

    @Mock
    private UserRepository userRepository;

    @Mock
    private RefreshTokenService refreshTokenService;

    @Mock
    private PetGrowthService petGrowthService;

    @Mock
    private PlatformTransactionManager transactionManager;

    private final PasswordEncoder passwordEncoder = new BCryptPasswordEncoder();

    private UserService userService;

    @BeforeEach
    void setUp() {
        userService = new UserService(
                userRepository, refreshTokenService, passwordEncoder, petGrowthService, transactionManager);
    }

    @Test
    void changePassword_correctCurrentPassword_updatesHash() {
        User user = User.builder()
                .email("a@a.com")
                .passwordHash(passwordEncoder.encode("oldPassword"))
                .nickname("nick")
                .build();
        given(userRepository.findById(1L)).willReturn(Optional.of(user));

        userService.changePassword(1L, "oldPassword", "newPassword");

        assertThat(passwordEncoder.matches("newPassword", user.getPasswordHash())).isTrue();
    }

    @Test
    void changePassword_wrongCurrentPassword_throwsInvalidCredentials() {
        User user = User.builder()
                .email("a@a.com")
                .passwordHash(passwordEncoder.encode("oldPassword"))
                .nickname("nick")
                .build();
        given(userRepository.findById(1L)).willReturn(Optional.of(user));

        assertThatThrownBy(() -> userService.changePassword(1L, "wrongPassword", "newPassword"))
                .isInstanceOfSatisfying(BusinessException.class, exception ->
                        assertThat(exception.getCode()).isEqualTo(ErrorCode.INVALID_CREDENTIALS.name()));

        assertThat(passwordEncoder.matches("oldPassword", user.getPasswordHash())).isTrue();
    }
}
