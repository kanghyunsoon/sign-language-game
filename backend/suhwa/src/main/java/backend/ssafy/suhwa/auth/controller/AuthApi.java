package backend.ssafy.suhwa.auth.controller;

import backend.ssafy.suhwa.auth.dto.LoginRequest;
import backend.ssafy.suhwa.auth.dto.RealtimeTicketResponse;
import backend.ssafy.suhwa.auth.dto.RefreshRequest;
import backend.ssafy.suhwa.auth.dto.SignupRequest;
import backend.ssafy.suhwa.auth.dto.TokenResponse;
import backend.ssafy.suhwa.common.config.OpenApiConfig;
import backend.ssafy.suhwa.common.security.LoginUser;
import backend.ssafy.suhwa.user.dto.UserProfileResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;

@Tag(name = "Auth")
public interface AuthApi {

    @Operation(summary = "회원가입")
    @ApiResponse(responseCode = "201", description = "가입 성공")
    @ApiResponse(responseCode = "409", description = "이미 사용 중인 이메일 (FR-006)")
    @PostMapping("/auth/signup")
    ResponseEntity<UserProfileResponse> signup(@RequestBody @Valid SignupRequest request);

    @Operation(summary = "로그인")
    @ApiResponse(responseCode = "200", description = "로그인 성공 - 인증/재발급 토큰 발급 (FR-007)")
    @ApiResponse(responseCode = "401", description = "이메일/비밀번호 불일치 또는 탈퇴 계정 (FR-010)")
    @PostMapping("/auth/login")
    ResponseEntity<TokenResponse> login(@RequestBody @Valid LoginRequest request);

    @Operation(summary = "토큰 재발급")
    @ApiResponse(responseCode = "200", description = "새 인증 토큰 발급 (FR-008)")
    @ApiResponse(responseCode = "401", description = "만료/무효화된 재발급 토큰")
    @PostMapping("/auth/refresh")
    ResponseEntity<TokenResponse> refresh(@RequestBody @Valid RefreshRequest request);

    @Operation(summary = "로그아웃")
    @SecurityRequirement(name = OpenApiConfig.BEARER_SCHEME_NAME)
    @ApiResponse(responseCode = "204", description = "로그아웃 처리, 재발급 토큰 무효화 (FR-009)")
    @PostMapping("/auth/logout")
    ResponseEntity<Void> logout(@LoginUser Long userId);

    @Operation(summary = "실시간 연결 전용 단기 인증 티켓 발급")
    @SecurityRequirement(name = OpenApiConfig.BEARER_SCHEME_NAME)
    @ApiResponse(responseCode = "201", description = "짧은 유효 시간(설정값)을 가진 1회용 티켓 발급 (FR-008)")
    @ApiResponse(responseCode = "401", description = "인증되지 않은 요청 (FR-001과 동일한 오류 형식)")
    @PostMapping("/auth/sse-ticket")
    ResponseEntity<RealtimeTicketResponse> issueRealtimeTicket(@LoginUser Long userId);
}
