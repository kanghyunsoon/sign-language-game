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
        name = "solo_session_symbols",
        uniqueConstraints = @UniqueConstraint(
                name = "uk_solo_session_symbol_position",
                columnNames = {"solo_session_id", "position"}))
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class SoloSessionSymbol {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "solo_session_id", nullable = false, length = 36)
    private String soloSessionId;

    @Column(nullable = false)
    private int position;

    @Column(nullable = false, length = 20)
    private String symbol;

    @Builder
    public SoloSessionSymbol(String soloSessionId, int position, String symbol) {
        this.soloSessionId = soloSessionId;
        this.position = position;
        this.symbol = symbol;
    }
}
