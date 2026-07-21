import { useEffect, useState } from "react";
import type { LineRaceInputContext, LineRaceInputState } from "../recognition";
import type { SignDecoderSnapshot } from "../../recognition/temporal";
import type { LineRaceUserFeedbackView } from "./LineRaceActionFeedback";
import { LineRaceFeedbackPresenter } from "./LineRaceFeedbackPresenter";

export function useLineRaceFeedback(
  presenter: LineRaceFeedbackPresenter,
  inputs: {
    readonly input: LineRaceInputState;
    readonly getContext: () => LineRaceInputContext;
    readonly getDecoderSnapshot: () => SignDecoderSnapshot;
    readonly minimumCandidateVotes: number;
    readonly aiConnected: boolean;
    readonly gameConnected: boolean;
  },
): LineRaceUserFeedbackView {
  const { input, getContext, getDecoderSnapshot, minimumCandidateVotes, aiConnected, gameConnected } = inputs;
  const [view, setView] = useState(() => presenter.getView());
  useEffect(() => presenter.subscribe(setView), [presenter]);
  useEffect(() => {
    const update = () => {
      const context = getContext();
      presenter.update({ input, context, decoder: getDecoderSnapshot(), minimumCandidateVotes, aiConnected, gameConnected, now: context.now });
    };
    update();
    const timer = window.setInterval(update, 100);
    return () => window.clearInterval(timer);
  }, [aiConnected, gameConnected, getContext, getDecoderSnapshot, input, minimumCandidateVotes, presenter]);
  return view;
}
