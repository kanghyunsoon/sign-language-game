package backend.ssafy.suhwa.common.config;

import static org.assertj.core.api.Assertions.assertThat;

import com.zaxxer.hikari.HikariDataSource;
import jakarta.persistence.EntityManagerFactory;
import java.util.Map;
import javax.sql.DataSource;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.core.env.Environment;

/**
 * 운영 안정성 설정이 프로퍼티 파일에만 적혀 있는 게 아니라 실제 빈에 바인딩됐는지 확인한다
 * (spec 004 FR-021/022/023). yaml 키를 오타내거나 잘못된 위치에 넣어도 기동은 성공하므로,
 * 값이 조용히 무시되는 것을 잡으려면 런타임에서 읽어봐야 한다.
 */
@SpringBootTest
class OperationalPropertiesTest {

    @Autowired
    private Environment environment;

    @Autowired
    private DataSource dataSource;

    @Autowired
    private EntityManagerFactory entityManagerFactory;

    @Test
    void openInViewIsDisabled() {
        assertThat(environment.getProperty("spring.jpa.open-in-view", Boolean.class))
                .as("응답을 다 쓸 때까지 영속성 컨텍스트와 커넥션을 붙잡지 않아야 한다(FR-021)")
                .isFalse();
    }

    @Test
    void transactionAndQueryTimeoutsAreBound() {
        assertThat(environment.getProperty("spring.transaction.default-timeout"))
                .as("전역 트랜잭션 상한(FR-022)")
                .isEqualTo("3s");

        Map<String, Object> jpaProperties = entityManagerFactory.getProperties();
        assertThat(jpaProperties.get("jakarta.persistence.query.timeout"))
                .as("쿼리 타임아웃이 EntityManagerFactory까지 전달돼야 한다(FR-022)")
                .hasToString("3000");
    }

    @Test
    void connectionPoolIsBound() throws Exception {
        HikariDataSource hikari = dataSource.unwrap(HikariDataSource.class);

        assertThat(hikari.getConnectionTimeout())
                .as("커넥션 고갈 시 무한정 대기하지 않아야 한다(FR-023)")
                .isEqualTo(3000L);
        assertThat(hikari.getValidationTimeout()).isEqualTo(3000L);
        // 풀 크기는 부하 테스트로 확정할 값이라 환경변수로 열려 있다(DB_POOL_MAX_SIZE).
        // 여기서는 값이 바인딩됐다는 것만 확인한다.
        assertThat(hikari.getMaximumPoolSize()).isPositive();
    }

    @Test
    void jdbcBatchingIsBound() {
        Map<String, Object> jpaProperties = entityManagerFactory.getProperties();

        assertThat(jpaProperties.get("hibernate.jdbc.batch_size"))
                .as("다건 INSERT/UPDATE를 묶어 왕복을 줄인다(FR-023)")
                .hasToString("30");
        // 정렬 옵션이 없으면 배치가 잘게 쪼개져 batch_size가 사실상 무력해진다.
        assertThat(jpaProperties.get("hibernate.order_inserts")).hasToString("true");
        assertThat(jpaProperties.get("hibernate.order_updates")).hasToString("true");
    }
}
