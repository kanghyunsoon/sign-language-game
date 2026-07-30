package backend.ssafy.suhwa.gameresult.controller;

import backend.ssafy.suhwa.gameresult.dto.CompleteSoloSessionRequest;
import backend.ssafy.suhwa.gameresult.dto.SoloGameResult;
import backend.ssafy.suhwa.gameresult.dto.StartSoloSessionRequest;
import backend.ssafy.suhwa.gameresult.dto.StartSoloSessionResponse;
import backend.ssafy.suhwa.gameresult.service.SoloSessionService;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequiredArgsConstructor
public class SoloSessionController implements SoloSessionApi {

    private final SoloSessionService soloSessionService;

    @Override
    public ResponseEntity<StartSoloSessionResponse> start(
            Long userId, StartSoloSessionRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(soloSessionService.start(userId, request));
    }

    @Override
    public ResponseEntity<SoloGameResult> complete(
            Long userId, String soloSessionId, CompleteSoloSessionRequest request) {
        return ResponseEntity.ok(soloSessionService.complete(userId, soloSessionId, request));
    }

    @Override
    public ResponseEntity<List<SoloGameResult>> results(Long userId) {
        return ResponseEntity.ok(soloSessionService.findCompleted(userId));
    }
}
