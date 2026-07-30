package backend.ssafy.suhwa.growth.config;

import java.time.Clock;
import java.time.ZoneId;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class GrowthTimeConfig {

    public static final ZoneId SERVICE_ZONE = ZoneId.of("Asia/Seoul");

    @Bean
    public ZoneId growthServiceZone() {
        return SERVICE_ZONE;
    }

    @Bean
    public Clock growthClock(ZoneId growthServiceZone) {
        return Clock.system(growthServiceZone);
    }
}
