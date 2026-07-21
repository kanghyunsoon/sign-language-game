// @vitest-environment jsdom
import {render,waitFor} from "@testing-library/react";
import {StrictMode} from "react";
import {afterEach,describe,expect,it,vi} from "vitest";
import type {SharedGameCameraSession} from "../../media/camera/SharedGameCameraSession";
import type {PythonWebSocketSignRecognizer} from "../websocket/PythonWebSocketSignRecognizer";
import {DefaultGameRecognitionSession} from "./DefaultGameRecognitionSession";
import {useGameRecognitionSession} from "./useGameRecognitionSession";

afterEach(()=>vi.restoreAllMocks());
describe("useGameRecognitionSession",()=>{
  it("survives the StrictMode setup-cleanup-setup probe",async()=>{
    const start=vi.spyOn(DefaultGameRecognitionSession.prototype,"start").mockResolvedValue();
    const dispose=vi.spyOn(DefaultGameRecognitionSession.prototype,"dispose").mockResolvedValue();
    const camera={} as SharedGameCameraSession,recognizer={} as PythonWebSocketSignRecognizer;
    function Probe(){useGameRecognitionSession(recognizer,camera);return <span>recognition alive</span>;}
    const view=render(<StrictMode><Probe/></StrictMode>);
    await new Promise(resolve=>setTimeout(resolve,10));
    expect(view.getByText("recognition alive")).toBeTruthy();
    expect(start).toHaveBeenCalledTimes(2);
    expect(dispose).not.toHaveBeenCalled();
    view.unmount();
    await waitFor(()=>expect(dispose).toHaveBeenCalledTimes(1));
  });
});
