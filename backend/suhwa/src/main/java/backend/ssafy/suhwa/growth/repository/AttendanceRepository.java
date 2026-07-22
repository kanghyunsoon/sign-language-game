package backend.ssafy.suhwa.growth.repository;

import backend.ssafy.suhwa.growth.domain.Attendance;
import org.springframework.data.jpa.repository.JpaRepository;

public interface AttendanceRepository extends JpaRepository<Attendance, Long> {
}
