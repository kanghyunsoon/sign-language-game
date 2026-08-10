package backend.ssafy.suhwa.common.exception;

import jakarta.validation.ConstraintViolationException;
import lombok.extern.slf4j.Slf4j;
import org.springframework.dao.OptimisticLockingFailureException;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.core.AuthenticationException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.MissingServletRequestParameterException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.context.request.async.AsyncRequestNotUsableException;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;

@Slf4j
@RestControllerAdvice
public class GlobalExceptionHandler {

    @ExceptionHandler(BusinessException.class)
    public ResponseEntity<ErrorResponse> handleBusinessException(BusinessException e) {
        return ResponseEntity.status(e.getStatus())
                .body(new ErrorResponse(e.getCode(), e.getMessage()));
    }

    @ExceptionHandler(OptimisticLockingFailureException.class)
    public ResponseEntity<ErrorResponse> handleOptimisticLockingFailure(OptimisticLockingFailureException e) {
        return ResponseEntity.status(ErrorCode.CONCURRENT_UPDATE_CONFLICT.getStatus())
                .body(new ErrorResponse(
                        ErrorCode.CONCURRENT_UPDATE_CONFLICT.name(),
                        ErrorCode.CONCURRENT_UPDATE_CONFLICT.getDefaultMessage()));
    }

    @ExceptionHandler({MissingServletRequestParameterException.class, MethodArgumentTypeMismatchException.class})
    public ResponseEntity<ErrorResponse> handleBadRequestParameter(Exception e) {
        return ResponseEntity.status(ErrorCode.INVALID_INPUT.getStatus())
                .body(new ErrorResponse(ErrorCode.INVALID_INPUT.name(), ErrorCode.INVALID_INPUT.getDefaultMessage()));
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<ErrorResponse> handleValidationException(MethodArgumentNotValidException e) {
        String message = e.getBindingResult().getFieldErrors().stream()
                .findFirst()
                .map(fieldError -> fieldError.getField() + ": " + fieldError.getDefaultMessage())
                .orElse(ErrorCode.INVALID_INPUT.getDefaultMessage());
        return ResponseEntity.status(ErrorCode.INVALID_INPUT.getStatus())
                .body(new ErrorResponse(ErrorCode.INVALID_INPUT.name(), message));
    }

    /** 본문 JSON이 깨졌거나 타입이 맞지 않아 역직렬화 자체가 실패한 경우(FR-024). */
    @ExceptionHandler(HttpMessageNotReadableException.class)
    public ResponseEntity<ErrorResponse> handleUnreadableBody(HttpMessageNotReadableException e) {
        return badRequest(ErrorCode.INVALID_INPUT.getDefaultMessage());
    }

    /** {@code @Validated} 파라미터 검증 실패. 본문 DTO 검증(MethodArgumentNotValid)과 경로가 다르다. */
    @ExceptionHandler(ConstraintViolationException.class)
    public ResponseEntity<ErrorResponse> handleConstraintViolation(ConstraintViolationException e) {
        String message = e.getConstraintViolations().stream()
                .findFirst()
                .map(violation -> violation.getPropertyPath() + ": " + violation.getMessage())
                .orElse(ErrorCode.INVALID_INPUT.getDefaultMessage());
        return badRequest(message);
    }

    /**
     * 인가 실패(FR-024). {@code SecurityConfig}의 {@code accessDeniedHandler}는 필터 단계에서
     * 걸린 경우만 담당하는데, 컨트롤러 안에서 던져진 {@code AccessDeniedException}은 아래
     * catch-all이 먼저 잡아 500으로 바꿔버린다. 같은 응답을 여기서도 내 형식을 일치시킨다.
     */
    @ExceptionHandler(AccessDeniedException.class)
    public ResponseEntity<ErrorResponse> handleAccessDenied(AccessDeniedException e) {
        return ResponseEntity.status(ErrorCode.ACCESS_DENIED.getStatus())
                .body(new ErrorResponse(
                        ErrorCode.ACCESS_DENIED.name(), ErrorCode.ACCESS_DENIED.getDefaultMessage()));
    }

    /** 인증 실패도 같은 이유로 catch-all보다 앞에 둔다(FR-024). */
    @ExceptionHandler(AuthenticationException.class)
    public ResponseEntity<ErrorResponse> handleAuthentication(AuthenticationException e) {
        return ResponseEntity.status(ErrorCode.UNAUTHENTICATED.getStatus())
                .body(new ErrorResponse(
                        ErrorCode.UNAUTHENTICATED.name(), ErrorCode.UNAUTHENTICATED.getDefaultMessage()));
    }

    /**
     * 응답에 더 쓸 수 없게 된 비동기 요청(SSE 구독자 이탈 등). 아래 catch-all이 잡으면 두 가지가
     * 잘못된다 — 정상적인 사용자 이탈이 ERROR "처리되지 않은 예외"로 기록되고, 응답
     * Content-Type이 이미 {@code text/event-stream}으로 확정돼 있어 {@code ErrorResponse}를
     * 쓸 컨버터가 없어 {@code HttpMessageNotWritableException} 2차 실패까지 남는다.
     *
     * <p>반환형을 {@code void}로 두어 본문을 아예 쓰지 않는다. 애초에 클라이언트가 없으므로
     * 내려보낼 응답도 필요 없다. 원인 추적이 필요한 경우를 위해 DEBUG로만 남긴다.
     */
    @ExceptionHandler(AsyncRequestNotUsableException.class)
    public void handleAsyncRequestNotUsable(AsyncRequestNotUsableException e) {
        log.debug("클라이언트가 이미 끊긴 비동기 응답에 전송 시도: {}", e.getMessage());
    }

    /**
     * 위에서 잡지 못한 모든 예외의 최종 방어선(FR-024). 핸들러가 없으면 서블릿 컨테이너가 기본
     * 오류 페이지를 내보내 응답 형식이 API의 다른 오류와 달라진다.
     *
     * <p>단, Spring MVC가 이미 상태 코드를 정의해둔 예외(405, 415, 404 등)까지 500으로 덮으면
     * 의미가 뒤바뀌므로, {@link org.springframework.web.ErrorResponse}를 구현한 예외는 그 상태를
     * 보존한다. 4xx는 클라이언트 요청 문제이므로 코드는 {@code INVALID_INPUT}으로 통일한다.
     */
    @ExceptionHandler(Exception.class)
    public ResponseEntity<ErrorResponse> handleUnexpected(Exception e) {
        if (e instanceof org.springframework.web.ErrorResponse springError
                && springError.getStatusCode().is4xxClientError()) {
            return ResponseEntity.status(springError.getStatusCode())
                    .body(new ErrorResponse(ErrorCode.INVALID_INPUT.name(), ErrorCode.INVALID_INPUT.getDefaultMessage()));
        }
        log.error("처리되지 않은 예외", e);
        return ResponseEntity.status(ErrorCode.INTERNAL_ERROR.getStatus())
                .body(new ErrorResponse(
                        ErrorCode.INTERNAL_ERROR.name(), ErrorCode.INTERNAL_ERROR.getDefaultMessage()));
    }

    private ResponseEntity<ErrorResponse> badRequest(String message) {
        return ResponseEntity.status(ErrorCode.INVALID_INPUT.getStatus())
                .body(new ErrorResponse(ErrorCode.INVALID_INPUT.name(), message));
    }
}
