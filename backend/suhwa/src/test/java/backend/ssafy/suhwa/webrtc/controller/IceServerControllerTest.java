package backend.ssafy.suhwa.webrtc.controller;

import static org.hamcrest.Matchers.hasSize;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import backend.ssafy.suhwa.webrtc.config.WebRtcProperties;
import java.util.List;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;

@WebMvcTest(IceServerController.class)
@Import(WebRtcProperties.class)
@AutoConfigureMockMvc(addFilters = false)
@TestPropertySource(properties = {
        "webrtc.stun-urls=stun:stun.example.com:19302",
        "webrtc.turn-url=turn:turn.example.com:3478",
        "webrtc.turn-username=turnuser",
        "webrtc.turn-credential=turnpass"
})
class IceServerControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @BeforeEach
    void setAuthenticatedUser() {
        SecurityContextHolder.getContext().setAuthentication(
                new UsernamePasswordAuthenticationToken(1L, null, List.of()));
    }

    @AfterEach
    void clearSecurityContext() {
        SecurityContextHolder.clearContext();
    }

    @Test
    void getIceServers_returnsConfiguredStunAndTurnEntries() throws Exception {
        mockMvc.perform(get("/webrtc/ice-servers"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.iceServers", hasSize(2)))
                .andExpect(jsonPath("$.iceServers[0].urls[0]").value("stun:stun.example.com:19302"))
                .andExpect(jsonPath("$.iceServers[1].urls[0]").value("turn:turn.example.com:3478"))
                .andExpect(jsonPath("$.iceServers[1].username").value("turnuser"))
                .andExpect(jsonPath("$.iceServers[1].credential").value("turnpass"));
    }
}
