import type { GameMediaSession } from "./GameMediaSession";
import { MeshWebRtcMediaSession, type MeshWebRtcMediaSessionOptions } from "../mesh/MeshWebRtcMediaSession";

export interface GameMediaSessionFactory {
  create(): GameMediaSession;
}

export class MeshGameMediaSessionFactory implements GameMediaSessionFactory {
  constructor(private readonly options: MeshWebRtcMediaSessionOptions = {}) {}
  create(): GameMediaSession { return new MeshWebRtcMediaSession(this.options); }
}
