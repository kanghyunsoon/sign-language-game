package backend.ssafy.suhwa.learning;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import backend.ssafy.suhwa.common.security.JwtTokenProvider;
import backend.ssafy.suhwa.learning.domain.Sign;
import backend.ssafy.suhwa.learning.domain.SignCategory;
import backend.ssafy.suhwa.learning.dto.WrongAnswerRequest;
import backend.ssafy.suhwa.learning.repository.SignRepository;
import backend.ssafy.suhwa.user.domain.User;
import backend.ssafy.suhwa.user.repository.UserRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.ObjectMapper;

@SpringBootTest
@AutoConfigureMockMvc
@Transactional
class LearningIntegrationTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private SignRepository signRepository;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private JwtTokenProvider jwtTokenProvider;

    @Test
    void reportWrongAnswer_thenAppearsInRecentWrongAnswers() throws Exception {
        Sign sign = signRepository.save(Sign.builder()
                .category(SignCategory.CONSONANT)
                .label("통합테스트용-" + System.nanoTime())
                .build());
        User user = userRepository.save(User.builder()
                .email("learning-test-" + System.nanoTime() + "@test.com")
                .passwordHash("hash")
                .nickname("테스터")
                .build());
        String token = jwtTokenProvider.createAccessToken(user.getId());

        mockMvc.perform(post("/wrong-answers")
                        .header("Authorization", "Bearer " + token)
                        .contentType("application/json")
                        .content(objectMapper.writeValueAsString(new WrongAnswerRequest(sign.getId()))))
                .andExpect(status().isCreated());

        mockMvc.perform(get("/wrong-answers")
                        .header("Authorization", "Bearer " + token)
                        .param("category", "CONSONANT"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].sign.id").value(sign.getId()));
    }

    @Test
    void listSigns_missingCategoryParam_returns400NotUnauthenticated() throws Exception {
        User user = userRepository.save(User.builder()
                .email("learning-test-" + System.nanoTime() + "@test.com")
                .passwordHash("hash")
                .nickname("테스터")
                .build());
        String token = jwtTokenProvider.createAccessToken(user.getId());

        mockMvc.perform(get("/signs").header("Authorization", "Bearer " + token))
                .andExpect(status().isBadRequest());
    }

    @Test
    void listSigns_invalidCategoryEnum_returns400NotUnauthenticated() throws Exception {
        User user = userRepository.save(User.builder()
                .email("learning-test-" + System.nanoTime() + "@test.com")
                .passwordHash("hash")
                .nickname("테스터")
                .build());
        String token = jwtTokenProvider.createAccessToken(user.getId());

        mockMvc.perform(get("/signs")
                        .header("Authorization", "Bearer " + token)
                        .param("category", "INVALID"))
                .andExpect(status().isBadRequest());
    }
}
