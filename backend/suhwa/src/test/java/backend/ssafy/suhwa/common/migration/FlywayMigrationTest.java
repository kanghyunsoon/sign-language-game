package backend.ssafy.suhwa.common.migration;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.flywaydb.core.Flyway;
import org.flywaydb.core.api.output.MigrateResult;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.EnabledIfDockerAvailable;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.mysql.MySQLContainer;

/**
 * `db/migration`의 마이그레이션이 실제 MySQL에서 의도대로 적용되는지 검증한다(FR-018).
 *
 * <p>일반 테스트는 H2(ddl-auto)나 이미 만들어진 개발 DB 스키마를 쓰기 때문에 마이그레이션이
 * 실행되지 않는다(build.gradle에서 {@code spring.flyway.enabled=false}). 그래서 마이그레이션의
 * 정합성은 이 테스트가 전용 컨테이너에서 따로 확인한다. Spring 컨텍스트를 띄우지 않고 Flyway API를
 * 직접 호출하므로 위 설정의 영향을 받지 않는다.
 *
 * <p>두 경로를 모두 검증한다.
 *
 * <ul>
 *   <li><b>신규 DB</b> — V1(baseline DDL)부터 순서대로 전부 적용된다.
 *   <li><b>기존 운영 DB</b> — 스키마는 이미 있고 이력 테이블만 없는 상태. {@code baseline-on-migrate}로
 *       V1은 실행하지 않고 적용된 것으로 표시만 한 뒤 V2부터 적용한다. 실제 배포 시 일어날 경로다.
 * </ul>
 *
 * <p>Docker가 없는 환경에서는 통째로 skip된다({@code @EnabledIfDockerAvailable}).
 */
@Testcontainers
@EnabledIfDockerAvailable
class FlywayMigrationTest {

    private static final String MIGRATION_LOCATION = "classpath:db/migration";
    private static final String BASELINE_RESOURCE = "/db/migration/V1__baseline.sql";

    @Container
    private static final MySQLContainer MYSQL = new MySQLContainer("mysql:8.0");

    @Test
    void freshDatabase_appliesEveryMigrationInOrder() throws Exception {
        String schema = resetDatabase();

        MigrateResult result = flyway(schema).migrate();

        assertThat(result.success).isTrue();
        assertThat(result.migrationsExecuted)
                .as("신규 DB에서는 V1부터 전부 실행돼야 한다")
                .isGreaterThanOrEqualTo(5);
        assertThat(appliedVersions(schema))
                .as("버전이 빠짐없이 성공으로 기록돼야 한다")
                .containsEntry("1", true)
                .containsEntry("2", true)
                .containsEntry("3", true)
                .containsEntry("4", true)
                .containsEntry("5", true);
        assertGameRoomIndexReplaced(schema);
        assertTestSessionSchemaCreated(schema);
        assertGrowthSchemaMigrated(schema);
        assertActivityRewardSchemaMigrated(schema);
    }

    @Test
    void existingDatabaseWithoutHistory_baselinesV1AndAppliesTheRest() throws Exception {
        String schema = resetDatabase();
        // 이력 테이블 없이 스키마만 있는 기존 운영 DB 상태를 재현한다.
        applyBaselineDdlManually(schema);

        MigrateResult result = flyway(schema).migrate();

        assertThat(result.success).isTrue();
        assertThat(appliedVersions(schema))
                .as("V1은 실행하지 않고 baseline으로만 기록되며, V2는 실제로 적용돼야 한다")
                .containsEntry("1", true)
                .containsEntry("2", true)
                .containsEntry("3", true)
                .containsEntry("4", true)
                .containsEntry("5", true);
        assertThat(baselineRowExists(schema))
                .as("baseline-on-migrate가 동작했다면 BASELINE 타입 행이 있어야 한다")
                .isTrue();
        assertGameRoomIndexReplaced(schema);
        assertTestSessionSchemaCreated(schema);
        assertGrowthSchemaMigrated(schema);
        assertActivityRewardSchemaMigrated(schema);
    }

    @Test
    void existingCompletedTestSessionsAreBackfilledWithoutRetroactiveReward() throws Exception {
        String schema = resetDatabase();
        flyway(schema, "3").migrate();
        try (Connection connection = connect(schema);
                Statement statement = connection.createStatement()) {
            statement.executeUpdate(
                    "INSERT INTO users (email, password_hash, nickname) "
                            + "VALUES ('legacy@test.com', 'hash', 'legacy')");
            statement.executeUpdate(
                    "INSERT INTO test_sessions (user_id, completed_at) "
                            + "VALUES (1, CURRENT_TIMESTAMP)");
        }

        flyway(schema).migrate();

        assertThat(count(schema,
                "SELECT COUNT(*) FROM test_sessions "
                        + "WHERE completed_at IS NOT NULL "
                        + "AND correct_count = 0 AND total_count = 1"))
                .as("legacy completion stays completed but is not made reward-eligible")
                .isEqualTo(1);
    }

    private void assertActivityRewardSchemaMigrated(String schema) throws SQLException {
        assertThat(count(schema,
                "SELECT COUNT(*) FROM information_schema.TABLES "
                        + "WHERE TABLE_SCHEMA = '" + schema + "' "
                        + "AND TABLE_NAME IN ('practice_sessions', 'solo_sessions', "
                        + "'solo_session_symbols', 'solo_symbol_statistics')"))
                .as("V5 creates activity idempotency tables")
                .isEqualTo(4);
        assertThat(count(schema,
                "SELECT COUNT(*) FROM information_schema.COLUMNS "
                        + "WHERE TABLE_SCHEMA = '" + schema + "' "
                        + "AND TABLE_NAME = 'test_sessions' "
                        + "AND COLUMN_NAME IN ('correct_count', 'total_count')"))
                .as("V5 stores the authoritative test completion result")
                .isEqualTo(2);
        assertThat(count(schema,
                "SELECT COUNT(*) FROM information_schema.COLUMNS "
                        + "WHERE TABLE_SCHEMA = '" + schema + "' "
                        + "AND TABLE_NAME = 'game_results' "
                        + "AND COLUMN_NAME IN ('solo_session_id', 'play_duration_ms')"))
                .as("V5 links solo results and completion time")
                .isEqualTo(2);
    }

    private void assertGrowthSchemaMigrated(String schema) throws SQLException {
        assertThat(count(schema,
                "SELECT COUNT(*) FROM information_schema.COLUMNS "
                        + "WHERE TABLE_SCHEMA = '" + schema + "' "
                        + "AND TABLE_NAME = 'user_pets' AND COLUMN_NAME = 'name'"))
                .as("V4 removes the pet name")
                .isZero();
        assertThat(count(schema,
                "SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS "
                        + "WHERE CONSTRAINT_SCHEMA = '" + schema + "' "
                        + "AND TABLE_NAME = 'user_pets' AND CONSTRAINT_TYPE = 'CHECK'"))
                .as("V4 constrains pet level and experience")
                .isGreaterThanOrEqualTo(2);
    }

    private void assertTestSessionSchemaCreated(String schema) throws SQLException {
        assertThat(count(schema,
                "SELECT COUNT(*) FROM information_schema.TABLES "
                        + "WHERE TABLE_SCHEMA = '" + schema + "' AND TABLE_NAME = 'test_sessions'"))
                .as("V3 creates the parent test_sessions table")
                .isEqualTo(1);
        assertThat(count(schema,
                "SELECT COUNT(*) FROM information_schema.COLUMNS "
                        + "WHERE TABLE_SCHEMA = '" + schema + "' "
                        + "AND TABLE_NAME = 'wrong_answer_logs' "
                        + "AND COLUMN_NAME = 'test_session_id' AND IS_NULLABLE = 'YES'"))
                .as("V3 preserves legacy wrong-answer rows with a nullable test_session_id")
                .isEqualTo(1);
        assertThat(count(schema,
                "SELECT COUNT(*) FROM information_schema.KEY_COLUMN_USAGE "
                        + "WHERE TABLE_SCHEMA = '" + schema + "' "
                        + "AND TABLE_NAME = 'wrong_answer_logs' "
                        + "AND COLUMN_NAME = 'test_session_id' "
                        + "AND REFERENCED_TABLE_NAME = 'test_sessions' "
                        + "AND REFERENCED_COLUMN_NAME = 'id'"))
                .as("V3 links wrong answers to their parent test session")
                .isEqualTo(1);
    }

    /** V2가 노리는 최종 상태: 복합 인덱스가 있고, 중복이던 단일 인덱스는 사라져 있어야 한다(FR-017). */
    private void assertGameRoomIndexReplaced(String schema) throws SQLException {
        Map<String, List<String>> indexes = gameRoomIndexes(schema);

        assertThat(indexes)
                .as("V2가 추가하는 복합 인덱스")
                .containsEntry("idx_room_status_updated_at", List.of("status", "updated_at"));
        assertThat(indexes)
                .as("복합 인덱스의 최좌측 접두사와 겹쳐 V2가 제거하는 단일 인덱스")
                .doesNotContainKey("idx_room_status");
    }

    private Flyway flyway(String schema) {
        return Flyway.configure()
                .dataSource(jdbcUrl(schema), MYSQL.getUsername(), MYSQL.getPassword())
                .locations(MIGRATION_LOCATION)
                // application.yaml과 같은 설정으로 맞춘다 — 운영과 다른 조건으로 검증하면 의미가 없다.
                .baselineOnMigrate(true)
                .baselineVersion("1")
                .load();
    }

    private Flyway flyway(String schema, String targetVersion) {
        return Flyway.configure()
                .dataSource(jdbcUrl(schema), MYSQL.getUsername(), MYSQL.getPassword())
                .locations(MIGRATION_LOCATION)
                .baselineOnMigrate(true)
                .baselineVersion("1")
                .target(targetVersion)
                .load();
    }

    /**
     * 컨테이너 기본 스키마의 테이블을 전부 지워 "빈 DB" 상태로 되돌린다. 컨테이너 사용자에게
     * {@code CREATE DATABASE} 권한이 없어 테스트마다 새 스키마를 만들 수 없으므로, 같은 스키마를
     * 초기화해 쓴다. 각 테스트가 스스로 초기화하므로 실행 순서에 의존하지 않는다.
     */
    private String resetDatabase() throws SQLException {
        String schema = MYSQL.getDatabaseName();
        List<String> tables = new ArrayList<>();
        try (Connection connection = connect(schema);
                Statement statement = connection.createStatement()) {
            try (ResultSet resultSet = statement.executeQuery(
                    "SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = '" + schema + "'")) {
                while (resultSet.next()) {
                    tables.add(resultSet.getString(1));
                }
            }
            statement.execute("SET FOREIGN_KEY_CHECKS = 0");
            for (String table : tables) {
                statement.execute("DROP TABLE IF EXISTS `" + table + "`");
            }
            statement.execute("SET FOREIGN_KEY_CHECKS = 1");
        }
        return schema;
    }

    /** Flyway를 거치지 않고 V1의 DDL만 직접 실행해 "이력 없는 기존 스키마"를 만든다. */
    private void applyBaselineDdlManually(String schema) throws Exception {
        String script;
        try (InputStream in = FlywayMigrationTest.class.getResourceAsStream(BASELINE_RESOURCE)) {
            script = new String(in.readAllBytes(), StandardCharsets.UTF_8);
        }
        try (Connection connection = connect(schema);
                Statement statement = connection.createStatement()) {
            for (String rawStatement : script.split(";")) {
                String sql = stripComments(rawStatement);
                if (!sql.isBlank()) {
                    statement.execute(sql);
                }
            }
        }
    }

    private String stripComments(String rawStatement) {
        StringBuilder sql = new StringBuilder();
        for (String line : rawStatement.split("\\R")) {
            if (!line.stripLeading().startsWith("--")) {
                sql.append(line).append('\n');
            }
        }
        return sql.toString().trim();
    }

    /** version → success. */
    private Map<String, Boolean> appliedVersions(String schema) throws SQLException {
        Map<String, Boolean> applied = new LinkedHashMap<>();
        try (Connection connection = connect(schema);
                Statement statement = connection.createStatement();
                ResultSet resultSet = statement.executeQuery(
                        "SELECT version, success FROM flyway_schema_history WHERE version IS NOT NULL")) {
            while (resultSet.next()) {
                applied.put(resultSet.getString("version"), resultSet.getBoolean("success"));
            }
        }
        return applied;
    }

    private boolean baselineRowExists(String schema) throws SQLException {
        try (Connection connection = connect(schema);
                Statement statement = connection.createStatement();
                ResultSet resultSet = statement.executeQuery(
                        "SELECT COUNT(*) FROM flyway_schema_history WHERE type = 'BASELINE'")) {
            resultSet.next();
            return resultSet.getInt(1) > 0;
        }
    }

    private int count(String schema, String sql) throws SQLException {
        try (Connection connection = connect(schema);
                Statement statement = connection.createStatement();
                ResultSet resultSet = statement.executeQuery(sql)) {
            resultSet.next();
            return resultSet.getInt(1);
        }
    }

    /** 인덱스 이름 → 구성 컬럼(순서대로). PRIMARY와 UNIQUE 제약은 제외한다. */
    private Map<String, List<String>> gameRoomIndexes(String schema) throws SQLException {
        String sql = "SELECT INDEX_NAME, COLUMN_NAME FROM information_schema.STATISTICS "
                + "WHERE TABLE_SCHEMA = '" + schema + "' AND TABLE_NAME = 'game_rooms' "
                + "ORDER BY INDEX_NAME, SEQ_IN_INDEX";
        Map<String, List<String>> indexes = new LinkedHashMap<>();
        try (Connection connection = connect(schema);
                Statement statement = connection.createStatement();
                ResultSet resultSet = statement.executeQuery(sql)) {
            while (resultSet.next()) {
                indexes.computeIfAbsent(resultSet.getString("INDEX_NAME"), name -> new ArrayList<>())
                        .add(resultSet.getString("COLUMN_NAME"));
            }
        }
        return indexes;
    }

    private Connection connect(String schema) throws SQLException {
        return DriverManager.getConnection(jdbcUrl(schema), MYSQL.getUsername(), MYSQL.getPassword());
    }

    private String jdbcUrl(String schema) {
        return MYSQL.getJdbcUrl().replaceFirst("/" + MYSQL.getDatabaseName() + "(\\?|$)", "/" + schema + "$1");
    }

    /** 실행 순서와 무관하게 각 테스트가 스스로 초기화하지만, 남은 상태가 다음 실행에 새지 않도록 정리한다. */
    @AfterEach
    void cleanUp() throws SQLException {
        resetDatabase();
    }
}
