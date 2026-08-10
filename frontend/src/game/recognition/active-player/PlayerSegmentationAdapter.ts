import type { PersonTrack, PoseDetection } from "./activePlayerTypes";
import type { SegmentationMask } from "./handOwnershipTypes";
export interface PlayerSegmentationAdapter { update(activePlayerTrack: PersonTrack, poseResult: readonly PoseDetection[]): void; getMask(): SegmentationMask | null; getPointMembership(x: number, y: number): number | undefined; dispose(): void; }
export class NoOpPlayerSegmentationAdapter implements PlayerSegmentationAdapter { update():void{} getMask():null{return null;} getPointMembership():undefined{return undefined;} dispose():void{} }
