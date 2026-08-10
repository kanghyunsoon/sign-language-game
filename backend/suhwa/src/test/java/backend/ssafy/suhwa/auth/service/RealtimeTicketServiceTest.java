package backend.ssafy.suhwa.auth.service;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

class RealtimeTicketServiceTest {

    @Test
    void issueAndConsume_returnsUserIdOnceThenRejectsReuse() {
        RealtimeTicketService service = new RealtimeTicketService(30);

        String ticket = service.issue(42L);

        assertThat(service.consume(ticket)).contains(42L);
        assertThat(service.consume(ticket)).isEmpty();
    }

    @Test
    void consume_unknownTicket_returnsEmpty() {
        RealtimeTicketService service = new RealtimeTicketService(30);

        assertThat(service.consume("never-issued")).isEmpty();
    }

    @Test
    void consume_afterExpiry_returnsEmpty() throws InterruptedException {
        RealtimeTicketService service = new RealtimeTicketService(0);

        String ticket = service.issue(1L);
        Thread.sleep(50);

        assertThat(service.consume(ticket)).isEmpty();
    }
}
