package backend.ssafy.suhwa.growth.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import java.time.LocalDate;

public record AttendanceResponse(
        @Schema(description = "서비스 기준 날짜", example = "2026-07-31")
        LocalDate attendanceDate,
        @Schema(description = "오늘 출석 완료 여부", example = "true")
        boolean attendedToday,
        @Schema(description = "현재 연속 출석 일수", example = "4")
        int streakCount) {
}
