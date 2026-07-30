package backend.ssafy.suhwa.gameresult.repository;

import backend.ssafy.suhwa.gameresult.domain.SoloSymbolStatistic;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface SoloSymbolStatisticRepository extends JpaRepository<SoloSymbolStatistic, Long> {

    List<SoloSymbolStatistic> findBySoloSessionIdOrderBySymbol(String soloSessionId);
}
