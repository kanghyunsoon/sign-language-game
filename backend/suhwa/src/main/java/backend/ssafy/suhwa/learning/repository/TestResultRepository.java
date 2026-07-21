package backend.ssafy.suhwa.learning.repository;

import backend.ssafy.suhwa.learning.domain.TestResult;
import org.springframework.data.jpa.repository.JpaRepository;

public interface TestResultRepository extends JpaRepository<TestResult, Long> {
}
