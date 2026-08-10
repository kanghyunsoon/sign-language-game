import type { LineRaceMatchSnapshot } from "../contracts";import type { NetworkLineRaceController } from "./NetworkLineRaceController";
export class LineRaceSnapshotApplier { constructor(private readonly controller:NetworkLineRaceController){} apply(snapshot:LineRaceMatchSnapshot){this.controller.applySnapshot(snapshot);} }
