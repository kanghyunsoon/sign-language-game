import type { PoseLandmark } from "./activePlayerTypes";
export interface PoseFeatureExtractor { extract(landmarks: readonly PoseLandmark[]): Float32Array; }
const pairs = [[11,12],[11,13],[13,15],[12,14],[14,16],[11,23],[12,24],[23,24]] as const;
export class NormalizedPoseFeatureExtractor implements PoseFeatureExtractor {
  extract(points: readonly PoseLandmark[]): Float32Array {
    if (points.length < 25) return new Float32Array();
    const shoulder = distance(points[11]!, points[12]!) || 1e-6;
    const shoulderCenter = midpoint(points[11]!, points[12]!); const hipCenter = midpoint(points[23]!, points[24]!);
    const torsoHeight = distance(shoulderCenter, hipCenter) / shoulder;
    const values = pairs.map(([a,b]) => distance(points[a]!, points[b]!) / shoulder);
    values.push(torsoHeight, angle(points[13]!, points[11]!, points[12]!), angle(points[14]!, points[12]!, points[11]!), angle(points[11]!, points[13]!, points[15]!), angle(points[12]!, points[14]!, points[16]!));
    return Float32Array.from(values.map((value) => Number.isFinite(value) ? value : 0));
  }
}
function distance(a:PoseLandmark,b:PoseLandmark){return Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z);}
function midpoint(a:PoseLandmark,b:PoseLandmark):PoseLandmark{return{x:(a.x+b.x)/2,y:(a.y+b.y)/2,z:(a.z+b.z)/2};}
function angle(a:PoseLandmark,b:PoseLandmark,c:PoseLandmark){const ab=[a.x-b.x,a.y-b.y,a.z-b.z],cb=[c.x-b.x,c.y-b.y,c.z-b.z];const d=Math.hypot(...ab)*Math.hypot(...cb);return d?Math.acos(Math.max(-1,Math.min(1,(ab[0]!*cb[0]!+ab[1]!*cb[1]!+ab[2]!*cb[2]!)/d)))/Math.PI:0;}
