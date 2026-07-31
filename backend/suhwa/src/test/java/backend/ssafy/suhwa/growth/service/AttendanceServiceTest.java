package backend.ssafy.suhwa.growth.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.BDDMockito.given;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;

import backend.ssafy.suhwa.growth.config.GrowthPolicyProperties;
import backend.ssafy.suhwa.growth.domain.Attendance;
import backend.ssafy.suhwa.growth.domain.UserPet;
import backend.ssafy.suhwa.growth.dto.AttendanceCompletionResponse;
import backend.ssafy.suhwa.growth.repository.AttendanceRepository;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

@ExtendWith(MockitoExtension.class)
class AttendanceServiceTest {

    private static final ZoneId SEOUL = ZoneId.of("Asia/Seoul");

    @Mock
    private AttendanceRepository attendanceRepository;

    @Mock
    private GrowthRewardService growthRewardService;

    private AttendanceService attendanceService;
    private UserPet pet;

    @BeforeEach
    void setUp() {
        Clock clock = Clock.fixed(Instant.parse("2026-07-29T15:00:00Z"), SEOUL);
        GrowthPolicyProperties policy = new GrowthPolicyProperties();
        // self는 checkIn()의 재시도 경로(AttendanceCheckInConcurrencyTest가 검증)에서만 쓰인다.
        // 여기서는 attemptCheckIn()을 직접 호출하므로 필요 없다.
        attendanceService = new AttendanceService(attendanceRepository, growthRewardService, policy, clock, null);
        pet = UserPet.builder().userId(1L).build();
        given(growthRewardService.lockPet(1L)).willReturn(pet);
    }

    @Test
    void firstAttendanceStartsStreakAndRewardsThreeExperience() {
        given(attendanceRepository.findByUserIdAndAttendanceDate(1L, LocalDate.of(2026, 7, 30)))
                .willReturn(Optional.empty());
        given(attendanceRepository.findTopByUserIdOrderByAttendanceDateDesc(1L)).willReturn(Optional.empty());

        AttendanceCompletionResponse response = attendanceService.attemptCheckIn(1L);

        assertThat(response.newlyAttended()).isTrue();
        assertThat(response.streakCount()).isEqualTo(1);
        assertThat(response.awardedExp()).isEqualTo(3);
        verify(growthRewardService).rewardLocked(pet, 3);
    }

    @Test
    void yesterdayAttendanceIncrementsStreak() {
        given(attendanceRepository.findByUserIdAndAttendanceDate(1L, LocalDate.of(2026, 7, 30)))
                .willReturn(Optional.empty());
        given(attendanceRepository.findTopByUserIdOrderByAttendanceDateDesc(1L))
                .willReturn(Optional.of(new Attendance(1L, LocalDate.of(2026, 7, 29), 4)));

        AttendanceCompletionResponse response = attendanceService.attemptCheckIn(1L);

        assertThat(response.streakCount()).isEqualTo(5);
    }

    @Test
    void missedDayResetsStreak() {
        given(attendanceRepository.findByUserIdAndAttendanceDate(1L, LocalDate.of(2026, 7, 30)))
                .willReturn(Optional.empty());
        given(attendanceRepository.findTopByUserIdOrderByAttendanceDateDesc(1L))
                .willReturn(Optional.of(new Attendance(1L, LocalDate.of(2026, 7, 28), 9)));

        assertThat(attendanceService.attemptCheckIn(1L).streakCount()).isEqualTo(1);
    }

    @Test
    void duplicateAttendanceReturnsExistingResultWithoutReward() {
        Attendance existing = new Attendance(1L, LocalDate.of(2026, 7, 30), 4);
        given(attendanceRepository.findByUserIdAndAttendanceDate(1L, LocalDate.of(2026, 7, 30)))
                .willReturn(Optional.of(existing));

        AttendanceCompletionResponse response = attendanceService.attemptCheckIn(1L);

        assertThat(response.newlyAttended()).isFalse();
        assertThat(response.awardedExp()).isZero();
        verify(growthRewardService, never()).rewardLocked(pet, 3);
    }
}
