package backend.ssafy.suhwa.architecture;

import com.tngtech.archunit.core.domain.Dependency;
import com.tngtech.archunit.core.domain.JavaClass;
import com.tngtech.archunit.core.domain.JavaConstructorCall;
import com.tngtech.archunit.core.importer.ImportOption;
import com.tngtech.archunit.junit.AnalyzeClasses;
import com.tngtech.archunit.junit.ArchTest;
import com.tngtech.archunit.lang.ArchCondition;
import com.tngtech.archunit.lang.ArchRule;
import com.tngtech.archunit.lang.ConditionEvents;
import com.tngtech.archunit.lang.SimpleConditionEvent;
import com.tngtech.archunit.lang.syntax.ArchRuleDefinition;
import java.util.Set;

/**
 * 도메인 모듈 경계를 테스트로 고정한다(FR-020, research.md R3). 리뷰에서 매번 지적하는 대신
 * 빌드가 막도록 해서, 시간이 지나며 경계가 조용히 무너지는 것을 방지한다.
 */
@AnalyzeClasses(packages = ModuleBoundaryTest.ROOT_PACKAGE, importOptions = ImportOption.DoNotIncludeTests.class)
class ModuleBoundaryTest {

    static final String ROOT_PACKAGE = "backend.ssafy.suhwa";

    private static final String PACKAGE_PREFIX = ROOT_PACKAGE + ".";
    private static final String REPOSITORY_PACKAGE_SUFFIX = ".repository";

    /**
     * 서비스가 다른 모듈의 표준 예외 대신 도메인 예외를 쓰게 하려는 규칙이므로, 비즈니스 오류로
     * 표현될 수 있는 예외만 막는다. {@code IllegalStateException}은 제외했다 —
     * {@code RefreshTokenService}가 {@code NoSuchAlgorithmException}(JVM에 SHA-256이 없는,
     * 실질적으로 도달 불가능한 상황)을 감싸는 데 쓰고 있고, 이건 사용자에게 보여줄 비즈니스 오류가
     * 아니라 환경 결함이라 도메인 예외로 옮기는 게 오히려 부정확하다.
     */
    private static final Set<String> FORBIDDEN_EXCEPTIONS = Set.of(
            "java.lang.Exception",
            "java.lang.RuntimeException",
            "java.lang.IllegalArgumentException",
            "java.lang.UnsupportedOperationException");

    /**
     * 리포지토리는 같은 도메인 모듈 안에서만 쓴다. 다른 모듈의 데이터가 필요하면 그 모듈의 서비스를
     * 거쳐야, 조회 조건(예: 탈퇴 회원 제외)이 한곳에서만 관리된다.
     */
    @ArchTest
    static final ArchRule repositoriesAreAccessedOnlyWithinTheirOwnModule = ArchRuleDefinition.classes()
            .should(onlyAccessRepositoriesOfTheirOwnModule())
            .because("다른 모듈의 데이터는 그 모듈의 서비스를 통해 얻어야 조회 규칙이 한곳에 모인다");

    /** 컨트롤러가 리포지토리를 직접 잡으면 트랜잭션 경계와 검증이 서비스를 건너뛴다. */
    @ArchTest
    static final ArchRule controllersDoNotUseRepositoriesDirectly = ArchRuleDefinition.noClasses()
            .that().resideInAPackage("..controller..")
            .should().dependOnClassesThat().resideInAPackage("..repository..")
            .because("컨트롤러가 리포지토리를 직접 쓰면 트랜잭션 경계와 도메인 검증을 건너뛴다");

    /** 서비스의 실패는 공통 ErrorResponse로 매핑되는 BusinessException으로 표현한다. */
    @ArchTest
    static final ArchRule servicesThrowDomainExceptions = ArchRuleDefinition.classes()
            .that().resideInAPackage("..service..")
            .should(notInstantiateStandardExceptions())
            .because("표준 예외는 GlobalExceptionHandler에서 상태 코드로 구분되지 않아 500으로 떨어진다");

    private static ArchCondition<JavaClass> onlyAccessRepositoriesOfTheirOwnModule() {
        return new ArchCondition<>("only access repositories of their own module") {
            @Override
            public void check(JavaClass source, ConditionEvents events) {
                for (Dependency dependency : source.getDirectDependenciesFromSelf()) {
                    JavaClass target = dependency.getTargetClass();
                    if (isProjectRepository(target) && !moduleOf(source).equals(moduleOf(target))) {
                        events.add(SimpleConditionEvent.violated(dependency, dependency.getDescription()));
                    }
                }
            }
        };
    }

    private static ArchCondition<JavaClass> notInstantiateStandardExceptions() {
        return new ArchCondition<>("throw domain exceptions instead of standard ones") {
            @Override
            public void check(JavaClass source, ConditionEvents events) {
                for (JavaConstructorCall call : source.getConstructorCallsFromSelf()) {
                    if (FORBIDDEN_EXCEPTIONS.contains(call.getTargetOwner().getFullName())) {
                        events.add(SimpleConditionEvent.violated(call, call.getDescription()));
                    }
                }
            }
        };
    }

    private static boolean isProjectRepository(JavaClass javaClass) {
        String packageName = javaClass.getPackageName();
        return packageName.startsWith(PACKAGE_PREFIX) && packageName.endsWith(REPOSITORY_PACKAGE_SUFFIX);
    }

    /** `backend.ssafy.suhwa.<module>....`에서 모듈 이름(첫 세그먼트)을 뽑는다. 프로젝트 밖이면 빈 문자열. */
    private static String moduleOf(JavaClass javaClass) {
        String packageName = javaClass.getPackageName();
        if (!packageName.startsWith(PACKAGE_PREFIX)) {
            return "";
        }
        String remainder = packageName.substring(PACKAGE_PREFIX.length());
        int separator = remainder.indexOf('.');
        return separator < 0 ? remainder : remainder.substring(0, separator);
    }
}
