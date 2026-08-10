package backend.ssafy.suhwa.growth.controller;

import backend.ssafy.suhwa.growth.dto.AttendanceCalendarResponse;
import backend.ssafy.suhwa.growth.dto.AttendanceCompletionResponse;
import backend.ssafy.suhwa.growth.dto.AttendanceResponse;
import backend.ssafy.suhwa.growth.dto.PetStatusResponse;
import backend.ssafy.suhwa.growth.service.AttendanceService;
import backend.ssafy.suhwa.growth.service.PetQueryService;
import java.time.YearMonth;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequiredArgsConstructor
public class GrowthController implements GrowthApi {

    private final AttendanceService attendanceService;
    private final PetQueryService petQueryService;

    @Override
    public ResponseEntity<AttendanceResponse> getAttendance(Long userId) {
        return ResponseEntity.ok(attendanceService.getTodayStatus(userId));
    }

    @Override
    public ResponseEntity<AttendanceCalendarResponse> getAttendanceCalendar(Long userId, YearMonth yearMonth) {
        return ResponseEntity.ok(attendanceService.getCalendar(userId, yearMonth));
    }

    @Override
    public ResponseEntity<AttendanceCompletionResponse> checkIn(Long userId) {
        return ResponseEntity.ok(attendanceService.checkIn(userId));
    }

    @Override
    public ResponseEntity<PetStatusResponse> getPet(Long userId) {
        return ResponseEntity.ok(petQueryService.getStatus(userId));
    }
}
