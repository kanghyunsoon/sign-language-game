package backend.ssafy.suhwa.game.repository;

import static org.assertj.core.api.Assertions.assertThat;

import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.sql.Timestamp;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Random;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.mysql.MySQLContainer;

/**
 * {@code game_rooms(status, updated_at)} 복합 인덱스(V2 마이그레이션, FR-017)가 실제로 언제부터
 * 이득인지 실제 MySQL에서 측정한다. 정리 스케줄러의 조회
 * ({@code WHERE status = ? AND updated_at < ?})를 세 가지 인덱스 상태에서 비교한다.
 *
 * <ul>
 *   <li>{@code NO_INDEX} — PK/UNIQUE만. "그냥 조회"의 기준선</li>
 *   <li>{@code STATUS_ONLY} — {@code idx_room_status(status)}. V2 이전의 운영 상태</li>
 *   <li>{@code COMPOSITE} — {@code idx_room_status_updated_at(status, updated_at)}. V2가 넣는 것</li>
 * </ul>
 *
 * <p>측정 결과는 데이터 건수뿐 아니라 <b>조건에 걸리는 행의 비율(선택도)</b>에 크게 좌우되므로 두
 * 축을 모두 훑는다. ① 정상 운영 상황(정리 대상이 전체의 약 0.5%)에서 건수를 늘려가며, ② 100만 건
 * 시점에서 선택도를 바꿔가며 측정한다.
 *
 * <p>기본 {@code ./gradlew test}에서는 제외된다({@code @Tag("benchmark")}). 실행:
 * {@code ./gradlew benchmark}. Docker가 필요하다.
 */
@Tag("benchmark")
@Testcontainers
class GameRoomCleanupIndexBenchmarkTest {

    /** 검사점마다 이 크기까지 데이터를 늘려가며 측정한다(테이블을 재생성하지 않고 누적 삽입). */
    private static final int[] CHECKPOINTS = {1_000, 10_000, 100_000, 1_000_000};

    /** CLOSED 비율. 나머지는 WAITING 30% / IN_PROGRESS 20%. */
    private static final double CLOSED_RATIO = 0.5;

    /**
     * 모든 행의 updated_at은 BASE ~ BASE+WINDOW 사이에 균등·무작위로 흩뿌린다. 따라서
     * {@code updated_at < BASE + w분} 조건에 걸리는 비율은 {@code CLOSED_RATIO * w / WINDOW}로
     * 계산되고, 임계값 w만 바꿔 선택도를 조절할 수 있다. 무작위 배치라 조건에 걸리는 행이 PK 순서상
     * 한쪽에 몰리지 않는다(몰려 있으면 인덱스 레인지 스캔이 비현실적으로 유리해진다).
     */
    private static final int WINDOW_MINUTES = 100_000;

    private static final LocalDateTime BASE = LocalDateTime.of(2020, 1, 1, 0, 0);

    /** 정상 운영 가정: 한 번의 정리 주기에 걸리는 방은 전체의 0.5% 수준. */
    private static final double STEADY_STATE_RATIO = 0.005;

    /** 100만 건 시점에서 훑어볼 선택도(전체 대비 조건 일치 비율). */
    private static final double[] SELECTIVITIES = {0.001, 0.005, 0.01, 0.05, 0.20, 0.40};

    private static final int WARMUP_RUNS = 2;
    private static final int MEASURED_RUNS = 7;
    private static final int INSERT_CHUNK = 2_000;

    /**
     * 버퍼 풀을 넉넉히 잡아 100만 건(≈150MB)이 메모리에 들어오게 한다 — 디스크 I/O 편차가 아니라
     * 인덱스 자체의 효과를 보기 위해서다. 기본값(128MB)이면 최대 검사점에서 I/O 노이즈가 섞인다.
     */
    @Container
    private static final MySQLContainer MYSQL = new MySQLContainer("mysql:8.0")
            .withCommand("--innodb-buffer-pool-size=512M");

    private enum Variant {
        NO_INDEX("인덱스 없음", null),
        STATUS_ONLY("idx(status)", "CREATE INDEX idx_room_status ON game_rooms (status)"),
        COMPOSITE("idx(status, updated_at)",
                "CREATE INDEX idx_room_status_updated_at ON game_rooms (status, updated_at)");

        private final String label;
        private final String createSql;

        Variant(String label, String createSql) {
            this.label = label;
            this.createSql = createSql;
        }
    }

    private record Measurement(long medianMillis, long minMillis, int matchedRows, String chosenKey) {
    }

    @Test
    void reportIndexBreakEvenPoint() throws Exception {
        try (Connection connection = DriverManager.getConnection(
                MYSQL.getJdbcUrl(), MYSQL.getUsername(), MYSQL.getPassword())) {

            createTable(connection);

            System.out.println();
            System.out.println("=== ① 건수별 (정리 대상 = 전체의 " + pct(STEADY_STATE_RATIO) + ", 정상 운영 가정) ===");
            System.out.printf("%12s | %14s | %10s | %12s | %12s | %12s%n",
                    "행 수", "일치 행", "인덱스없음", "idx(status)", "복합인덱스", "복합/무인덱스");

            int inserted = 0;
            for (int checkpoint : CHECKPOINTS) {
                insertUpTo(connection, inserted, checkpoint);
                inserted = checkpoint;

                LocalDateTime threshold = thresholdFor(STEADY_STATE_RATIO);
                Measurement none = measure(connection, Variant.NO_INDEX, threshold);
                Measurement statusOnly = measure(connection, Variant.STATUS_ONLY, threshold);
                Measurement composite = measure(connection, Variant.COMPOSITE, threshold);

                assertThat(statusOnly.matchedRows())
                        .as("인덱스 종류와 무관하게 같은 행이 나와야 비교가 성립한다")
                        .isEqualTo(none.matchedRows());
                assertThat(composite.matchedRows()).isEqualTo(none.matchedRows());

                System.out.printf("%,12d | %,14d | %8d ms | %9d ms | %9d ms | %11.1fx%n",
                        checkpoint, none.matchedRows(),
                        none.medianMillis(), statusOnly.medianMillis(), composite.medianMillis(),
                        ratio(none.medianMillis(), composite.medianMillis()));
                System.out.printf("%12s | 선택된 키: 인덱스없음=%s, idx(status)=%s, 복합=%s%n",
                        "", none.chosenKey(), statusOnly.chosenKey(), composite.chosenKey());
            }

            System.out.println();
            System.out.println("=== ② 선택도별 (행 수 고정: " + String.format("%,d", inserted) + ") ===");
            System.out.printf("%10s | %14s | %10s | %12s | %12s | %12s%n",
                    "선택도", "일치 행", "인덱스없음", "idx(status)", "복합인덱스", "복합/무인덱스");

            for (double selectivity : SELECTIVITIES) {
                LocalDateTime threshold = thresholdFor(selectivity);
                Measurement none = measure(connection, Variant.NO_INDEX, threshold);
                Measurement statusOnly = measure(connection, Variant.STATUS_ONLY, threshold);
                Measurement composite = measure(connection, Variant.COMPOSITE, threshold);

                System.out.printf("%10s | %,14d | %8d ms | %9d ms | %9d ms | %11.1fx%n",
                        pct(selectivity), none.matchedRows(),
                        none.medianMillis(), statusOnly.medianMillis(), composite.medianMillis(),
                        ratio(none.medianMillis(), composite.medianMillis()));
                System.out.printf("%10s | 선택된 키: 인덱스없음=%s, idx(status)=%s, 복합=%s%n",
                        "", none.chosenKey(), statusOnly.chosenKey(), composite.chosenKey());
            }
            System.out.println();
        }
    }

    /** 운영 스키마(V1 baseline)의 game_rooms에서 측정에 무관한 FK만 뺀 형태. */
    private void createTable(Connection connection) throws SQLException {
        try (Statement statement = connection.createStatement()) {
            statement.execute("DROP TABLE IF EXISTS game_rooms");
            statement.execute("""
                    CREATE TABLE game_rooms (
                        id              BIGINT AUTO_INCREMENT PRIMARY KEY,
                        room_code       VARCHAR(20) NOT NULL UNIQUE,
                        host_user_id    BIGINT NOT NULL,
                        guest_user_id   BIGINT NULL,
                        host_ready      BOOLEAN NOT NULL DEFAULT FALSE,
                        guest_ready     BOOLEAN NOT NULL DEFAULT FALSE,
                        status          ENUM('WAITING','IN_PROGRESS','CLOSED') NOT NULL DEFAULT 'WAITING',
                        game_type       VARCHAR(20) NOT NULL DEFAULT 'SIGN_DUEL',
                        created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                        updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                        version         BIGINT NOT NULL DEFAULT 0
                    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
                    """);
        }
    }

    private void insertUpTo(Connection connection, int from, int to) throws SQLException {
        // 시드를 고정해 재실행 시 같은 분포가 나오게 한다.
        Random random = new Random(42L + from);
        connection.setAutoCommit(false);
        String sql = "INSERT INTO game_rooms "
                + "(room_code, host_user_id, guest_user_id, status, updated_at, created_at) VALUES (?,?,?,?,?,?)";
        try (PreparedStatement statement = connection.prepareStatement(sql)) {
            for (int i = from; i < to; i++) {
                Timestamp updatedAt = Timestamp.valueOf(BASE.plusMinutes(random.nextInt(WINDOW_MINUTES)));
                statement.setString(1, "R" + i);
                statement.setLong(2, 1L + (i % 1000));
                statement.setObject(3, null);
                statement.setString(4, statusOf(random.nextDouble()));
                statement.setTimestamp(5, updatedAt);
                statement.setTimestamp(6, updatedAt);
                statement.addBatch();
                if ((i - from + 1) % INSERT_CHUNK == 0) {
                    statement.executeBatch();
                    connection.commit();
                }
            }
            statement.executeBatch();
            connection.commit();
        } finally {
            connection.setAutoCommit(true);
        }
    }

    private String statusOf(double roll) {
        if (roll < CLOSED_RATIO) {
            return "CLOSED";
        }
        return roll < CLOSED_RATIO + 0.3 ? "WAITING" : "IN_PROGRESS";
    }

    /** 전체 대비 targetRatio만큼 걸리도록 임계 시각을 역산한다(CLOSED 비율과 균등 분포 가정). */
    private LocalDateTime thresholdFor(double targetRatio) {
        long minutes = Math.round(WINDOW_MINUTES * (targetRatio / CLOSED_RATIO));
        return BASE.plusMinutes(minutes);
    }

    private Measurement measure(Connection connection, Variant variant, LocalDateTime threshold)
            throws SQLException {
        applyIndex(connection, variant);

        List<Long> samples = new ArrayList<>();
        int matchedRows = 0;
        for (int run = 0; run < WARMUP_RUNS + MEASURED_RUNS; run++) {
            long startedAt = System.nanoTime();
            matchedRows = runCleanupQuery(connection, threshold);
            long elapsedMillis = (System.nanoTime() - startedAt) / 1_000_000;
            if (run >= WARMUP_RUNS) {
                samples.add(elapsedMillis);
            }
        }
        Collections.sort(samples);
        return new Measurement(
                samples.get(samples.size() / 2), samples.get(0), matchedRows, explainKey(connection, threshold));
    }

    private void applyIndex(Connection connection, Variant variant) throws SQLException {
        try (Statement statement = connection.createStatement()) {
            dropIndexIfExists(connection, statement, "idx_room_status");
            dropIndexIfExists(connection, statement, "idx_room_status_updated_at");
            if (variant.createSql != null) {
                statement.execute(variant.createSql);
            }
            // 옵티마이저가 낡은 통계로 엉뚱한 계획을 고르지 않도록 갱신한다.
            statement.execute("ANALYZE TABLE game_rooms");
        }
    }

    private void dropIndexIfExists(Connection connection, Statement statement, String indexName)
            throws SQLException {
        String checkSql = "SELECT COUNT(*) FROM information_schema.STATISTICS "
                + "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'game_rooms' AND INDEX_NAME = ?";
        try (PreparedStatement check = connection.prepareStatement(checkSql)) {
            check.setString(1, indexName);
            try (ResultSet resultSet = check.executeQuery()) {
                resultSet.next();
                if (resultSet.getInt(1) > 0) {
                    statement.execute("DROP INDEX " + indexName + " ON game_rooms");
                }
            }
        }
    }

    /** 정리 스케줄러가 실제로 던지는 조회. 결과를 끝까지 읽어 전송 비용까지 포함해 잰다. */
    private int runCleanupQuery(Connection connection, LocalDateTime threshold) throws SQLException {
        String sql = "SELECT id, status, updated_at FROM game_rooms WHERE status = 'CLOSED' AND updated_at < ?";
        try (PreparedStatement statement = connection.prepareStatement(sql)) {
            statement.setTimestamp(1, Timestamp.valueOf(threshold));
            try (ResultSet resultSet = statement.executeQuery()) {
                int rows = 0;
                while (resultSet.next()) {
                    resultSet.getLong(1);
                    rows++;
                }
                return rows;
            }
        }
    }

    private String explainKey(Connection connection, LocalDateTime threshold) throws SQLException {
        String sql = "EXPLAIN SELECT id, status, updated_at FROM game_rooms "
                + "WHERE status = 'CLOSED' AND updated_at < ?";
        try (PreparedStatement statement = connection.prepareStatement(sql)) {
            statement.setTimestamp(1, Timestamp.valueOf(threshold));
            try (ResultSet resultSet = statement.executeQuery()) {
                if (!resultSet.next()) {
                    return "?";
                }
                String key = resultSet.getString("key");
                return key == null ? "(full scan)" : key;
            }
        }
    }

    private double ratio(long baselineMillis, long candidateMillis) {
        return candidateMillis == 0 ? Double.POSITIVE_INFINITY : (double) baselineMillis / candidateMillis;
    }

    private String pct(double value) {
        return String.format("%.1f%%", value * 100);
    }
}
