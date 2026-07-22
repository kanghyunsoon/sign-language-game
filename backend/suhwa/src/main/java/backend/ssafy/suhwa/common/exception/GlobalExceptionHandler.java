package backend.ssafy.suhwa.common.exception;

import org.springframework.dao.OptimisticLockingFailureException;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.MissingServletRequestParameterException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;

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
}
