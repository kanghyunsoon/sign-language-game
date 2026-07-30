package backend.ssafy.suhwa.growth.controller;

import backend.ssafy.suhwa.growth.dto.AttendanceCompletionResponse;
import backend.ssafy.suhwa.growth.dto.AttendanceResponse;
import backend.ssafy.suhwa.growth.service.AttendanceService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequiredArgsConstructor
public class GrowthController implements GrowthApi {

    private final AttendanceService attendanceService;

    @Override
    public ResponseEntity<AttendanceResponse> getAttendance(Long userId) {
        return ResponseEntity.ok(attendanceService.getTodayStatus(userId));
    }

    @Override
    public ResponseEntity<AttendanceCompletionResponse> checkIn(Long userId) {
        return ResponseEntity.ok(attendanceService.checkIn(userId));
    }
}
