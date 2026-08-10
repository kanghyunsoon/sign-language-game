package backend.ssafy.suhwa.growth.repository;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import backend.ssafy.suhwa.growth.domain.Attendance;
import java.time.LocalDate;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.data.jpa.test.autoconfigure.DataJpaTest;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.test.context.TestPropertySource;

@DataJpaTest
@TestPropertySource(properties = "spring.jpa.hibernate.ddl-auto=create-drop")
class AttendanceRepositoryTest {

    @Autowired
    private AttendanceRepository repository;

    @Test
    void findsLatestAttendanceAndExactDate() {
        repository.save(new Attendance(1L, LocalDate.of(2026, 7, 28), 2));
        repository.save(new Attendance(1L, LocalDate.of(2026, 7, 29), 3));

        assertThat(repository.findByUserIdAndAttendanceDate(1L, LocalDate.of(2026, 7, 29)))
                .get().extracting(Attendance::getStreakCount).isEqualTo(3);
        assertThat(repository.findTopByUserIdOrderByAttendanceDateDesc(1L))
                .get().extracting(Attendance::getAttendanceDate).isEqualTo(LocalDate.of(2026, 7, 29));
    }

    @Test
    void rejectsDuplicateUserAndDate() {
        LocalDate date = LocalDate.of(2026, 7, 30);
        repository.saveAndFlush(new Attendance(1L, date, 1));

        assertThatThrownBy(() -> repository.saveAndFlush(new Attendance(1L, date, 1)))
                .isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    void findsAttendancesWithinDateRangeOnly() {
        repository.save(new Attendance(1L, LocalDate.of(2026, 7, 31), 1));
        repository.save(new Attendance(1L, LocalDate.of(2026, 8, 1), 2));
        repository.save(new Attendance(1L, LocalDate.of(2026, 8, 15), 3));
        repository.save(new Attendance(1L, LocalDate.of(2026, 9, 1), 4));
        repository.save(new Attendance(2L, LocalDate.of(2026, 8, 10), 1));

        List<Attendance> august = repository.findAllByUserIdAndAttendanceDateBetween(
                1L, LocalDate.of(2026, 8, 1), LocalDate.of(2026, 8, 31));

        assertThat(august).extracting(Attendance::getAttendanceDate)
                .containsExactlyInAnyOrder(LocalDate.of(2026, 8, 1), LocalDate.of(2026, 8, 15));
    }
}
