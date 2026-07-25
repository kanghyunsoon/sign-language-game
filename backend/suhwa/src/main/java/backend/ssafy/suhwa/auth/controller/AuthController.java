package backend.ssafy.suhwa.auth.controller;

import backend.ssafy.suhwa.auth.dto.LoginRequest;
import backend.ssafy.suhwa.auth.dto.RealtimeTicketResponse;
import backend.ssafy.suhwa.auth.dto.RefreshRequest;
import backend.ssafy.suhwa.auth.dto.SignupRequest;
import backend.ssafy.suhwa.auth.dto.TokenResponse;
import backend.ssafy.suhwa.auth.service.AuthService;
import backend.ssafy.suhwa.auth.service.RealtimeTicketService;
import backend.ssafy.suhwa.user.domain.User;
import backend.ssafy.suhwa.user.dto.UserProfileResponse;
import backend.ssafy.suhwa.user.service.UserService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequiredArgsConstructor
public class AuthController implements AuthApi {

    private final AuthService authService;
    private final UserService userService;
    private final RealtimeTicketService realtimeTicketService;

    @Override
    public ResponseEntity<UserProfileResponse> signup(SignupRequest request) {
        User user = userService.signup(request.email(), request.password(), request.nickname());
        return ResponseEntity.status(HttpStatus.CREATED).body(UserProfileResponse.from(user));
    }

    @Override
    public ResponseEntity<TokenResponse> login(LoginRequest request) {
        return ResponseEntity.ok(authService.login(request.email(), request.password()));
    }

    @Override
    public ResponseEntity<TokenResponse> refresh(RefreshRequest request) {
        return ResponseEntity.ok(authService.refresh(request.refreshToken()));
    }

    @Override
    public ResponseEntity<Void> logout(Long userId) {
        authService.logout(userId);
        return ResponseEntity.noContent().build();
    }

    @Override
    public ResponseEntity<RealtimeTicketResponse> issueRealtimeTicket(Long userId) {
        String ticket = realtimeTicketService.issue(userId);
        RealtimeTicketResponse response =
                new RealtimeTicketResponse(ticket, realtimeTicketService.ticketTtlSeconds());
        return ResponseEntity.status(HttpStatus.CREATED).body(response);
    }
}
