package backend.ssafy.suhwa.growth.service;

import backend.ssafy.suhwa.growth.config.GrowthPolicyProperties;
import backend.ssafy.suhwa.growth.domain.Attendance;
import backend.ssafy.suhwa.growth.domain.UserPet;
import backend.ssafy.suhwa.growth.dto.AttendanceCalendarResponse;
import backend.ssafy.suhwa.growth.dto.AttendanceCompletionResponse;
import backend.ssafy.suhwa.growth.dto.AttendanceResponse;
import backend.ssafy.suhwa.growth.dto.PetStatusResponse;
import backend.ssafy.suhwa.growth.repository.AttendanceRepository;
import java.time.Clock;
import java.time.LocalDate;
import java.time.YearMonth;
import java.util.List;
import java.util.Optional;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
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

    /**
     * READ COMMITTED로 실행한다. 기본 격리수준(MySQL REPEATABLE READ)이면 lockPet()이
     * 순서를 강제해도, 아래 재확인이 이 트랜잭션이 시작된 시점의 스냅샷을 볼 수 있어 다른
     * 트랜잭션이 이미 커밋한 출석 행을 "없음"으로 잘못 판단할 수 있다(동시 체크인 경쟁으로
     * 직접 재현함 — UNIQUE 제약 위반까지 흘러갔고, 그 이후 같은 트랜잭션에서 재조회를
     * 시도하면 Hibernate 세션이 깨진 채라 AssertionFailure로 죽었다). READ COMMITTED는
     * 매 SELECT가 그 순간의 최신 커밋값을 보므로, lockPet() 대기가 끝난 뒤의 재확인은
     * 항상 정확하다 — 예외를 잡아 새 트랜잭션에서 재조회하는 복구 로직 자체가 필요 없다.
     */
    @Transactional(isolation = Isolation.READ_COMMITTED)
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

    @Transactional(readOnly = true)
    public AttendanceCalendarResponse getCalendar(Long userId, YearMonth yearMonth) {
        YearMonth targetMonth = yearMonth != null ? yearMonth : YearMonth.now(growthClock);
        List<LocalDate> attendedDates = attendanceRepository
                .findAllByUserIdAndAttendanceDateBetween(
                        userId, targetMonth.atDay(1), targetMonth.atEndOfMonth())
                .stream()
                .map(Attendance::getAttendanceDate)
                .sorted()
                .toList();
        return new AttendanceCalendarResponse(targetMonth, attendedDates);
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
