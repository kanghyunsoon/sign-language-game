package backend.ssafy.suhwa.ranking.controller;

import static org.mockito.BDDMockito.given;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import backend.ssafy.suhwa.ranking.dto.RankingEntry;
import backend.ssafy.suhwa.ranking.dto.RankingResponse;
import backend.ssafy.suhwa.ranking.service.RankingService;
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

@WebMvcTest(RankingController.class)
@AutoConfigureMockMvc(addFilters = false)
class RankingControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @MockitoBean
    private RankingService rankingService;

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
    void getRankings_returns200() throws Exception {
        given(rankingService.getRankings(1L)).willReturn(
                new RankingResponse(List.of(), new RankingEntry(1, 1L, "me", 3, 1)));

        mockMvc.perform(get("/rankings")).andExpect(status().isOk());
    }
}
