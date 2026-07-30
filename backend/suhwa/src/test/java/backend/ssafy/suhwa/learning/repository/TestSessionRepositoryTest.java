package backend.ssafy.suhwa.learning.repository;

import static org.assertj.core.api.Assertions.assertThat;

import backend.ssafy.suhwa.learning.domain.TestSession;
import java.time.LocalDateTime;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.data.jpa.test.autoconfigure.DataJpaTest;
import org.springframework.data.domain.PageRequest;
import org.springframework.test.context.TestPropertySource;

@DataJpaTest
@TestPropertySource(properties = "spring.jpa.hibernate.ddl-auto=create-drop")
class TestSessionRepositoryTest {

    @Autowired
    private TestSessionRepository testSessionRepository;

    @Test
    void saveAndFindByIdAndUserId_tracksTestLifecycle() {
        TestSession saved = testSessionRepository.saveAndFlush(
                TestSession.builder().userId(1L).build());

        assertThat(saved.getId()).isNotNull();
        assertThat(saved.getStartedAt()).isNotNull();
        assertThat(saved.getCompletedAt()).isNull();
        assertThat(testSessionRepository.findByIdAndUserId(saved.getId(), 1L)).contains(saved);
        assertThat(testSessionRepository.findByIdAndUserId(saved.getId(), 2L)).isEmpty();

        LocalDateTime completedAt = LocalDateTime.now();
        saved.complete(completedAt, 4, 5);
        testSessionRepository.flush();

        assertThat(saved.getCompletedAt()).isEqualTo(completedAt);
    }

    @Test
    void findRecentCompletedSessions_returnsLatestFiveForUser() {
        LocalDateTime baseTime = LocalDateTime.of(2026, 7, 1, 12, 0);
        TestSession oldest = null;
        for (int i = 0; i < 6; i++) {
            TestSession session = TestSession.builder().userId(1L).build();
            session.complete(baseTime.plusDays(i), 4, 5);
            testSessionRepository.save(session);
            if (i == 0) {
                oldest = session;
            }
        }

        testSessionRepository.save(TestSession.builder().userId(1L).build());
        TestSession otherUsersSession = TestSession.builder().userId(2L).build();
        otherUsersSession.complete(baseTime.plusDays(10), 4, 5);
        testSessionRepository.saveAndFlush(otherUsersSession);

        List<TestSession> result =
                testSessionRepository.findByUserIdAndCompletedAtIsNotNullOrderByCompletedAtDesc(
                        1L, PageRequest.of(0, 5));

        assertThat(result).hasSize(5);
        assertThat(result).extracting(TestSession::getCompletedAt)
                .isSortedAccordingTo((left, right) -> right.compareTo(left));
        assertThat(result).doesNotContain(oldest, otherUsersSession);
        assertThat(result).allMatch(TestSession::isCompleted);
    }
}
