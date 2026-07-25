package backend.ssafy.suhwa.common.config;

import com.github.benmanes.caffeine.cache.Caffeine;
import org.springframework.cache.CacheManager;
import org.springframework.cache.annotation.EnableCaching;
import org.springframework.cache.caffeine.CaffeineCacheManager;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * 로컬(인메모리) 캐시 설정(spec 004 FR-011, LEARN-01-02). 단일 인스턴스 전제라 분산 캐시가
 * 불필요하므로 Caffeine을 사용한다(Redis는 이 규모에서 과함 — research.md R1).
 *
 * <p>학습 콘텐츠(`signs`)는 자주 조회되고 거의 안 바뀌는 작은 데이터라 무기한 캐시로 충분하다.
 * 현재 Sign 쓰기/관리 API가 없어 런타임 변경이 없으므로 만료 정책을 두지 않는다 — 향후 콘텐츠
 * 관리 API가 추가되면 그때 {@code @CacheEvict}로 무효화한다.
 *
 * <p>랭킹 Top-5 캐시(RANK-01-03)는 쓰기 민감·게임 타입별 분리로 무효화 복잡도가 커 범위에서
 * 제외했다(spec.md "범위 제외"). 여기서는 콘텐츠 캐시만 등록한다.
 */
@Configuration
@EnableCaching
public class CacheConfig {

    /** 카테고리별 지문자 콘텐츠 캐시 이름 — {@code SignService.getActiveSignsByCategory}에서 사용. */
    public static final String SIGNS_BY_CATEGORY = "signsByCategory";

    @Bean
    public CacheManager cacheManager() {
        CaffeineCacheManager cacheManager = new CaffeineCacheManager(SIGNS_BY_CATEGORY);
        // 콘텐츠는 사실상 정적이라 크기 상한만 둔다(만료 없음). 카테고리 수가 적어 넉넉히 잡아도 무방.
        cacheManager.setCaffeine(Caffeine.newBuilder().maximumSize(100));
        return cacheManager;
    }
}
