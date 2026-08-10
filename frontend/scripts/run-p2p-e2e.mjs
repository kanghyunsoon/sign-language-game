process.env.VITE_P2P_E2E = "true";
process.env.P2P_E2E_PORT = "8092";
process.env.VITE_P2P_RELAY_TARGET = "http://localhost:8092";
await import("./p2p-e2e-relay.mjs");
await import("../node_modules/vite/bin/vite.js");
