package backend.ssafy.suhwa.learning.service;

import backend.ssafy.suhwa.common.config.CacheConfig;
import backend.ssafy.suhwa.learning.domain.Sign;
import backend.ssafy.suhwa.learning.domain.SignCategory;
import backend.ssafy.suhwa.learning.repository.SignRepository;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class SignService {

    private final SignRepository signRepository;

    /**
     * 카테고리별 학습 콘텐츠는 사실상 정적이라 로컬 캐시로 DB 조회 자체를 없앤다(FR-011,
     * {@link CacheConfig}). 캐시에 담기는 {@code Sign}은 세터도 연관관계도 없고 쓰기 API가
     * 없어 detach 상태로 공유해도 안전하다 — 콘텐츠 관리 API가 생기면 {@code @CacheEvict}가
     * 필요하다(CacheConfig 주석 참조).
     */
    @Cacheable(cacheNames = CacheConfig.SIGNS_BY_CATEGORY, key = "#category")
    public List<Sign> getActiveSignsByCategory(SignCategory category) {
        return signRepository.findByCategoryAndActiveTrue(category);
    }
}
