package backend.ssafy.suhwa.learning.repository;

import backend.ssafy.suhwa.learning.domain.Sign;
import backend.ssafy.suhwa.learning.domain.SignCategory;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface SignRepository extends JpaRepository<Sign, Long> {

    List<Sign> findByCategoryAndActiveTrue(SignCategory category);
}
