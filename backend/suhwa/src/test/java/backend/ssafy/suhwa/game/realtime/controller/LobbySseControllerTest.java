package backend.ssafy.suhwa.game.realtime.controller;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.asyncDispatch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.request;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import backend.ssafy.suhwa.auth.service.RealtimeTicketService;
import backend.ssafy.suhwa.game.realtime.LobbySubscriberRegistry;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

@SpringBootTest
@AutoConfigureMockMvc
class LobbySseControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private LobbySubscriberRegistry subscriberRegistry;

    @Autowired
    private RealtimeTicketService realtimeTicketService;

    @Test
    void subscribe_receivesSnapshotEvent_andRemovedOnCompletion() throws Exception {
        String ticket = realtimeTicketService.issue(1L);

        MvcResult result = mockMvc.perform(get("/game-rooms/subscribe").param("ticket", ticket))
                .andExpect(request().asyncStarted())
                .andReturn();

        assertThat(result.getResponse().getContentAsString()).contains("snapshot");
        assertThat(subscriberRegistry.all()).hasSize(1);

        SseEmitter emitter = subscriberRegistry.all().iterator().next();
        emitter.complete();
        mockMvc.perform(asyncDispatch(result));

        assertThat(subscriberRegistry.all()).isEmpty();
    }

    @Test
    void subscribe_withoutTicket_rejectedWith401() throws Exception {
        mockMvc.perform(get("/game-rooms/subscribe"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("UNAUTHENTICATED"));

        assertThat(subscriberRegistry.all()).isEmpty();
    }

    @Test
    void subscribe_withAlreadyConsumedTicket_rejectedWith401() throws Exception {
        String ticket = realtimeTicketService.issue(1L);
        assertThat(realtimeTicketService.consume(ticket)).isPresent();

        mockMvc.perform(get("/game-rooms/subscribe").param("ticket", ticket))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("UNAUTHENTICATED"));

        assertThat(subscriberRegistry.all()).isEmpty();
    }
}
