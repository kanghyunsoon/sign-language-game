package backend.ssafy.suhwa.user.dto;

import jakarta.validation.constraints.Size;

public record UpdateProfileRequest(@Size(max = 50) String nickname) {
}
