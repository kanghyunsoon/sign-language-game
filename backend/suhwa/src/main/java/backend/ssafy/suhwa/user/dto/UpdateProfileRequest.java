package backend.ssafy.suhwa.user.dto;

import jakarta.validation.constraints.Size;

<<<<<<< HEAD
public record UpdateProfileRequest(@Size(max = 50) String nickname) {
=======
public record UpdateProfileRequest(
        @Size(min = 2, max = 10) String nickname,
        @Size(max = 500) String profileImageUrl) {
>>>>>>> 390fa95bca2fee7027bb0a9d873578db3d522c50
}
