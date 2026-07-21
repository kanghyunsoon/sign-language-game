package backend.ssafy.suhwa;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.data.jpa.repository.config.EnableJpaAuditing;

@EnableJpaAuditing
@SpringBootApplication
public class SuhwaApplication {

    public static void main(String[] args) {
        SpringApplication.run(SuhwaApplication.class, args);
    }

}
