import type { LineRaceServerEvent } from "../contracts";import type { NetworkLineRaceController } from "../core/NetworkLineRaceController";
export class LineRaceEventDispatcher {constructor(private readonly controller:NetworkLineRaceController){}dispatch(event:LineRaceServerEvent){return this.controller.apply(event);}}
