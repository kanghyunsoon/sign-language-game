import react from "@vitejs/plugin-react";
import { loadEnv } from "vite";
import { defineConfig } from "vitest/config";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, ".");
  const runtimeEnv = (globalThis as typeof globalThis & {
    process?: { env?: Record<string, string | undefined> };
  }).process?.env;
  return {
    plugins: [react()],
    server: {
      proxy: {
        "/api": {
          target: runtimeEnv?.VITE_P2P_RELAY_TARGET || env.VITE_P2P_RELAY_TARGET || "http://localhost:8091",
          changeOrigin: true,
          ws: true,
          /*
           * changeOrigin은 Host만 바꾸고 Origin 헤더는 그대로 넘긴다.
           * 그래서 배포 백엔드로 프록시하면 서버가 localhost 오리진을 보고
           * CORS로 403을 돌려준다. 프록시는 서버 측 요청이라 CORS를 지킬
           * 이유가 없으므로 Origin을 떼고 보낸다.
           *
           * 로컬 백엔드로 프록시할 때는 CORS 검사가 걸리지 않아 영향이 없다.
           */
          configure: (proxy) => {
            // @types/node를 쓰지 않는 프로젝트라 ProxyServer가 상속한 EventEmitter의
            // 타입이 잡히지 않는다. 위 runtimeEnv처럼 쓰는 만큼만 좁혀서 선언한다.
            const events = proxy as unknown as {
              on: (
                event: "proxyReq",
                listener: (proxyReq: {
                  removeHeader: (name: string) => void;
                }) => void,
              ) => void;
            };

            events.on("proxyReq", (proxyReq) => {
              proxyReq.removeHeader("origin");
            });
          },
        },
      },
    },
    test: {
      environment: "node",
    },
  };
});
