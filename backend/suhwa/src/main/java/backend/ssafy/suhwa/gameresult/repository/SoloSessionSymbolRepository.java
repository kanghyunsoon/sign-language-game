package backend.ssafy.suhwa.gameresult.repository;

import backend.ssafy.suhwa.gameresult.domain.SoloSessionSymbol;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface SoloSessionSymbolRepository extends JpaRepository<SoloSessionSymbol, Long> {

    List<SoloSessionSymbol> findBySoloSessionIdOrderByPosition(String soloSessionId);
}
