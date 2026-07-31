package backend.ssafy.suhwa.growth.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import java.time.LocalDate;

public record AttendanceCompletionResponse(
        @Schema(description = "서비스 기준 날짜", example = "2026-07-31")
        LocalDate attendanceDate,
        @Schema(description = "오늘 출석 완료 여부", example = "true")
        boolean attendedToday,
        @Schema(description = "현재 연속 출석 일수", example = "4")
        int streakCount,
        @Schema(description = "이번 요청에서 새 출석이 생성됐는지 여부", example = "true")
        boolean newlyAttended,
        @Schema(description = "이번 요청에서 지급된 펫 경험치. 재요청이면 0", example = "3")
        int awardedExp,
        @Schema(description = "출석 반영 후 펫 상태")
        PetStatusResponse pet) {
}
