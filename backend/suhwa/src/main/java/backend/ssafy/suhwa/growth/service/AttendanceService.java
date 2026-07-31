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
import org.springframework.context.annotation.Lazy;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class AttendanceService {

    private final AttendanceRepository attendanceRepository;
    private final GrowthRewardService growthRewardService;
    private final GrowthPolicyProperties policy;
    private final Clock growthClock;
    private final AttendanceService self;

    public AttendanceService(
            AttendanceRepository attendanceRepository,
            GrowthRewardService growthRewardService,
            GrowthPolicyProperties policy,
            Clock growthClock,
            @Lazy AttendanceService self) {
        this.attendanceRepository = attendanceRepository;
        this.growthRewardService = growthRewardService;
        this.policy = policy;
        this.growthClock = growthClock;
        // checkIn()이 실패한(제약 위반) 트랜잭션 그대로 재조회하면 Hibernate 세션이 깨진
        // 상태라 AssertionFailure가 난다(직접 재현해 확인함). 실패 시 롤백이 실제로 끝난 뒤
        // 완전히 새 트랜잭션에서 재조회해야 하는데, this.foo(...)로는 프록시를 안 거쳐 새
        // 트랜잭션이 안 열리므로(GameRoomService.self와 같은 이유) 지연 주입된 자기 자신을
        // 거친다.
        this.self = self;
    }

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
     * 동시 체크인 경쟁(FR 없음, 버그픽스)에서 {@link #attemptCheckIn}이 UNIQUE 제약 위반으로
     * 실패하면, 그 실패한 트랜잭션은 완전히 롤백된 뒤에만 재조회해야 한다 — 같은 트랜잭션
     * 안에서 이어서 조회하면 Hibernate 세션이 깨진 채로 남아 있어 다음 쿼리가
     * {@code AssertionFailure}로 죽는다(직접 재현해 확인함). 그래서 이 메서드 자체는
     * {@code @Transactional}이 아니다 — 실패 시 새 트랜잭션에서 {@link #resolveExistingCheckIn}을
     * 부르기 위해 두 단계를 분리해야 한다.
     */
    public AttendanceCompletionResponse checkIn(Long userId) {
        try {
            return self.attemptCheckIn(userId);
        } catch (DataIntegrityViolationException e) {
            return self.resolveExistingCheckIn(userId);
        }
    }

    @Transactional
    public AttendanceCompletionResponse attemptCheckIn(Long userId) {
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
        // 재확인은 REPEATABLE READ 스냅샷을 볼 수 있어, lockPet()이 순서를 강제해도 "없음"이라는
        // 낡은 답을 믿고 여기까지 내려올 수 있다(동시 체크인 경쟁). 진짜 안전장치는
        // (user_id, attendance_date) UNIQUE 제약이고, 위반 시 이 예외를 그대로 던져 트랜잭션을
        // 롤백시킨다 — 처리는 checkIn()이 새 트랜잭션에서 이어받는다.
        attendanceRepository.save(attendance);
        growthRewardService.rewardLocked(pet, policy.getAttendanceExp());
        return completion(attendance, true, policy.getAttendanceExp(), pet);
    }

    /** attemptCheckIn()이 제약 위반으로 롤백된 뒤, 완전히 새 트랜잭션에서 이긴 쪽 행을 멱등하게 반환한다. */
    @Transactional
    public AttendanceCompletionResponse resolveExistingCheckIn(Long userId) {
        LocalDate serviceDate = LocalDate.now(growthClock);
        UserPet pet = growthRewardService.lockPet(userId);
        Attendance winner = attendanceRepository.findByUserIdAndAttendanceDate(userId, serviceDate)
                .orElseThrow(() -> new IllegalStateException(
                        "UNIQUE 제약 위반 직후인데 해당 유저의 오늘자 출석 행이 없다: userId=" + userId));
        return completion(winner, false, 0, pet);
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
