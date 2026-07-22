package backend.ssafy.suhwa.learning.repository;

import static org.assertj.core.api.Assertions.assertThat;

import backend.ssafy.suhwa.learning.domain.Sign;
import backend.ssafy.suhwa.learning.domain.SignCategory;
import backend.ssafy.suhwa.learning.domain.WrongAnswerLog;
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

        List<WrongAnswerLog> result = wrongAnswerLogRepository.findRecentByUserIdAndCategory(
                1L, SignCategory.CONSONANT, PageRequest.of(0, 5));

        assertThat(result).hasSize(2);
        assertThat(result).allMatch(log -> log.getUserId().equals(1L));
        assertThat(result).allMatch(log -> log.getSignId().equals(consonant.getId()));
    }

    @Test
    void findRecentByUserIdAndCategory_limitsToPageSize() {
        Sign sign = signRepository.save(Sign.builder().category(SignCategory.NUMBER).label("1").build());
        for (int i = 0; i < 7; i++) {
            wrongAnswerLogRepository.save(WrongAnswerLog.builder().userId(3L).signId(sign.getId()).build());
        }

        List<WrongAnswerLog> result = wrongAnswerLogRepository.findRecentByUserIdAndCategory(
                3L, SignCategory.NUMBER, PageRequest.of(0, 5));

        assertThat(result).hasSize(5);
    }
}
