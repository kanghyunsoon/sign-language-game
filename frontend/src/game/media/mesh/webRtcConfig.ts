export interface WebRtcClientConfig { readonly iceServers: readonly RTCIceServer[] }

export async function requestWebRtcClientConfig(
  baseUrl = "/api/rtc/config",
  options: { readonly headers?: HeadersInit; readonly fetch?: typeof globalThis.fetch } = {},
): Promise<WebRtcClientConfig> {
  const response = await (options.fetch ?? globalThis.fetch)(baseUrl, { credentials: "include", headers: options.headers });
  if (!response.ok) throw new Error(`RTC config request failed (${response.status}).`);
  const value = await response.json() as WebRtcClientConfig;
  if (!Array.isArray(value.iceServers)) throw new Error("RTC config response has no iceServers array.");
  return value;
}
