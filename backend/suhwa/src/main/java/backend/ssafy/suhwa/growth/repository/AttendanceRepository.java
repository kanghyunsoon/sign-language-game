package backend.ssafy.suhwa.growth.repository;

import backend.ssafy.suhwa.growth.domain.Attendance;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface AttendanceRepository extends JpaRepository<Attendance, Long> {

    Optional<Attendance> findByUserIdAndAttendanceDate(Long userId, LocalDate attendanceDate);

    Optional<Attendance> findTopByUserIdOrderByAttendanceDateDesc(Long userId);

    long countByUserIdAndAttendanceDate(Long userId, LocalDate attendanceDate);

    List<Attendance> findAllByUserIdAndAttendanceDateBetween(
            Long userId, LocalDate startDate, LocalDate endDate);
}
