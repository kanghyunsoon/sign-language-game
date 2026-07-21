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
    @ApiResponse(responseCode = "200", description = "조회 성공")
    @GetMapping("/users/me")
    ResponseEntity<UserProfileResponse> getMyProfile(@LoginUser Long userId);

    @Operation(summary = "내 프로필 수정", description = "닉네임/프로필 이미지 URL 수정 (FR-012)")
    @ApiResponse(responseCode = "200", description = "수정 성공")
    @PatchMapping("/users/me")
    ResponseEntity<UserProfileResponse> updateMyProfile(
            @LoginUser Long userId, @RequestBody @Valid UpdateProfileRequest request);

    @Operation(summary = "회원 탈퇴", description = "Soft Delete 처리, 보유 refresh token 일괄 무효화 (FR-013/014)")
    @ApiResponse(responseCode = "204", description = "탈퇴 처리 완료")
    @DeleteMapping("/users/me")
    ResponseEntity<Void> withdraw(@LoginUser Long userId);
}
