package backend.ssafy.suhwa.user.controller;

import backend.ssafy.suhwa.common.config.OpenApiConfig;
import backend.ssafy.suhwa.common.security.LoginUser;
import backend.ssafy.suhwa.user.dto.UpdateProfileRequest;
import backend.ssafy.suhwa.user.dto.UserProfileResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.RequestBody;

@Tag(name = "Users")
@SecurityRequirement(name = OpenApiConfig.BEARER_SCHEME_NAME)
public interface UserApi {

    @Operation(summary = "내 프로필 조회")
    @ApiResponse(responseCode = "200", description = "프로필 조회 성공")
    @GetMapping("/users/me")
    ResponseEntity<UserProfileResponse> getMyProfile(@LoginUser Long userId);

    @Operation(summary = "내 프로필 수정", description = "닉네임을 수정합니다.")
    @ApiResponse(responseCode = "200", description = "프로필 수정 성공")
    @PatchMapping("/users/me")
    ResponseEntity<UserProfileResponse> updateMyProfile(
            @LoginUser Long userId, @RequestBody @Valid UpdateProfileRequest request);

    @Operation(summary = "회원 탈퇴", description = "사용자를 Soft Delete하고 Refresh Token을 모두 무효화합니다.")
    @ApiResponse(responseCode = "204", description = "회원 탈퇴 완료")
    @DeleteMapping("/users/me")
    ResponseEntity<Void> withdraw(@LoginUser Long userId);
}
