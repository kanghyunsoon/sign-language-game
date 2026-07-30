package backend.ssafy.suhwa.gameresult.controller;

import backend.ssafy.suhwa.common.config.OpenApiConfig;
import backend.ssafy.suhwa.common.security.LoginUser;
import backend.ssafy.suhwa.gameresult.dto.CompleteSoloSessionRequest;
import backend.ssafy.suhwa.gameresult.dto.SoloGameResult;
import backend.ssafy.suhwa.gameresult.dto.StartSoloSessionRequest;
import backend.ssafy.suhwa.gameresult.dto.StartSoloSessionResponse;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import java.util.List;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;

@Tag(name = "SoloSessions")
@SecurityRequirement(name = OpenApiConfig.BEARER_SCHEME_NAME)
public interface SoloSessionApi {

    @PostMapping("/game/solo/sessions")
    ResponseEntity<StartSoloSessionResponse> start(
            @LoginUser Long userId, @RequestBody @Valid StartSoloSessionRequest request);

    @PostMapping("/game/solo/sessions/{soloSessionId}/complete")
    ResponseEntity<SoloGameResult> complete(
            @LoginUser Long userId,
            @PathVariable String soloSessionId,
            @RequestBody @Valid CompleteSoloSessionRequest request);

    @GetMapping("/game/solo/results")
    ResponseEntity<List<SoloGameResult>> results(@LoginUser Long userId);
}
