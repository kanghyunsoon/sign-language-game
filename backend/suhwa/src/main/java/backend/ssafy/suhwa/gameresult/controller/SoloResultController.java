package backend.ssafy.suhwa.gameresult.controller;

import backend.ssafy.suhwa.gameresult.dto.SoloResultRequest;
import backend.ssafy.suhwa.gameresult.dto.SoloResultResponse;
import backend.ssafy.suhwa.gameresult.service.SoloResultService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequiredArgsConstructor
public class SoloResultController implements SoloResultApi {

    private final SoloResultService soloResultService;

    @Override
    public ResponseEntity<SoloResultResponse> reportSoloResult(Long userId, SoloResultRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(soloResultService.report(userId, request.score()));
    }
}
