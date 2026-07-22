package backend.ssafy.suhwa.webrtc.config;

import java.util.List;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.context.annotation.Configuration;

/**
 * 영상 통화 연결에 사용할 STUN/TURN 접속 정보(FR-027, research.md #13). 방마다 다르지 않은
 * 정적 인프라 설정값이라 환경 변수로만 관리한다.
 */
@Configuration
@ConfigurationProperties(prefix = "webrtc")
public class WebRtcProperties {

    private List<String> stunUrls = List.of();
    private String turnUrl;
    private String turnUsername;
    private String turnCredential;

    public List<String> getStunUrls() {
        return stunUrls;
    }

    public void setStunUrls(List<String> stunUrls) {
        this.stunUrls = stunUrls;
    }

    public String getTurnUrl() {
        return turnUrl;
    }

    public void setTurnUrl(String turnUrl) {
        this.turnUrl = turnUrl;
    }

    public String getTurnUsername() {
        return turnUsername;
    }

    public void setTurnUsername(String turnUsername) {
        this.turnUsername = turnUsername;
    }

    public String getTurnCredential() {
        return turnCredential;
    }

    public void setTurnCredential(String turnCredential) {
        this.turnCredential = turnCredential;
    }
}
