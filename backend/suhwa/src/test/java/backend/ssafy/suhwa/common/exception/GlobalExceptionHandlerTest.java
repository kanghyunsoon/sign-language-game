package backend.ssafy.suhwa.common.exception;

import static org.assertj.core.api.Assertions.assertThat;

import java.lang.reflect.Method;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.web.context.request.async.AsyncRequestNotUsableException;
import org.springframework.web.method.annotation.ExceptionHandlerMethodResolver;

/**
 * catch-all {@code @ExceptionHandler(Exception.class)}가 더 구체적인 핸들러를 가리지 않는지
 * 검증한다. 실제 선택은 Spring의 {@link ExceptionHandlerMethodResolver}가 하므로, 핸들러를
 * 직접 호출하는 대신 해석 결과를 단언해야 의미가 있다.
 */
class GlobalExceptionHandlerTest {

    private final ExceptionHandlerMethodResolver resolver =
            new ExceptionHandlerMethodResolver(GlobalExceptionHandler.class);

    /**
     * SSE 구독자가 탭을 닫으면 발생하는 예외다. catch-all이 잡으면 정상 이탈이 ERROR
     * "처리되지 않은 예외"로 기록되고, 응답 Content-Type이 text/event-stream으로 확정돼 있어
     * ErrorResponse를 쓸 컨버터가 없어 HttpMessageNotWritableException 2차 실패가 남는다.
     */
    @Test
    @DisplayName("응답 불가 async 예외는 catch-all이 아닌 전용 핸들러가 처리한다")
    void asyncRequestNotUsable_resolvesToDedicatedHandler() {
        Method resolved = resolver.resolveMethod(new AsyncRequestNotUsableException("client gone"));

        assertThat(resolved).isNotNull();
        assertThat(resolved.getName()).isEqualTo("handleAsyncRequestNotUsable");
        // 본문을 쓰지 않아야 컨버터 부재로 인한 2차 실패가 생기지 않는다.
        assertThat(resolved.getReturnType()).isEqualTo(void.class);
    }

    @Test
    @DisplayName("인가 실패는 여전히 전용 핸들러가 처리한다")
    void accessDenied_resolvesToDedicatedHandler() {
        Method resolved = resolver.resolveMethod(new AccessDeniedException("denied"));

        assertThat(resolved).isNotNull();
        assertThat(resolved.getName()).isEqualTo("handleAccessDenied");
    }

    @Test
    @DisplayName("전용 핸들러가 없는 예외는 catch-all이 계속 처리한다")
    void unmappedException_stillFallsBackToCatchAll() {
        Method resolved = resolver.resolveMethod(new IllegalStateException("boom"));

        assertThat(resolved).isNotNull();
        assertThat(resolved.getName()).isEqualTo("handleUnexpected");
    }
}
