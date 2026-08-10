package backend.ssafy.suhwa.learning.repository;

import static org.assertj.core.api.Assertions.assertThat;

import backend.ssafy.suhwa.learning.domain.Sign;
import backend.ssafy.suhwa.learning.domain.SignCategory;
import backend.ssafy.suhwa.learning.domain.WrongAnswerLog;
import backend.ssafy.suhwa.learning.dto.WrongAnswerCount;
import backend.ssafy.suhwa.learning.dto.WrongAnswerResponse;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.data.jpa.test.autoconfigure.DataJpaTest;
import org.springframework.data.domain.PageRequest;
import org.springframework.test.context.TestPropertySource;

@DataJpaTest
@TestPropertySource(properties = "spring.jpa.hibernate.ddl-auto=create-drop")
class WrongAnswerLogRepositoryTest {

    @Autowired
    private SignRepository signRepository;

    @Autowired
    private WrongAnswerLogRepository wrongAnswerLogRepository;

    @Test
    void findRecentByUserIdAndCategory_returnsOnlyMatchingCategoryOrderedByRecent() {
        Sign consonant = signRepository.save(
                Sign.builder().category(SignCategory.CONSONANT).label("ㄱ").build());
        Sign vowel = signRepository.save(
                Sign.builder().category(SignCategory.VOWEL).label("ㅏ").build());

        wrongAnswerLogRepository.save(WrongAnswerLog.builder().userId(1L).signId(consonant.getId()).build());
        wrongAnswerLogRepository.save(WrongAnswerLog.builder().userId(1L).signId(vowel.getId()).build());
        wrongAnswerLogRepository.save(WrongAnswerLog.builder().userId(1L).signId(consonant.getId()).build());
        wrongAnswerLogRepository.save(WrongAnswerLog.builder().userId(2L).signId(consonant.getId()).build());

        List<WrongAnswerResponse> result = wrongAnswerLogRepository.findRecentByUserIdAndCategory(
                1L, SignCategory.CONSONANT, PageRequest.of(0, 5));

        // 응답 DTO 프로젝션이라 userId는 결과에 없다 — 다른 사용자(2L)의 로그가 빠졌다는 사실은
        // 건수로 검증하고, 카테고리 필터와 Sign 조인 결과는 sign 필드로 검증한다(FR-009).
        assertThat(result).hasSize(2);
        assertThat(result).allMatch(r -> r.sign().id().equals(consonant.getId()));
        assertThat(result).allMatch(r -> r.sign().category() == SignCategory.CONSONANT);
        assertThat(result).allSatisfy(r -> {
            assertThat(r.id()).isNotNull();
            assertThat(r.wrongAt()).isNotNull();
        });
    }

    @Test
    void findRecentByUserIdAndCategory_limitsToPageSize() {
        Sign sign = signRepository.save(Sign.builder().category(SignCategory.NUMBER).label("1").build());
        for (int i = 0; i < 7; i++) {
            wrongAnswerLogRepository.save(WrongAnswerLog.builder().userId(3L).signId(sign.getId()).build());
        }

        List<WrongAnswerResponse> result = wrongAnswerLogRepository.findRecentByUserIdAndCategory(
                3L, SignCategory.NUMBER, PageRequest.of(0, 5));

        assertThat(result).hasSize(5);
    }

    @Test
    void save_preservesOptionalTestSessionId() {
        WrongAnswerLog withSession = wrongAnswerLogRepository.saveAndFlush(
                WrongAnswerLog.builder()
                        .userId(4L)
                        .signId(10L)
                        .testSessionId(20L)
                        .build());
        WrongAnswerLog legacy = wrongAnswerLogRepository.saveAndFlush(
                WrongAnswerLog.builder()
                        .userId(4L)
                        .signId(11L)
                        .build());

        assertThat(withSession.getTestSessionId()).isEqualTo(20L);
        assertThat(legacy.getTestSessionId()).isNull();
    }

    @Test
    void countByTestSessions_groupsOnlyUsersConsonantsAndVowels() {
        Sign consonant = signRepository.save(
                Sign.builder().category(SignCategory.CONSONANT).label("consonant").build());
        Sign vowel = signRepository.save(
                Sign.builder().category(SignCategory.VOWEL).label("vowel").build());
        Sign number = signRepository.save(
                Sign.builder().category(SignCategory.NUMBER).label("number").build());

        wrongAnswerLogRepository.save(
                WrongAnswerLog.builder().userId(1L).signId(consonant.getId()).testSessionId(10L).build());
        wrongAnswerLogRepository.save(
                WrongAnswerLog.builder().userId(1L).signId(consonant.getId()).testSessionId(11L).build());
        wrongAnswerLogRepository.save(
                WrongAnswerLog.builder().userId(1L).signId(vowel.getId()).testSessionId(10L).build());
        wrongAnswerLogRepository.save(
                WrongAnswerLog.builder().userId(1L).signId(consonant.getId()).testSessionId(9L).build());
        wrongAnswerLogRepository.save(
                WrongAnswerLog.builder().userId(1L).signId(number.getId()).testSessionId(10L).build());
        wrongAnswerLogRepository.save(
                WrongAnswerLog.builder().userId(2L).signId(consonant.getId()).testSessionId(10L).build());

        List<WrongAnswerCount> result =
                wrongAnswerLogRepository.countByUserIdAndTestSessionIdsAndCategories(
                        1L,
                        List.of(10L, 11L),
                        List.of(SignCategory.CONSONANT, SignCategory.VOWEL));

        assertThat(result).containsExactly(
                new WrongAnswerCount(consonant.getId(), 2L),
                new WrongAnswerCount(vowel.getId(), 1L));
    }
}
