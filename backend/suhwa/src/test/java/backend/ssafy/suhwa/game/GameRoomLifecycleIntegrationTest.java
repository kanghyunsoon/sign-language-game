package backend.ssafy.suhwa.game;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import backend.ssafy.suhwa.common.security.JwtTokenProvider;
import backend.ssafy.suhwa.game.dto.GameResultRequest;
import backend.ssafy.suhwa.game.dto.JoinRoomRequest;
import backend.ssafy.suhwa.game.dto.ReadyRequest;
import backend.ssafy.suhwa.user.domain.User;
import backend.ssafy.suhwa.user.repository.UserRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

@SpringBootTest
@AutoConfigureMockMvc
@Transactional
class GameRoomLifecycleIntegrationTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private JwtTokenProvider jwtTokenProvider;

    @Test
    void fullLifecycle_create_join_ready_start_reportResult_duplicateRejected() throws Exception {
        User host = userRepository.save(User.builder()
                .email("host-" + System.nanoTime() + "@test.com").passwordHash("h").nickname("host").build());
        User guest = userRepository.save(User.builder()
                .email("guest-" + System.nanoTime() + "@test.com").passwordHash("h").nickname("guest").build());
        String hostToken = "Bearer " + jwtTokenProvider.createAccessToken(host.getId());
        String guestToken = "Bearer " + jwtTokenProvider.createAccessToken(guest.getId());

        MvcResult createResult = mockMvc.perform(post("/game-rooms").header("Authorization", hostToken))
                .andExpect(status().isCreated())
                .andReturn();
        JsonNode created = objectMapper.readTree(createResult.getResponse().getContentAsString());
        long roomId = created.get("id").asLong();
        String roomCode = created.get("roomCode").asString();

        mockMvc.perform(post("/game-rooms/join")
                        .header("Authorization", guestToken)
                        .contentType("application/json")
                        .content(objectMapper.writeValueAsString(new JoinRoomRequest(roomCode))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.participantCount").value(2));

        mockMvc.perform(post("/game-rooms/" + roomId + "/ready")
                        .header("Authorization", hostToken)
                        .contentType("application/json")
                        .content(objectMapper.writeValueAsString(new ReadyRequest(true))))
                .andExpect(status().isOk());
        mockMvc.perform(post("/game-rooms/" + roomId + "/ready")
                        .header("Authorization", guestToken)
                        .contentType("application/json")
                        .content(objectMapper.writeValueAsString(new ReadyRequest(true))))
                .andExpect(status().isOk());

        mockMvc.perform(post("/game-rooms/" + roomId + "/start").header("Authorization", hostToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("IN_PROGRESS"));

        mockMvc.perform(post("/game-rooms/" + roomId + "/results")
                        .header("Authorization", hostToken)
                        .contentType("application/json")
                        .content(objectMapper.writeValueAsString(new GameResultRequest(10, 7))))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.winnerUserId").value(host.getId()));

        // 중복 결과 보고는 거부된다 (FR-028)
        mockMvc.perform(post("/game-rooms/" + roomId + "/results")
                        .header("Authorization", hostToken)
                        .contentType("application/json")
                        .content(objectMapper.writeValueAsString(new GameResultRequest(3, 3))))
                .andExpect(status().isConflict());
    }
}
