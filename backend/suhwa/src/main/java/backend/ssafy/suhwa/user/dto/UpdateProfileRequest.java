package backend.ssafy.suhwa.user.dto;

import jakarta.validation.constraints.Size;

public record UpdateProfileRequest(
        @Size(max = 50) String nickname,
        @Size(max = 500) String profileImageUrl) {
}
