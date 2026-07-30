package backend.ssafy.suhwa.growth.controller;

import backend.ssafy.suhwa.common.security.LoginUser;
import backend.ssafy.suhwa.growth.dto.AttendanceCompletionResponse;
import backend.ssafy.suhwa.growth.dto.AttendanceResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;

@Tag(name = "Growth", description = "출석 및 펫 성장 API")
public interface GrowthApi {

    @Operation(summary = "오늘 출석 상태 조회")
    @ApiResponse(responseCode = "200", description = "오늘 출석 여부와 현재 연속 출석 일수")
    @GetMapping("/growth/attendance")
    ResponseEntity<AttendanceResponse> getAttendance(@LoginUser Long userId);

    @Operation(summary = "오늘 출석")
    @ApiResponse(responseCode = "200", description = "신규 또는 기존 출석과 갱신된 펫 상태")
    @PostMapping("/growth/attendance")
    ResponseEntity<AttendanceCompletionResponse> checkIn(@LoginUser Long userId);
}
