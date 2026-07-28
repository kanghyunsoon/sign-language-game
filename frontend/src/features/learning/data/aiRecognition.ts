/**
 * AI 지문자 인식 WebSocket 주소를 구한다.
 * 배포 경로가 확정되지 않아 env로 주입하고, 없으면 현재 host 기준 상대 주소를 쓴다.
 * 연습·테스트 화면이 같은 주소를 바라보도록 한곳에서 계산한다.
 */
export function getAiWebSocketUrl(): string {
  const configuredUrl = import.meta.env.VITE_AI_WEBSOCKET_URL?.trim();

  if (configuredUrl) {
    return configuredUrl;
  }

  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";

  return `${protocol}//${window.location.host}/ai/ws`;
}
