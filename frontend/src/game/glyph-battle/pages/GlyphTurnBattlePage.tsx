import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { useGameModuleContext } from "../../app/GameModuleContext";
import { GameVideoTile } from "../../media/components/GameVideoTile";
import { HandCamera, PythonWebSocketSignRecognizer, useGameRecognitionSession, useGameRecognitionSnapshot } from "../../recognition";
import { GlyphDuelModel } from "../duel/GlyphDuelModel";
import { GlyphTurnCommandGateway } from "../duel/GlyphTurnCommandGateway";
import styles from "./LineRaceGamePage.module.css";

const symbols = ["ㄱ", "ㄴ", "ㄷ", "ㄹ", "ㅁ", "ㅂ", "ㅅ", "ㅇ", "ㅈ"] as const;

/** Active human-vs-human screen. All choices and authoritative events use WebRTC DataChannel. */
export function GlyphTurnBattlePage() {
  const { matchId = "" } = useParams();
  const navigate = useNavigate();
  const { user, config, glyphTurnTransport, lineRaceMediaSession, sharedCameraSession, activePlayerSession } = useGameModuleContext();
  const model = useMemo(() => new GlyphDuelModel(user.userId), [user.userId, matchId]);
  const recognizer = useMemo(() => new PythonWebSocketSignRecognizer({ url: config.aiWebSocketUrl }), [config.aiWebSocketUrl]);
  const recognition = useGameRecognitionSession(recognizer, sharedCameraSession, activePlayerSession);
  const recognitionSnapshot = useGameRecognitionSnapshot(recognition);
  const [view, setView] = useState(() => model.getView());
  const [error, setError] = useState<string | null>(null);
  const [stream, setStream] = useState(() => sharedCameraSession.getStream());
  const channelOpen = lineRaceMediaSession?.getGameDataChannel?.()?.isOpen() === true;

  useEffect(() => {
    if (!glyphTurnTransport || !lineRaceMediaSession || !matchId) return;
    const receive = glyphTurnTransport.subscribe((event) => { if (model.ingestGlyphTurn(event)) setView(model.getView()); });
    const media = lineRaceMediaSession.subscribe(() => setStream(sharedCameraSession.getStream()));
    void glyphTurnTransport.connect({ url: "webrtc-datachannel", roomId: matchId, playerId: user.userId, matchId })
      .then(() => glyphTurnTransport.requestSnapshot(matchId))
      .catch((cause) => setError(cause instanceof Error ? cause.message : "대전 채널 연결에 실패했습니다."));
    return () => { receive(); media(); glyphTurnTransport.disconnect(); };
  }, [glyphTurnTransport, lineRaceMediaSession, matchId, model, sharedCameraSession, user.userId]);

  useEffect(() => recognition.subscribe((event) => {
    if (event.type !== "SIGN_CONFIRMED" || !symbols.includes(event.symbol as typeof symbols[number]) || view.phase !== "PLANNING") return;
    choose(event.symbol);
  }), [recognition, view.phase]);

  const choose = (symbol: string) => {
    if (!glyphTurnTransport || view.phase !== "PLANNING") return;
    try { new GlyphTurnCommandGateway(matchId, glyphTurnTransport).choose(symbol, view.turn); } catch (cause) { setError(cause instanceof Error ? cause.message : "선택을 전송하지 못했습니다."); }
  };
  if (!glyphTurnTransport || !lineRaceMediaSession || !matchId) return <main className={styles.page}><section className={styles.panel}><h1>대전 연결 준비 중</h1><p>상대방과 WebRTC 게임 채널이 연결된 뒤 다시 입장해 주세요.</p><button onClick={() => navigate("/game/line-race")}>로비로</button></section></main>;
  const remote = lineRaceMediaSession.getRemoteParticipants()[0];
  return <main className={styles.page} data-line-race-game="true">
    <header className={styles.header}><div><small>WEBRTC P2P · 동시 비공개 선택</small><h1>수달 턴 대전</h1><p>ROUND {view.turn} · {channelOpen ? "게임 채널 연결됨" : "게임 채널 연결 중"}</p></div><button onClick={() => navigate("/game/line-race")}>나가기</button></header>
    {error ? <p className={styles.error} role="alert">{error}</p> : null}
    <section className={styles.layout}><div className={`${styles.panel} ${styles.canvas}`}><div className={styles.practiceResult}><h2>{view.prompt}</h2><p>내 체력 {view.local.health} · 상대 체력 {view.opponent.health}</p><p>{view.callout}</p>{view.resolvedMoves?.map((move) => <span key={`${move.attackerId}-${move.symbol}`}>{move.symbol} {move.label} · {move.damage} 피해 </span>)}</div></div></section>
    <section className={styles.media}><div className={styles.panel}>{stream ? <HandCamera sharedStream={stream} autoStart activePlayerSession={activePlayerSession} recognitionSession={recognition} performanceMonitor={recognizer.getPerformanceMonitor()} temporalDecoder={recognizer.getTemporalDecoder()} /> : <GameVideoTile kind="LOCAL" label="내 카메라" stream={null} cameraEnabled={false} connectionState="DISCONNECTED" />}</div><div className={styles.side}><section className={styles.panel}><h2>기술 선택</h2><p>{recognitionSnapshot.confirmedSymbol ? `${recognitionSnapshot.confirmedSymbol} 인식 완료` : "지문자를 만들거나 카드를 선택하세요."}</p><div>{symbols.map((symbol) => <button key={symbol} disabled={view.phase !== "PLANNING"} onClick={() => choose(symbol)}>{symbol}</button>)}</div></section><section className={styles.panel}><h2>{remote?.displayName ?? "상대방"}</h2><GameVideoTile kind="REMOTE" label={remote?.displayName ?? "상대방"} stream={remote?.stream ?? null} cameraEnabled={remote?.cameraEnabled ?? false} connectionState={remote?.connectionState ?? "DISCONNECTED"} /></section></div></section>
  </main>;
}
