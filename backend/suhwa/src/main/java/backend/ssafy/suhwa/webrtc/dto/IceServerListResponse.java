package backend.ssafy.suhwa.webrtc.dto;

import backend.ssafy.suhwa.webrtc.config.WebRtcProperties;
import java.util.ArrayList;
import java.util.List;

public record IceServerListResponse(List<IceServerEntry> iceServers) {

    public static IceServerListResponse from(WebRtcProperties properties) {
        List<IceServerEntry> entries = new ArrayList<>();
        if (!properties.getStunUrls().isEmpty()) {
            entries.add(new IceServerEntry(properties.getStunUrls(), null, null));
        }
        if (properties.getTurnUrl() != null && !properties.getTurnUrl().isBlank()) {
            entries.add(new IceServerEntry(
                    List.of(properties.getTurnUrl()), properties.getTurnUsername(), properties.getTurnCredential()));
        }
        return new IceServerListResponse(entries);
    }
}
