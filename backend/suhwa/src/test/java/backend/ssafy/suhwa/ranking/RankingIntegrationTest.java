package backend.ssafy.suhwa.ranking;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import backend.ssafy.suhwa.common.security.JwtTokenProvider;
import backend.ssafy.suhwa.user.domain.User;
import backend.ssafy.suhwa.user.repository.UserRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

@SpringBootTest
@AutoConfigureMockMvc
@Transactional
class RankingIntegrationTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private JwtTokenProvider jwtTokenProvider;

    private User createUserWithRecord(int win, int loss) {
        User user = userRepository.save(User.builder()
                .email("rank-" + System.nanoTime() + "@test.com")
                .passwordHash("h")
                .nickname("랭킹테스터")
                .build());
        for (int i = 0; i < win; i++) {
            user.recordWin();
        }
        for (int i = 0; i < loss; i++) {
            user.recordLoss();
        }
        return userRepository.save(user);
    }

    @Test
    void topFiveAndOwnRank_excludeWithdrawnUsers() throws Exception {
        User top1 = createUserWithRecord(20, 0);
        createUserWithRecord(15, 1);
        User me = createUserWithRecord(10, 2);

        User withdrawn = createUserWithRecord(100, 0);
        withdrawn.withdraw();
        userRepository.save(withdrawn);

        String token = "Bearer " + jwtTokenProvider.createAccessToken(me.getId());

        mockMvc.perform(get("/rankings").header("Authorization", token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.top[0].userId").value(top1.getId()))
                .andExpect(jsonPath("$.me.userId").value(me.getId()));
    }
}
