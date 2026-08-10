package backend.ssafy.suhwa.growth.controller;

import backend.ssafy.suhwa.common.config.OpenApiConfig;
import backend.ssafy.suhwa.common.security.LoginUser;
import backend.ssafy.suhwa.growth.dto.AttendanceCalendarResponse;
import backend.ssafy.suhwa.growth.dto.AttendanceCompletionResponse;
import backend.ssafy.suhwa.growth.dto.AttendanceResponse;
import backend.ssafy.suhwa.growth.dto.PetStatusResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.time.YearMonth;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestParam;

@Tag(name = "Growth", description = "출석 및 펫 성장 API")
@SecurityRequirement(name = OpenApiConfig.BEARER_SCHEME_NAME)
public interface GrowthApi {

    @Operation(
            summary = "오늘 출석 상태 조회",
            description = "로그인 사용자의 오늘 출석 여부와 현재 연속 출석 일수를 조회한다.")
    @ApiResponse(responseCode = "200", description = "오늘 출석 여부와 현재 연속 출석 일수")
    @ApiResponse(responseCode = "401", description = "인증 필요")
    @GetMapping("/growth/attendance")
    ResponseEntity<AttendanceResponse> getAttendance(@LoginUser Long userId);

    @Operation(
            summary = "월별 출석 캘린더 조회",
            description = "로그인 사용자가 지정한 연월에 출석한 날짜 목록을 조회한다. "
                    + "yearMonth를 지정하지 않으면 서비스 기준 현재 월을 사용한다.")
    @ApiResponse(responseCode = "200", description = "해당 월에 출석한 날짜 목록")
    @ApiResponse(responseCode = "401", description = "인증 필요")
    @GetMapping("/growth/attendance/calendar")
    ResponseEntity<AttendanceCalendarResponse> getAttendanceCalendar(
            @LoginUser Long userId,
            @Parameter(description = "조회할 연월", example = "2026-08")
            @RequestParam(required = false)
            @DateTimeFormat(pattern = "yyyy-MM")
            YearMonth yearMonth);

    @Operation(
            summary = "오늘 출석",
            description = "오늘 첫 출석이면 펫 XP 3을 지급한다. 같은 날 다시 호출하면 추가 기록이나 XP 없이 기존 결과를 반환한다.")
    @ApiResponse(responseCode = "200", description = "출석 결과, 지급 XP와 갱신된 펫 상태")
    @ApiResponse(responseCode = "401", description = "인증 필요")
    @PostMapping("/growth/attendance")
    ResponseEntity<AttendanceCompletionResponse> checkIn(@LoginUser Long userId);

    @Operation(
            summary = "펫 성장 상태 조회",
            description = "로그인 사용자의 단일 펫 레벨, XP와 자동 진화 단계를 조회한다. 최대 레벨은 20이다.")
    @ApiResponse(responseCode = "200", description = "최신 펫 성장 상태")
    @ApiResponse(responseCode = "401", description = "인증 필요")
    @ApiResponse(responseCode = "500", description = "사용자 펫 데이터가 존재하지 않음")
    @GetMapping("/growth/pet")
    ResponseEntity<PetStatusResponse> getPet(@LoginUser Long userId);
}
