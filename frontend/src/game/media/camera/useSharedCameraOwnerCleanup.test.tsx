// @vitest-environment jsdom
import {render,waitFor} from "@testing-library/react";
import {StrictMode} from "react";
import {describe,expect,it,vi} from "vitest";
import type {SharedGameCameraSession} from "./SharedGameCameraSession";
import {useSharedCameraOwnerCleanup} from "./useSharedCameraOwnerCleanup";

describe("useSharedCameraOwnerCleanup",()=>{it("ignores the StrictMode probe and releases on the real unmount",async()=>{const camera={stop:vi.fn()} as unknown as SharedGameCameraSession;function Probe(){useSharedCameraOwnerCleanup(camera);return <span>camera owner</span>;}const view=render(<StrictMode><Probe/></StrictMode>);await Promise.resolve();expect(camera.stop).not.toHaveBeenCalled();view.unmount();await waitFor(()=>expect(camera.stop).toHaveBeenCalledTimes(1));});});
