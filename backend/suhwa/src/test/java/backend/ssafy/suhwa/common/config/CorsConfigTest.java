package backend.ssafy.suhwa.common.config;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;

/**
 * CORS_ALLOWED_ORIGINS로 지정한 Origin만 Access-Control-Allow-Origin 응답 헤더를
 * 받는지 검증한다(FR-007).
 */
@SpringBootTest
@AutoConfigureMockMvc
@TestPropertySource(properties = "cors.allowed-origins=http://allowed.example.com")
class CorsConfigTest {

    @Autowired
    private MockMvc mockMvc;

    @Test
    void allowedOrigin_receivesAccessControlAllowOriginHeader() throws Exception {
        mockMvc.perform(get("/actuator/health").header("Origin", "http://allowed.example.com"))
                .andExpect(header().string("Access-Control-Allow-Origin", "http://allowed.example.com"));
    }

    @Test
    void disallowedOrigin_doesNotReceiveAccessControlAllowOriginHeader() throws Exception {
        mockMvc.perform(get("/actuator/health").header("Origin", "http://notallowed.example.com"))
                .andExpect(header().doesNotExist("Access-Control-Allow-Origin"));
    }
}
