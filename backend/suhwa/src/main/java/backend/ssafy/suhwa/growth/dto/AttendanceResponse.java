package backend.ssafy.suhwa.growth.dto;

import java.time.LocalDate;

public record AttendanceResponse(
        LocalDate attendanceDate,
        boolean attendedToday,
        int streakCount) {
}
