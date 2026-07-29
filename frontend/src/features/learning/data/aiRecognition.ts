/**
 * AI 지문자 인식 WebSocket 주소를 구한다.
 * 배포 경로가 확정되지 않아 env로 주입하고, 없으면 현재 host 기준 상대 주소를 쓴다.
 * 숫자 연습은 같은 서버의 /number 엔드포인트를 사용한다.
 */
export function getAiWebSocketUrl(useNumberEndpoint = false): string {
  const configuredUrl = import.meta.env.VITE_AI_WEBSOCKET_URL?.trim();
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const baseUrl =
    configuredUrl || `${protocol}//${window.location.host}/ai/ws`;

  return useNumberEndpoint
    ? `${baseUrl.replace(/\/+$/, "")}/number`
    : baseUrl;
}
