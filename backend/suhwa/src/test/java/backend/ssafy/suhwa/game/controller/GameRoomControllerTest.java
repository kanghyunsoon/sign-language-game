package backend.ssafy.suhwa.game.controller;

import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.BDDMockito.given;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import backend.ssafy.suhwa.common.exception.BusinessException;
import backend.ssafy.suhwa.common.exception.ErrorCode;
import backend.ssafy.suhwa.game.domain.GameRoom;
import backend.ssafy.suhwa.game.dto.GameResultRequest;
import backend.ssafy.suhwa.game.dto.JoinRoomRequest;
import backend.ssafy.suhwa.game.dto.ReadyRequest;
import backend.ssafy.suhwa.game.service.GameRoomService;
import java.util.List;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import tools.jackson.databind.ObjectMapper;

@WebMvcTest(GameRoomController.class)
@AutoConfigureMockMvc(addFilters = false)
class GameRoomControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @MockitoBean
    private GameRoomService gameRoomService;

    @BeforeEach
    void setAuthenticatedUser() {
        SecurityContextHolder.getContext().setAuthentication(
                new UsernamePasswordAuthenticationToken(1L, null, List.of()));
    }

    @AfterEach
    void clearSecurityContext() {
        SecurityContextHolder.clearContext();
    }

    private GameRoom sampleRoom() {
        return GameRoom.builder().roomCode("ABC123").hostUserId(1L).build();
    }

    @Test
    void createRoom_returns201() throws Exception {
        given(gameRoomService.create(anyLong())).willReturn(sampleRoom());

        mockMvc.perform(post("/game-rooms")).andExpect(status().isCreated());
    }

    @Test
    void joinRoom_returns200() throws Exception {
        given(gameRoomService.join(anyString(), anyLong())).willReturn(sampleRoom());

        mockMvc.perform(post("/game-rooms/join")
                        .contentType("application/json")
                        .content(objectMapper.writeValueAsString(new JoinRoomRequest("ABC123"))))
                .andExpect(status().isOk());
    }

    @Test
    void joinRoom_notFound_returns404() throws Exception {
        given(gameRoomService.join(anyString(), anyLong()))
                .willThrow(new BusinessException(ErrorCode.ROOM_NOT_FOUND));

        mockMvc.perform(post("/game-rooms/join")
                        .contentType("application/json")
                        .content(objectMapper.writeValueAsString(new JoinRoomRequest("NOPE99"))))
                .andExpect(status().isNotFound());
    }

    @Test
    void joinRoom_full_returns409() throws Exception {
        given(gameRoomService.join(anyString(), anyLong()))
                .willThrow(new BusinessException(ErrorCode.ROOM_FULL));

        mockMvc.perform(post("/game-rooms/join")
                        .contentType("application/json")
                        .content(objectMapper.writeValueAsString(new JoinRoomRequest("FULL01"))))
                .andExpect(status().isConflict());
    }

    @Test
    void leaveRoom_returns204() throws Exception {
        mockMvc.perform(post("/game-rooms/1/leave")).andExpect(status().isNoContent());
    }

    @Test
    void leaveRoom_notParticipant_returns403() throws Exception {
        org.mockito.Mockito.doThrow(new BusinessException(ErrorCode.NOT_ROOM_PARTICIPANT))
                .when(gameRoomService).leave(anyLong(), anyLong());

        mockMvc.perform(post("/game-rooms/1/leave")).andExpect(status().isForbidden());
    }

    @Test
    void setReady_returns200() throws Exception {
        given(gameRoomService.setReady(anyLong(), anyLong(), anyBoolean())).willReturn(sampleRoom());

        mockMvc.perform(post("/game-rooms/1/ready")
                        .contentType("application/json")
                        .content(objectMapper.writeValueAsString(new ReadyRequest(true))))
                .andExpect(status().isOk());
    }

    @Test
    void startGame_returns200() throws Exception {
        given(gameRoomService.start(anyLong(), anyLong())).willReturn(sampleRoom());

        mockMvc.perform(post("/game-rooms/1/start")).andExpect(status().isOk());
    }

    @Test
    void startGame_notAllReady_returns409() throws Exception {
        given(gameRoomService.start(anyLong(), anyLong()))
                .willThrow(new BusinessException(ErrorCode.NOT_ALL_READY));

        mockMvc.perform(post("/game-rooms/1/start")).andExpect(status().isConflict());
    }

    @Test
    void reportResult_returns201() throws Exception {
        given(gameRoomService.reportResult(anyLong(), anyLong(), anyInt(), anyInt()))
                .willReturn(new backend.ssafy.suhwa.game.dto.GameResultResponse(1L, 1L, 10, 7));

        mockMvc.perform(post("/game-rooms/1/results")
                        .contentType("application/json")
                        .content(objectMapper.writeValueAsString(new GameResultRequest(10, 7))))
                .andExpect(status().isCreated());
    }

    @Test
    void reportResult_roomNotInProgress_returns409() throws Exception {
        given(gameRoomService.reportResult(anyLong(), anyLong(), anyInt(), anyInt()))
                .willThrow(new BusinessException(ErrorCode.ROOM_NOT_IN_PROGRESS));

        mockMvc.perform(post("/game-rooms/1/results")
                        .contentType("application/json")
                        .content(objectMapper.writeValueAsString(new GameResultRequest(10, 7))))
                .andExpect(status().isConflict());
    }
}
