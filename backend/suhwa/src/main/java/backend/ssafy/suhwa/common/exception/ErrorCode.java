package backend.ssafy.suhwa.common.exception;

import org.springframework.http.HttpStatus;

public enum ErrorCode {

    // Common
    INVALID_INPUT(HttpStatus.BAD_REQUEST, "요청 값이 올바르지 않습니다."),
    UNAUTHENTICATED(HttpStatus.UNAUTHORIZED, "인증이 필요합니다."),
    ACCESS_DENIED(HttpStatus.FORBIDDEN, "접근 권한이 없습니다."),
    CONCURRENT_UPDATE_CONFLICT(HttpStatus.CONFLICT, "다른 요청에 의해 이미 변경되었습니다. 다시 시도해주세요."),

    // Auth / User
    EMAIL_ALREADY_EXISTS(HttpStatus.CONFLICT, "이미 사용 중인 이메일입니다."),
    INVALID_CREDENTIALS(HttpStatus.UNAUTHORIZED, "이메일 또는 비밀번호가 일치하지 않습니다."),
    ACCOUNT_WITHDRAWN(HttpStatus.UNAUTHORIZED, "탈퇴한 계정입니다."),
    INVALID_REFRESH_TOKEN(HttpStatus.UNAUTHORIZED, "만료되었거나 무효화된 재발급 토큰입니다."),
    USER_NOT_FOUND(HttpStatus.NOT_FOUND, "사용자를 찾을 수 없습니다."),

    // Learning
    SIGN_NOT_FOUND(HttpStatus.NOT_FOUND, "존재하지 않는 콘텐츠입니다."),

    // Game Rooms
    ROOM_NOT_FOUND(HttpStatus.NOT_FOUND, "존재하지 않는 게임방입니다."),
    ROOM_FULL(HttpStatus.CONFLICT, "정원이 가득 찬 방입니다."),
    ROOM_NOT_WAITING(HttpStatus.CONFLICT, "대기 중인 방이 아닙니다."),
    ROOM_NOT_IN_PROGRESS(HttpStatus.CONFLICT, "진행 중인 방이 아니라 처리할 수 없습니다."),
    NOT_ROOM_PARTICIPANT(HttpStatus.FORBIDDEN, "해당 방의 참가자가 아닙니다."),
    NOT_ROOM_HOST(HttpStatus.FORBIDDEN, "방장만 수행할 수 있습니다."),
    NOT_ALL_READY(HttpStatus.CONFLICT, "모든 참가자가 준비되지 않았습니다.");

    private final HttpStatus status;
    private final String defaultMessage;

    ErrorCode(HttpStatus status, String defaultMessage) {
        this.status = status;
        this.defaultMessage = defaultMessage;
    }

    public HttpStatus getStatus() {
        return status;
    }

    public String getDefaultMessage() {
        return defaultMessage;
    }
}
