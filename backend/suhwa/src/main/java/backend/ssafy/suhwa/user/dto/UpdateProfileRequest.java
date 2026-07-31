package backend.ssafy.suhwa.user.dto;

import jakarta.validation.constraints.Size;

public record UpdateProfileRequest(
        @Size(min = 2, max = 10) String nickname,
        @Size(max = 500) String profileImageUrl) {
}
