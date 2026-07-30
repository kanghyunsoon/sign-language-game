package backend.ssafy.suhwa.gameresult.controller;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.BDDMockito.given;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import backend.ssafy.suhwa.gameresult.dto.SoloGameResult;
import backend.ssafy.suhwa.gameresult.dto.StartSoloSessionResponse;
import backend.ssafy.suhwa.gameresult.service.SoloSessionService;
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

@WebMvcTest(SoloSessionController.class)
@AutoConfigureMockMvc(addFilters = false)
class SoloSessionControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @MockitoBean
    private SoloSessionService soloSessionService;

    @BeforeEach
    void authenticate() {
        SecurityContextHolder.getContext().setAuthentication(
                new UsernamePasswordAuthenticationToken(1L, null, List.of()));
    }

    @AfterEach
    void clear() {
        SecurityContextHolder.clearContext();
    }

    @Test
    void startReturnsFrontendCompatibleIdentifiers() throws Exception {
        given(soloSessionService.start(any(), any()))
                .willReturn(new StartSoloSessionResponse(
                        "550e8400-e29b-41d4-a716-446655440000",
                        "1",
                        "NORMAL",
                        List.of("ㄱ"),
                        "KEYBOARD",
                        1_000));

        mockMvc.perform(post("/game/solo/sessions")
                        .contentType("application/json")
                        .content("""
                                {"difficulty":"NORMAL","symbolRange":["ㄱ"],"playMode":"KEYBOARD"}
                                """))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.soloSessionId")
                        .value("550e8400-e29b-41d4-a716-446655440000"))
                .andExpect(jsonPath("$.userId").value("1"));
    }

    @Test
    void completeReturnsAwardedExperience() throws Exception {
        given(soloSessionService.complete(any(), any(), any()))
                .willReturn(new SoloGameResult(
                        "session-1", "1", "KEYBOARD", "NORMAL",
                        100, 2, 3, 90_000, List.of(), 500, 1_000, 15));

        mockMvc.perform(post("/game/solo/sessions/session-1/complete")
                        .contentType("application/json")
                        .content("""
                                {
                                  "finalScore":100,
                                  "maxCombo":2,
                                  "removedSymbolCount":3,
                                  "playDurationMs":90000,
                                  "symbolStatistics":[],
                                  "endedAt":1000
                                }
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.playDurationMs").value(90000))
                .andExpect(jsonPath("$.awardedExp").value(15));
    }
}
