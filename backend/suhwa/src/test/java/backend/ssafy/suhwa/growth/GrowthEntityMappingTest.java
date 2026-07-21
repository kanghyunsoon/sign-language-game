package backend.ssafy.suhwa.growth;

import static org.assertj.core.api.Assertions.assertThat;

import backend.ssafy.suhwa.growth.domain.Attendance;
import backend.ssafy.suhwa.growth.domain.UserPet;
import backend.ssafy.suhwa.growth.repository.AttendanceRepository;
import backend.ssafy.suhwa.growth.repository.UserPetRepository;
import java.time.LocalDate;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.data.jpa.test.autoconfigure.DataJpaTest;
import org.springframework.test.context.TestPropertySource;

/** 펫/출석은 엔티티만 존재하고 서비스·컨트롤러가 없으므로(FR-034/FR-035), JPA 매핑 오류 없이 컨텍스트가 로드되고 기본 CRUD가 되는지만 확인한다. */
@DataJpaTest
@TestPropertySource(properties = "spring.jpa.hibernate.ddl-auto=create-drop")
class GrowthEntityMappingTest {

    @Autowired
    private UserPetRepository userPetRepository;

    @Autowired
    private AttendanceRepository attendanceRepository;

    @Test
    void userPet_savesAndLoadsWithDefaults() {
        UserPet saved = userPetRepository.save(UserPet.builder().userId(1L).name("몽이").build());

        UserPet found = userPetRepository.findById(saved.getId()).orElseThrow();

        assertThat(found.getUserId()).isEqualTo(1L);
        assertThat(found.getName()).isEqualTo("몽이");
        assertThat(found.getLevel()).isEqualTo(1);
        assertThat(found.getExp()).isZero();
    }

    @Test
    void attendance_savesAndLoadsWithDefaults() {
        Attendance saved = attendanceRepository.save(
                Attendance.builder().userId(1L).attendanceDate(LocalDate.now()).build());

        Attendance found = attendanceRepository.findById(saved.getId()).orElseThrow();

        assertThat(found.getUserId()).isEqualTo(1L);
        assertThat(found.getStreakCount()).isEqualTo(1);
        assertThat(found.getCreatedAt()).isNotNull();
    }
}
