package backend.ssafy.suhwa.learning.repository;

import static org.assertj.core.api.Assertions.assertThat;

import backend.ssafy.suhwa.learning.domain.Sign;
import backend.ssafy.suhwa.learning.domain.SignCategory;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.data.jpa.test.autoconfigure.DataJpaTest;
import org.springframework.test.context.TestPropertySource;

@DataJpaTest
@TestPropertySource(properties = "spring.jpa.hibernate.ddl-auto=create-drop")
class SignRepositoryTest {

    @Autowired
    private SignRepository signRepository;

    @Test
    void findActiveTetrisSigns_returnsConsonantsAndVowelsOrderedById() {
        Sign consonant = signRepository.save(
                Sign.builder().category(SignCategory.CONSONANT).label("consonant").build());
        signRepository.save(
                Sign.builder().category(SignCategory.NUMBER).label("number").build());
        Sign vowel = signRepository.saveAndFlush(
                Sign.builder().category(SignCategory.VOWEL).label("vowel").build());

        List<Sign> result = signRepository.findByCategoryInAndActiveTrueOrderByIdAsc(
                List.of(SignCategory.CONSONANT, SignCategory.VOWEL));

        assertThat(result).containsExactly(consonant, vowel);
    }
}
