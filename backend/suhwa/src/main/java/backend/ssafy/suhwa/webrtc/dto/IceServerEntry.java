package backend.ssafy.suhwa.webrtc.dto;

import java.util.List;

public record IceServerEntry(List<String> urls, String username, String credential) {
}
