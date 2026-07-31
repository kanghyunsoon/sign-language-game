package backend.ssafy.suhwa.user.controller;

import backend.ssafy.suhwa.user.domain.User;
import backend.ssafy.suhwa.user.dto.UpdateProfileRequest;
import backend.ssafy.suhwa.user.dto.UserProfileResponse;
import backend.ssafy.suhwa.user.service.UserService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequiredArgsConstructor
public class UserController implements UserApi {

    private final UserService userService;

    @Override
    public ResponseEntity<UserProfileResponse> getMyProfile(Long userId) {
        return ResponseEntity.ok(UserProfileResponse.from(userService.getActiveUser(userId)));
    }

    @Override
    public ResponseEntity<UserProfileResponse> updateMyProfile(Long userId, UpdateProfileRequest request) {
        User user = userService.updateProfile(userId, request.nickname());
        return ResponseEntity.ok(UserProfileResponse.from(user));
    }

    @Override
    public ResponseEntity<Void> withdraw(Long userId) {
        userService.withdraw(userId);
        return ResponseEntity.noContent().build();
    }
}
