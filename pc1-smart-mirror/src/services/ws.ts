export interface WsExerciseUpdate {
  type: string;
  session_id: string;
  count: number;
  state: string;
  feedback: string;
  posture_errors: string[];
  stability_score: number;
  person_count: number;
  target_status: string;
  target_confidence: number;
  detected_type: string;
  exercise_confidence: number;
  goal_mismatch: boolean;
  measurement_quality: string;
  measurement_confidence: number;
  count_left?: number | null;
  count_right?: number | null;
}

type UpdateHandler = (msg: WsExerciseUpdate) => void;

export class SessionWs {
  private ws: WebSocket | null = null;
  private sessionId: string;
  private handler: UpdateHandler;

  constructor(wsUrl: string, sessionId: string, handler: UpdateHandler) {
    this.sessionId = sessionId;
    this.handler = handler;
    this.ws = new WebSocket(wsUrl);
    this.ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data as string) as WsExerciseUpdate;
        if (msg.session_id === this.sessionId) {
          this.handler(msg);
        }
      } catch {
        // ignore malformed messages
      }
    };
  }

  close() {
    this.ws?.close();
    this.ws = null;
  }
}
