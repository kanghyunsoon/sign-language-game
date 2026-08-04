package backend.ssafy.suhwa.growth.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import java.time.LocalDate;
import java.time.YearMonth;
import java.util.List;

public record AttendanceCalendarResponse(
        @Schema(description = "조회 대상 연월", example = "2026-08")
        YearMonth yearMonth,
        @Schema(description = "해당 월에 출석한 날짜 목록", example = "[\"2026-08-01\", \"2026-08-02\"]")
        List<LocalDate> attendedDates) {
}
