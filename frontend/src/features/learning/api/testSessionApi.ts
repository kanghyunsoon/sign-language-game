const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL?.trim() || "/api").replace(
  /\/$/,
  "",
);

export interface TestSessionResponse {
  readonly testSessionId: number;
  readonly startedAt: string;
  readonly completedAt: string | null;
  readonly correctCount: number | null;
  readonly totalCount: number | null;
  readonly passedRewardThreshold: boolean;
  readonly awardedExp: number;
}

async function post<T>(
  path: string,
  accessToken: string,
  body?: object,
): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${accessToken}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    throw new Error(`테스트 결과를 저장하지 못했습니다. (HTTP ${response.status})`);
  }

  return (await response.json()) as T;
}

export function startTestSession(
  accessToken: string,
): Promise<TestSessionResponse> {
  return post<TestSessionResponse>("/test-sessions", accessToken);
}

export function completeTestSession(
  accessToken: string,
  testSessionId: number,
  result: { correctCount: number; totalCount: number },
): Promise<TestSessionResponse> {
  return post<TestSessionResponse>(
    `/test-sessions/${testSessionId}/complete`,
    accessToken,
    result,
  );
}
