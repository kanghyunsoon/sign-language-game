package backend.ssafy.suhwa.growth.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.BDDMockito.given;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;

import backend.ssafy.suhwa.growth.config.GrowthPolicyProperties;
import backend.ssafy.suhwa.growth.domain.Attendance;
import backend.ssafy.suhwa.growth.domain.UserPet;
import backend.ssafy.suhwa.growth.dto.AttendanceCalendarResponse;
import backend.ssafy.suhwa.growth.dto.AttendanceCompletionResponse;
import backend.ssafy.suhwa.growth.repository.AttendanceRepository;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.YearMonth;
import java.time.ZoneId;
import java.util.List;
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
        attendanceService = new AttendanceService(attendanceRepository, growthRewardService, policy, clock);
        pet = UserPet.builder().userId(1L).build();
        lenient().when(growthRewardService.lockPet(1L)).thenReturn(pet);
    }

    @Test
    void firstAttendanceStartsStreakAndRewardsThreeExperience() {
        given(attendanceRepository.findByUserIdAndAttendanceDate(1L, LocalDate.of(2026, 7, 30)))
                .willReturn(Optional.empty());
        given(attendanceRepository.findTopByUserIdOrderByAttendanceDateDesc(1L)).willReturn(Optional.empty());

        AttendanceCompletionResponse response = attendanceService.checkIn(1L);

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

        AttendanceCompletionResponse response = attendanceService.checkIn(1L);

        assertThat(response.streakCount()).isEqualTo(5);
    }

    @Test
    void missedDayResetsStreak() {
        given(attendanceRepository.findByUserIdAndAttendanceDate(1L, LocalDate.of(2026, 7, 30)))
                .willReturn(Optional.empty());
        given(attendanceRepository.findTopByUserIdOrderByAttendanceDateDesc(1L))
                .willReturn(Optional.of(new Attendance(1L, LocalDate.of(2026, 7, 28), 9)));

        assertThat(attendanceService.checkIn(1L).streakCount()).isEqualTo(1);
    }

    @Test
    void duplicateAttendanceReturnsExistingResultWithoutReward() {
        Attendance existing = new Attendance(1L, LocalDate.of(2026, 7, 30), 4);
        given(attendanceRepository.findByUserIdAndAttendanceDate(1L, LocalDate.of(2026, 7, 30)))
                .willReturn(Optional.of(existing));

        AttendanceCompletionResponse response = attendanceService.checkIn(1L);

        assertThat(response.newlyAttended()).isFalse();
        assertThat(response.awardedExp()).isZero();
        verify(growthRewardService, never()).rewardLocked(pet, 3);
    }

    @Test
    void calendarReturnsAttendedDatesSortedForRequestedMonth() {
        YearMonth august = YearMonth.of(2026, 8);
        given(attendanceRepository.findAllByUserIdAndAttendanceDateBetween(
                1L, august.atDay(1), august.atEndOfMonth()))
                .willReturn(List.of(
                        new Attendance(1L, LocalDate.of(2026, 8, 15), 1),
                        new Attendance(1L, LocalDate.of(2026, 8, 1), 1)));

        AttendanceCalendarResponse response = attendanceService.getCalendar(1L, august);

        assertThat(response.yearMonth()).isEqualTo(august);
        assertThat(response.attendedDates())
                .containsExactly(LocalDate.of(2026, 8, 1), LocalDate.of(2026, 8, 15));
    }

    @Test
    void calendarDefaultsToCurrentServiceMonthWhenYearMonthOmitted() {
        given(attendanceRepository.findAllByUserIdAndAttendanceDateBetween(
                1L, LocalDate.of(2026, 7, 1), LocalDate.of(2026, 7, 31)))
                .willReturn(List.of());

        AttendanceCalendarResponse response = attendanceService.getCalendar(1L, null);

        assertThat(response.yearMonth()).isEqualTo(YearMonth.of(2026, 7));
        assertThat(response.attendedDates()).isEmpty();
    }
}
