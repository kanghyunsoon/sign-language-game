package backend.ssafy.suhwa.learning.service;

import backend.ssafy.suhwa.learning.domain.Sign;
import backend.ssafy.suhwa.learning.domain.SignCategory;
import backend.ssafy.suhwa.learning.repository.SignRepository;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class SignService {

    private final SignRepository signRepository;

    public List<Sign> getActiveSignsByCategory(SignCategory category) {
        return signRepository.findByCategoryAndActiveTrue(category);
    }
}
