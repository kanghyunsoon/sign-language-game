package backend.ssafy.suhwa.ranking.repository;

import static org.assertj.core.api.Assertions.assertThat;

import backend.ssafy.suhwa.user.domain.User;
import backend.ssafy.suhwa.user.repository.UserRepository;
import java.time.LocalDateTime;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.data.jpa.test.autoconfigure.DataJpaTest;
import org.springframework.boot.jpa.test.autoconfigure.TestEntityManager;
import org.springframework.test.context.TestPropertySource;

@DataJpaTest
@TestPropertySource(properties = "spring.jpa.hibernate.ddl-auto=create-drop")
class RankingQueryTest {

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private TestEntityManager entityManager;

    private User createUser(String email, int win, int loss) {
        User user = userRepository.save(User.builder()
                .email(email).passwordHash("h").nickname(email).build());
        setRecord(user, win, loss);
        // 벌크 JPQL UPDATE + clear()로 인해 user는 detach되어 이전 값(0,0)을 들고 있으므로
        // DB에서 다시 조회한 최신 상태를 반환한다.
        return userRepository.findById(user.getId()).orElseThrow();
    }

    private void setRecord(User user, int win, int loss) {
        entityManager.getEntityManager()
                .createQuery("UPDATE User u SET u.winCount = :w, u.lossCount = :l WHERE u.id = :id")
                .setParameter("w", win)
                .setParameter("l", loss)
                .setParameter("id", user.getId())
                .executeUpdate();
        entityManager.flush();
        entityManager.clear();
    }

    @Test
    void findTop5_ordersByWinDescThenLossAsc() {
        createUser("a@test.com", 10, 2);
        createUser("b@test.com", 10, 1);
        createUser("c@test.com", 5, 0);
        createUser("d@test.com", 20, 5);
        createUser("e@test.com", 1, 1);
        createUser("f@test.com", 0, 0);

        List<User> top5 = userRepository.findTop5ByDeletedAtIsNullOrderByWinCountDescLossCountAsc();

        assertThat(top5).hasSize(5);
        assertThat(top5.get(0).getEmail()).isEqualTo("d@test.com");
        assertThat(top5.get(1).getEmail()).isEqualTo("b@test.com"); // win 동일, loss 적은 쪽 우선
        assertThat(top5.get(2).getEmail()).isEqualTo("a@test.com");
    }

    @Test
    void findTop5_excludesWithdrawnUsers() {
        User withdrawn = createUser("withdrawn@test.com", 100, 0);
        entityManager.getEntityManager()
                .createQuery("UPDATE User u SET u.deletedAt = :d WHERE u.id = :id")
                .setParameter("d", LocalDateTime.now())
                .setParameter("id", withdrawn.getId())
                .executeUpdate();
        entityManager.flush();
        entityManager.clear();
        createUser("active@test.com", 1, 0);

        List<User> top5 = userRepository.findTop5ByDeletedAtIsNullOrderByWinCountDescLossCountAsc();

        assertThat(top5).extracting(User::getEmail).doesNotContain("withdrawn@test.com");
    }

    @Test
    void countHigherRanked_computesRankCorrectly() {
        createUser("a-" + System.nanoTime() + "@test.com", 10, 0);
        createUser("b-" + System.nanoTime() + "@test.com", 5, 0);
        User me = createUser("c-" + System.nanoTime() + "@test.com", 5, 0);

        long rank = userRepository.countHigherRanked(me.getWinCount(), me.getLossCount());

        // a(10승)만 me보다 높음. b는 me와 승/패가 동일해 더 높은 순위로 카운트되지 않음.
        // rank = 1(a) + 1 = 2
        assertThat(rank).isEqualTo(2);
    }
}
