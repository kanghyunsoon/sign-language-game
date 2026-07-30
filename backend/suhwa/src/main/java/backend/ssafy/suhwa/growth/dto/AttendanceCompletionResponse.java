package backend.ssafy.suhwa.growth.dto;

import java.time.LocalDate;

public record AttendanceCompletionResponse(
        LocalDate attendanceDate,
        boolean attendedToday,
        int streakCount,
        boolean newlyAttended,
        int awardedExp,
        PetStatusResponse pet) {
}
