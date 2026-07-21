import { mapRoomApiError } from "./roomMappers";
import type { BattleRoomGatewayOptions } from "./roomTypes";

export async function roomRequest(options: BattleRoomGatewayOptions, path: string, init?: RequestInit): Promise<unknown> {
  const request = options.fetch ?? globalThis.fetch;
  const response = await request(`${options.baseUrl.replace(/\/$/, "")}${path}`, {
    ...init,
    credentials: options.credentials,
    headers: { Accept: "application/json", ...options.headers, ...init?.headers },
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => null) as unknown;
    throw mapRoomApiError(payload, `방 요청에 실패했습니다. (${response.status})`);
  }
  if (response.status === 204) return null;
  return response.json() as Promise<unknown>;
}
