package backend.ssafy.suhwa.auth.dto;

public record TokenResponse(String accessToken, String refreshToken) {
}
