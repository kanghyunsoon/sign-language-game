import { Component, type ErrorInfo, type ReactNode } from "react";
import styles from "./LineRaceGamePage.module.css";

interface Props {
  readonly children: ReactNode;
  readonly resetKey: string;
  readonly onRetry: () => void;
  readonly onLobby: () => void;
}

interface State { readonly failed: boolean; }

export class LineRaceGameErrorBoundary extends Component<Props, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State { return { failed: true }; }

  componentDidCatch(_error: Error, _info: ErrorInfo): void {
    // The fallback is intentional; renderer failures must not escape to the app root.
  }

  componentDidUpdate(previous: Props): void {
    if (this.state.failed && previous.resetKey !== this.props.resetKey)
      this.setState({ failed: false });
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return <section className={styles.panel} role="alert">
      <h2>경기 화면을 복구할 수 없습니다</h2>
      <p>서버 경기 상태를 다시 불러오거나 로비로 돌아가 주세요.</p>
      <div className={styles.actions}>
        <button type="button" onClick={this.props.onRetry}>다시 불러오기</button>
        <button type="button" onClick={this.props.onLobby}>로비 복귀</button>
      </div>
    </section>;
  }
}
