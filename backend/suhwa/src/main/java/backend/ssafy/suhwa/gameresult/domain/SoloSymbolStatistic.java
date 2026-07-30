package backend.ssafy.suhwa.gameresult.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;
import lombok.AccessLevel;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;

@Entity
@Table(
        name = "solo_symbol_statistics",
        uniqueConstraints = @UniqueConstraint(
                name = "uk_solo_statistic_session_symbol",
                columnNames = {"solo_session_id", "symbol"}))
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class SoloSymbolStatistic {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "solo_session_id", nullable = false, length = 36)
    private String soloSessionId;

    @Column(nullable = false, length = 20)
    private String symbol;

    @Column(name = "correct_count", nullable = false)
    private int correctCount;

    @Column(name = "incorrect_count", nullable = false)
    private int incorrectCount;

    @Column(name = "confirmed_count", nullable = false)
    private int confirmedCount;

    @Builder
    public SoloSymbolStatistic(
            String soloSessionId,
            String symbol,
            int correctCount,
            int incorrectCount,
            int confirmedCount) {
        this.soloSessionId = soloSessionId;
        this.symbol = symbol;
        this.correctCount = correctCount;
        this.incorrectCount = incorrectCount;
        this.confirmedCount = confirmedCount;
    }
}
