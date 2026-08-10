package backend.ssafy.suhwa.game;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.asyncDispatch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.request;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import backend.ssafy.suhwa.auth.service.RealtimeTicketService;
import backend.ssafy.suhwa.common.security.JwtTokenProvider;
import backend.ssafy.suhwa.game.realtime.LobbySubscriberRegistry;
import backend.ssafy.suhwa.user.domain.User;
import backend.ssafy.suhwa.user.repository.UserRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;
import tools.jackson.databind.ObjectMapper;

/**
 * FR-010, research.md #9-1: 방 생성/입장이 로비 SSE 구독자에게 즉시 브로드캐스트되는지,
 * 입장 응답에 실시간 인원/정원/상태가 포함되는지 검증한다.
 */
@SpringBootTest
@AutoConfigureMockMvc
class GameRoomLobbyBroadcastIntegrationTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private JwtTokenProvider jwtTokenProvider;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private LobbySubscriberRegistry subscriberRegistry;

    @Autowired
    private RealtimeTicketService realtimeTicketService;

    private Long createUser(String label) {
        return userRepository.save(User.builder()
                        .email(label + "-" + System.nanoTime() + "@test.com")
                        .passwordHash("h")
                        .nickname(label)
                        .build())
                .getId();
    }

    @Test
    void createRoom_broadcastsUpdateToLobbySubscribers() throws Exception {
        String ticket = realtimeTicketService.issue(1L);
        MvcResult subscribeResult = mockMvc.perform(get("/game-rooms/subscribe").param("ticket", ticket))
                .andExpect(request().asyncStarted())
                .andReturn();

        Long hostId = createUser("lobbyhost");
        String token = jwtTokenProvider.createAccessToken(hostId);

        mockMvc.perform(post("/game-rooms")
                        .header("Authorization", "Bearer " + token)
                        .contentType("application/json")
                        .content("{\"roomTitle\":\"방 제목\",\"symbolRange\":\"ALL\",\"gameType\":\"SIGN_DUEL\"}"))
                .andExpect(status().isCreated());

        String content = subscribeResult.getResponse().getContentAsString();
        assertThat(content).contains("snapshot");
        assertThat(content).contains("update");

        // 다른 테스트에 구독이 누수되지 않도록 정리한다(레지스트리는 전체 컨텍스트에서 공유되는 싱글턴).
        for (SseEmitter emitter : subscriberRegistry.all()) {
            emitter.complete();
        }
        mockMvc.perform(asyncDispatch(subscribeResult));
    }

    @Test
    void joinRoom_returnsLiveParticipantCountCapacityAndStatus() throws Exception {
        Long hostId = createUser("joinhost");
        Long guestId = createUser("joinguest");
        String hostToken = jwtTokenProvider.createAccessToken(hostId);
        String guestToken = jwtTokenProvider.createAccessToken(guestId);

        MvcResult createResult = mockMvc.perform(post("/game-rooms")
                        .header("Authorization", "Bearer " + hostToken)
                        .contentType("application/json")
                        .content("{\"roomTitle\":\"방 제목\",\"symbolRange\":\"ALL\",\"gameType\":\"SIGN_DUEL\"}"))
                .andExpect(status().isCreated())
                .andReturn();
        String roomCode = objectMapper.readTree(createResult.getResponse().getContentAsString())
                .get("roomCode").asText();

        mockMvc.perform(post("/game-rooms/join")
                        .header("Authorization", "Bearer " + guestToken)
                        .contentType("application/json")
                        .content("{\"roomCode\":\"" + roomCode + "\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.participantCount").value(2))
                .andExpect(jsonPath("$.capacity").value(2))
                .andExpect(jsonPath("$.status").value("WAITING"));
    }

    @Test
    void startGame_broadcastsUpdateRemovingRoomFromWaitingList() throws Exception {
        String ticket = realtimeTicketService.issue(1L);
        MvcResult subscribeResult = mockMvc.perform(get("/game-rooms/subscribe").param("ticket", ticket))
                .andExpect(request().asyncStarted())
                .andReturn();

        Long hostId = createUser("starthost");
        Long guestId = createUser("startguest");
        String hostToken = jwtTokenProvider.createAccessToken(hostId);
        String guestToken = jwtTokenProvider.createAccessToken(guestId);

        MvcResult createResult = mockMvc.perform(post("/game-rooms")
                        .header("Authorization", "Bearer " + hostToken)
                        .contentType("application/json")
                        .content("{\"roomTitle\":\"방 제목\",\"symbolRange\":\"ALL\",\"gameType\":\"SIGN_DUEL\"}"))
                .andExpect(status().isCreated())
                .andReturn();
        var createJson = objectMapper.readTree(createResult.getResponse().getContentAsString());
        String roomCode = createJson.get("roomCode").asText();
        long roomId = createJson.get("id").asLong();

        mockMvc.perform(post("/game-rooms/join")
                        .header("Authorization", "Bearer " + guestToken)
                        .contentType("application/json")
                        .content("{\"roomCode\":\"" + roomCode + "\"}"))
                .andExpect(status().isOk());

        mockMvc.perform(post("/game-rooms/" + roomId + "/ready")
                        .header("Authorization", "Bearer " + hostToken)
                        .contentType("application/json")
                        .content("{\"isReady\":true}"))
                .andExpect(status().isOk());
        mockMvc.perform(post("/game-rooms/" + roomId + "/ready")
                        .header("Authorization", "Bearer " + guestToken)
                        .contentType("application/json")
                        .content("{\"isReady\":true}"))
                .andExpect(status().isOk());

        mockMvc.perform(post("/game-rooms/" + roomId + "/start").header("Authorization", "Bearer " + hostToken))
                .andExpect(status().isOk());

        String content = subscribeResult.getResponse().getContentAsString();
        // create/join 브로드캐스트에서 각각 한 번씩 등장한 뒤, start로 WAITING 목록에서
        // 빠지므로 그 이후 브로드캐스트에는 더 이상 나타나지 않아야 한다(총 2회).
        int occurrences = content.split(roomCode, -1).length - 1;
        assertThat(occurrences).isEqualTo(2);

        for (SseEmitter emitter : subscriberRegistry.all()) {
            emitter.complete();
        }
        mockMvc.perform(asyncDispatch(subscribeResult));
    }
}
