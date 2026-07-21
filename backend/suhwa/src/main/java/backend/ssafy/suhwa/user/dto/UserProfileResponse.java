package backend.ssafy.suhwa.user.dto;

import backend.ssafy.suhwa.user.domain.User;

public record UserProfileResponse(
        Long id,
        String email,
        String nickname,
        String profileImageUrl,
        int winCount,
        int lossCount) {

    public static UserProfileResponse from(User user) {
        return new UserProfileResponse(
                user.getId(),
                user.getEmail(),
                user.getNickname(),
                user.getProfileImageUrl(),
                user.getWinCount(),
                user.getLossCount());
    }
}
