package backend.ssafy.suhwa.user.dto;

import backend.ssafy.suhwa.user.domain.User;

public record UserProfileResponse(Long id, String email, String nickname) {

    public static UserProfileResponse from(User user) {
        return new UserProfileResponse(user.getId(), user.getEmail(), user.getNickname());
    }
}
