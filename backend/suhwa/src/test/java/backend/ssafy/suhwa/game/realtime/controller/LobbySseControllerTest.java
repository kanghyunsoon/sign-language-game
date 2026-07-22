package backend.ssafy.suhwa.game.realtime.controller;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.asyncDispatch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.request;

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

    @Test
    void subscribe_receivesSnapshotEvent_andRemovedOnCompletion() throws Exception {
        MvcResult result = mockMvc.perform(get("/game-rooms/subscribe"))
                .andExpect(request().asyncStarted())
                .andReturn();

        assertThat(result.getResponse().getContentAsString()).contains("snapshot");
        assertThat(subscriberRegistry.all()).hasSize(1);

        SseEmitter emitter = subscriberRegistry.all().iterator().next();
        emitter.complete();
        mockMvc.perform(asyncDispatch(result));

        assertThat(subscriberRegistry.all()).isEmpty();
    }
}
