import type { SignDecoderConfig } from "./SignDecoderConfig";

export class SignReleaseDetector {
  private poseChangedSince: number | null = null;
  private noHandSince: number | null = null;
  private differentSymbol: string | null = null;
  private differentSymbolVotes = 0;

  observePose(distance: number, at: number, config: SignDecoderConfig): boolean {
    if (distance < config.releasePoseDistanceThreshold) {
      this.poseChangedSince = null;
      return false;
    }
    this.poseChangedSince ??= at;
    return at - this.poseChangedSince >= config.releaseMinimumDurationMs;
  }

  observeNoHand(at: number, config: SignDecoderConfig): boolean {
    this.noHandSince ??= at;
    return at - this.noHandSince >= config.noHandReleaseDurationMs;
  }

  observeDifferentSymbol(symbol: string, confirmedSymbol: string, config: SignDecoderConfig): boolean {
    if (symbol === confirmedSymbol) {
      this.differentSymbol = null;
      this.differentSymbolVotes = 0;
      return false;
    }
    if (this.differentSymbol === symbol) this.differentSymbolVotes += 1;
    else {
      this.differentSymbol = symbol;
      this.differentSymbolVotes = 1;
    }
    return this.differentSymbolVotes >= config.differentSymbolReleaseVotes;
  }

  handPresent(): void { this.noHandSince = null; }
  reset(): void {
    this.poseChangedSince = null;
    this.noHandSince = null;
    this.differentSymbol = null;
    this.differentSymbolVotes = 0;
  }
}
