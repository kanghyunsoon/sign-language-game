package backend.ssafy.suhwa.learning;

import static org.assertj.core.api.Assertions.assertThat;

import backend.ssafy.suhwa.common.config.CacheConfig;
import backend.ssafy.suhwa.learning.domain.Sign;
import backend.ssafy.suhwa.learning.domain.SignCategory;
import backend.ssafy.suhwa.learning.domain.WrongAnswerLog;
import backend.ssafy.suhwa.learning.dto.WrongAnswerResponse;
import backend.ssafy.suhwa.learning.repository.SignRepository;
import backend.ssafy.suhwa.learning.repository.WrongAnswerLogRepository;
import backend.ssafy.suhwa.learning.service.SignService;
import backend.ssafy.suhwa.learning.service.WrongAnswerService;
import backend.ssafy.suhwa.user.domain.User;
import backend.ssafy.suhwa.user.repository.UserRepository;
import jakarta.persistence.EntityManager;
import jakarta.persistence.EntityManagerFactory;
import java.util.List;
import org.hibernate.SessionFactory;
import org.hibernate.stat.Statistics;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.cache.CacheManager;
import org.springframework.transaction.annotation.Transactional;

/**
 * 조회 경로 최적화 검증(spec 004 US4). 쿼리 수는 Hibernate 통계의 PreparedStatement 생성
 * 횟수로 센다 — 통계가 꺼져 있으면 0이 나와 단언이 깨지므로 설정 누락도 함께 잡힌다.
 */
@SpringBootTest(properties = "spring.jpa.properties.hibernate.generate_statistics=true")
@Transactional
class LearningQueryOptimizationTest {

    @Autowired
    private WrongAnswerService wrongAnswerService;

    @Autowired
    private SignService signService;

    @Autowired
    private SignRepository signRepository;

    @Autowired
    private WrongAnswerLogRepository wrongAnswerLogRepository;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private EntityManager entityManager;

    @Autowired
    private EntityManagerFactory entityManagerFactory;

    @Autowired
    private CacheManager cacheManager;

    private Statistics statistics;

    @BeforeEach
    void setUp() {
        statistics = entityManagerFactory.unwrap(SessionFactory.class).getStatistics();
    }

    @Test
    void getRecentWrongAnswers_usesSingleProjectionQuery() {
        // wrong_answer_logs.user_id에 FK가 걸려 있어(fk_wronglog_user) 실제 회원이 필요하다.
        Long userId = userRepository.save(User.builder()
                        .email("query-opt-" + System.nanoTime() + "@test.com")
                        .passwordHash("hash")
                        .nickname("쿼리테스터")
                        .build())
                .getId();
        Sign consonant = signRepository.save(
                Sign.builder().category(SignCategory.CONSONANT).label("ㄱ-" + System.nanoTime()).build());
        Sign vowel = signRepository.save(
                Sign.builder().category(SignCategory.VOWEL).label("ㅏ-" + System.nanoTime()).build());
        wrongAnswerLogRepository.save(WrongAnswerLog.builder().userId(userId).signId(consonant.getId()).build());
        wrongAnswerLogRepository.save(WrongAnswerLog.builder().userId(userId).signId(vowel.getId()).build());

        // 준비 INSERT가 조회 시점의 auto-flush로 통계에 섞이지 않도록 먼저 내보내고 센다.
        entityManager.flush();
        entityManager.clear();
        statistics.clear();

        List<WrongAnswerResponse> result = wrongAnswerService.getRecentWrongAnswers(userId, SignCategory.CONSONANT);

        assertThat(result).hasSize(1);
        assertThat(result.get(0).sign().id()).isEqualTo(consonant.getId());
        assertThat(statistics.getPrepareStatementCount())
                .as("로그 조회 + Sign 재조회 2쿼리가 아니라 DTO 프로젝션 단일 쿼리여야 한다(FR-009)")
                .isEqualTo(1);
    }

    @Test
    void getActiveSignsByCategory_secondCallHitsCacheWithoutQuery() {
        signRepository.save(Sign.builder().category(SignCategory.NUMBER).label("1-" + System.nanoTime()).build());
        entityManager.flush();
        entityManager.clear();
        // 다른 테스트가 이미 채워둔 캐시에 기대지 않도록 비우고 시작한다.
        cacheManager.getCache(CacheConfig.SIGNS_BY_CATEGORY).clear();
        statistics.clear();

        List<Sign> first = signService.getActiveSignsByCategory(SignCategory.NUMBER);
        long afterFirst = statistics.getPrepareStatementCount();

        List<Sign> second = signService.getActiveSignsByCategory(SignCategory.NUMBER);
        long afterSecond = statistics.getPrepareStatementCount();

        assertThat(afterFirst).as("첫 조회는 DB를 한 번 친다").isEqualTo(1);
        assertThat(afterSecond).as("2회차는 캐시 히트라 DB를 치지 않아야 한다(FR-011)").isEqualTo(afterFirst);
        assertThat(second).isSameAs(first);
    }
}
