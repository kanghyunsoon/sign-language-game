package backend.ssafy.suhwa.growth.service;

import backend.ssafy.suhwa.growth.config.GrowthPolicyProperties;
import backend.ssafy.suhwa.growth.domain.Attendance;
import backend.ssafy.suhwa.growth.domain.UserPet;
import backend.ssafy.suhwa.growth.dto.AttendanceCompletionResponse;
import backend.ssafy.suhwa.growth.dto.AttendanceResponse;
import backend.ssafy.suhwa.growth.dto.PetStatusResponse;
import backend.ssafy.suhwa.growth.repository.AttendanceRepository;
import java.time.Clock;
import java.time.LocalDate;
import java.util.Optional;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class AttendanceService {

    private final AttendanceRepository attendanceRepository;
    private final GrowthRewardService growthRewardService;
    private final GrowthPolicyProperties policy;
    private final Clock growthClock;

    @Transactional(readOnly = true)
    public AttendanceResponse getTodayStatus(Long userId) {
        LocalDate serviceDate = LocalDate.now(growthClock);
        Optional<Attendance> today = attendanceRepository.findByUserIdAndAttendanceDate(userId, serviceDate);
        if (today.isPresent()) {
            return new AttendanceResponse(serviceDate, true, today.get().getStreakCount());
        }

        int activeStreak = attendanceRepository.findTopByUserIdOrderByAttendanceDateDesc(userId)
                .filter(last -> last.getAttendanceDate().equals(serviceDate.minusDays(1)))
                .map(Attendance::getStreakCount)
                .orElse(0);
        return new AttendanceResponse(serviceDate, false, activeStreak);
    }

    @Transactional
    public AttendanceCompletionResponse checkIn(Long userId) {
        LocalDate serviceDate = LocalDate.now(growthClock);
        UserPet pet = growthRewardService.lockPet(userId);

        Optional<Attendance> existing =
                attendanceRepository.findByUserIdAndAttendanceDate(userId, serviceDate);
        if (existing.isPresent()) {
            return completion(existing.get(), false, 0, pet);
        }

        int streak = attendanceRepository.findTopByUserIdOrderByAttendanceDateDesc(userId)
                .filter(last -> last.getAttendanceDate().equals(serviceDate.minusDays(1)))
                .map(last -> last.getStreakCount() + 1)
                .orElse(1);
        Attendance attendance = new Attendance(userId, serviceDate, streak);
        attendanceRepository.save(attendance);
        growthRewardService.rewardLocked(pet, policy.getAttendanceExp());
        return completion(attendance, true, policy.getAttendanceExp(), pet);
    }

    private AttendanceCompletionResponse completion(
            Attendance attendance, boolean newlyAttended, int awardedExp, UserPet pet) {
        return new AttendanceCompletionResponse(
                attendance.getAttendanceDate(),
                true,
                attendance.getStreakCount(),
                newlyAttended,
                awardedExp,
                PetStatusResponse.from(pet, policy));
    }
}
