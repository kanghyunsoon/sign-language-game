package backend.ssafy.suhwa.webrtc.controller;

import backend.ssafy.suhwa.webrtc.config.WebRtcProperties;
import backend.ssafy.suhwa.webrtc.dto.IceServerListResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequiredArgsConstructor
public class IceServerController implements IceServerApi {

    private final WebRtcProperties webRtcProperties;

    @Override
    public ResponseEntity<IceServerListResponse> getIceServers() {
        return ResponseEntity.ok(IceServerListResponse.from(webRtcProperties));
    }
}
