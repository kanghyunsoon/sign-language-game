package backend.ssafy.suhwa.gameresult.controller;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import backend.ssafy.suhwa.common.security.JwtTokenProvider;
import backend.ssafy.suhwa.gameresult.domain.GameResultType;
import backend.ssafy.suhwa.gameresult.repository.GameResultRepository;
import backend.ssafy.suhwa.user.domain.User;
import backend.ssafy.suhwa.user.repository.UserRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

/**
 * 방 생성이나 실시간 연결, "시작" API 호출 없이 결과 보고 API 하나만으로 완결되는지 검증한다
 * (US8, FR-027/028, SC-007).
 */
@SpringBootTest
@AutoConfigureMockMvc
@Transactional
class SoloResultControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private JwtTokenProvider jwtTokenProvider;

    @Autowired
    private GameResultRepository gameResultRepository;

    private String tokenFor(String label) {
        Long userId = userRepository.save(User.builder()
                        .email(label + "-" + System.nanoTime() + "@test.com").passwordHash("h").nickname(label)
                        .build())
                .getId();
        return "Bearer " + jwtTokenProvider.createAccessToken(userId);
    }

    @Test
    void reportSoloResult_withoutAnyPriorSetup_returns201AndRecordsResult() throws Exception {
        String token = tokenFor("solouser");

        mockMvc.perform(post("/solo-results")
                        .header("Authorization", token)
                        .contentType("application/json")
                        .content("{\"score\":1234}"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.score").value(1234))
                .andExpect(jsonPath("$.resultId").exists());

        assertThat(gameResultRepository.findAll())
                .anySatisfy(r -> {
                    assertThat(r.getScore()).isEqualTo(1234);
                    assertThat(r.getGameType()).isEqualTo(GameResultType.TETRIS_SOLO);
                });
    }

    @Test
    void reportSoloResult_missingScore_returns400() throws Exception {
        String token = tokenFor("solouser2");

        mockMvc.perform(post("/solo-results")
                        .header("Authorization", token)
                        .contentType("application/json")
                        .content("{}"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void reportSoloResult_calledRepeatedly_recordsEachAsSeparateEntry() throws Exception {
        String token = tokenFor("solouser3");

        for (int i = 0; i < 3; i++) {
            mockMvc.perform(post("/solo-results")
                            .header("Authorization", token)
                            .contentType("application/json")
                            .content("{\"score\":" + (100 + i) + "}"))
                    .andExpect(status().isCreated());
        }

        long recorded = gameResultRepository.findAll().stream()
                .filter(r -> r.getGameType() == GameResultType.TETRIS_SOLO)
                .filter(r -> r.getScore() >= 100 && r.getScore() <= 102)
                .count();
        assertThat(recorded).isEqualTo(3);
    }
}
