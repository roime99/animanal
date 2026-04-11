import { difficultyForLevel, fetchGameStart, type GameQuestion, type LevelNumber } from "./gameApi";

const POINTS_TO_WIN = 10;

function normName(s: string): string {
  return s.trim().toLowerCase();
}

function poolDifficultyLabel(level: number): string {
  if (level <= 3) return "easy";
  if (level <= 6) return "medium";
  return "hard";
}

export type BotMatchEmit = (msg: Record<string, unknown>) => void;

/**
 * Local 1v1 rules matching `backend/services/match_service.py`: same pools as solo endless,
 * image reveal when both sides ready (bot simulates load delay), first correct wins the round,
 * first to POINTS_TO_WIN wins. Emits the same JSON shapes as the online WebSocket.
 */
export class BotMatchController {
  private disposed = false;
  private timeouts: ReturnType<typeof setTimeout>[] = [];
  private roundSeq = 0;
  private endlessLevel = 1;
  private seenNames: string[] = [];
  private batch: GameQuestion[] = [];
  private batchI = 0;
  private hostPoints = 0;
  private guestPoints = 0;
  private current: GameQuestion | null = null;
  private roundPhase: "loading" | "revealed" = "loading";
  private roundResolved = false;
  private hostWrong = false;
  private guestWrong = false;
  private hostImgReady = false;
  private guestImgReady = false;
  private botRevealTimer: ReturnType<typeof setTimeout> | null = null;
  private botGuessTimer: ReturnType<typeof setTimeout> | null = null;
  private matchEnded = false;

  constructor(private emit: BotMatchEmit) {}

  private clearBotTimers(): void {
    if (this.botRevealTimer) clearTimeout(this.botRevealTimer);
    if (this.botGuessTimer) clearTimeout(this.botGuessTimer);
    this.botRevealTimer = null;
    this.botGuessTimer = null;
  }

  dispose(): void {
    this.disposed = true;
    this.clearBotTimers();
    for (const t of this.timeouts) clearTimeout(t);
    this.timeouts = [];
  }

  async start(): Promise<void> {
    this.matchEnded = false;
    this.roundSeq = 0;
    this.endlessLevel = 1;
    this.seenNames = [];
    this.batch = [];
    this.batchI = 0;
    this.hostPoints = 0;
    this.guestPoints = 0;
    this.current = null;
    await this.refillBatch();
    if (this.disposed) return;
    await this.startNextRound();
  }

  private async refillBatch(): Promise<void> {
    const lv = Math.min(10, this.endlessLevel) as LevelNumber;
    const diff = difficultyForLevel(lv);
    const res = await fetchGameStart(diff, { excludeAnimalNames: [...this.seenNames] });
    this.batch = res.questions;
    this.batchI = 0;
  }

  private async startNextRound(): Promise<void> {
    if (this.disposed || this.matchEnded) return;
    if (this.hostPoints >= POINTS_TO_WIN || this.guestPoints >= POINTS_TO_WIN) {
      this.emitMatchEnd();
      return;
    }

    while (this.batchI >= this.batch.length) {
      this.endlessLevel = Math.min(10, this.endlessLevel + 1);
      await this.refillBatch();
      if (this.disposed) return;
      if (!this.batch.length) {
        this.emit({ type: "error", message: "No more questions." });
        this.emitMatchEnd();
        return;
      }
    }

    const q = this.batch[this.batchI]!;
    this.current = q;
    this.roundPhase = "loading";
    this.roundResolved = false;
    this.hostWrong = false;
    this.guestWrong = false;
    this.hostImgReady = false;
    this.guestImgReady = false;
    this.roundSeq += 1;
    this.clearBotTimers();

    const diffLabel = poolDifficultyLabel(this.endlessLevel);
    this.emit({
      type: "round_start",
      round_seq: this.roundSeq,
      endless_level: this.endlessLevel,
      pool_label: diffLabel,
      question: q,
      host_points: this.hostPoints,
      guest_points: this.guestPoints,
      points_to_win: POINTS_TO_WIN,
      image_revealed: false,
    });
  }

  userImageReady(): void {
    if (this.disposed || !this.current || this.roundResolved || this.roundPhase !== "loading") return;
    this.hostImgReady = true;
    if (!this.guestImgReady) {
      const delay = 400 + Math.random() * 700;
      this.botRevealTimer = setTimeout(() => this.botImageReady(), delay);
    }
    this.tryReveal();
  }

  private botImageReady(): void {
    if (this.disposed || !this.current || this.roundResolved || this.roundPhase !== "loading") return;
    this.guestImgReady = true;
    this.tryReveal();
  }

  private tryReveal(): void {
    if (this.roundPhase !== "loading" || this.roundResolved) return;
    if (this.hostImgReady && this.guestImgReady) {
      this.roundPhase = "revealed";
      this.emit({ type: "image_reveal", round_seq: this.roundSeq });
      this.scheduleBotGuess();
    }
  }

  /** Delayed guess: usually correct (~80%) so speed matters; sometimes wrong for variety. */
  private scheduleBotGuess(): void {
    if (this.disposed || !this.current || this.roundResolved) return;
    const base = 1200 + Math.random() * 1800;
    this.botGuessTimer = setTimeout(() => this.botGuessFire(), base);
  }

  private botGuessFire(): void {
    if (this.disposed || !this.current || this.roundResolved || this.roundPhase !== "revealed") return;
    if (this.guestWrong) return;
    const q = this.current;
    const correct = q.correct_answer;
    const wrongChoices = q.options.filter((o) => o !== correct);
    const pickWrong = Math.random() < 0.2 && wrongChoices.length > 0;
    const choice = pickWrong ? wrongChoices[Math.floor(Math.random() * wrongChoices.length)]! : correct;
    this.applyGuess("guest", choice);
  }

  userGuess(choice: string): void {
    if (this.disposed || !this.current || this.roundResolved) return;
    if (this.roundPhase !== "revealed") return;
    if (this.hostWrong) return;
    this.applyGuess("host", choice);
  }

  private applyGuess(role: "host" | "guest", choice: string): void {
    const q = this.current;
    if (!q || this.roundResolved) return;
    if (this.roundPhase !== "revealed") return;
    if (role === "host" && this.hostWrong) return;
    if (role === "guest" && this.guestWrong) return;

    const correct = choice === q.correct_answer;
    if (correct) {
      this.roundResolved = true;
      if (role === "host") this.hostPoints += 1;
      else this.guestPoints += 1;
      const key = normName(q.correct_answer);
      if (key) this.seenNames.push(key);
      this.batchI += 1;
      this.clearBotTimers();
      this.emit({
        type: "round_result",
        round_seq: this.roundSeq,
        reason: "first_correct",
        winner: role,
        correct_answer: q.correct_answer,
        host_points: this.hostPoints,
        guest_points: this.guestPoints,
        points_to_win: POINTS_TO_WIN,
      });
      if (this.hostPoints >= POINTS_TO_WIN || this.guestPoints >= POINTS_TO_WIN) {
        this.emitMatchEnd();
        return;
      }
      const pause = setTimeout(() => void this.startNextRound(), 1550);
      this.timeouts.push(pause);
      return;
    }

    if (role === "host") this.hostWrong = true;
    else this.guestWrong = true;

    this.emit({
      type: "guess_result",
      round_seq: this.roundSeq,
      wrong_role: role,
      host_points: this.hostPoints,
      guest_points: this.guestPoints,
    });

    if (this.hostWrong && this.guestWrong) {
      this.roundResolved = true;
      const key = normName(q.correct_answer);
      if (key) this.seenNames.push(key);
      this.batchI += 1;
      this.clearBotTimers();
      this.emit({
        type: "round_result",
        round_seq: this.roundSeq,
        reason: "both_wrong",
        winner: null,
        correct_answer: q.correct_answer,
        host_points: this.hostPoints,
        guest_points: this.guestPoints,
        points_to_win: POINTS_TO_WIN,
      });
      const pause = setTimeout(() => void this.startNextRound(), 1550);
      this.timeouts.push(pause);
    }
  }

  private emitMatchEnd(): void {
    if (this.matchEnded) return;
    this.matchEnded = true;
    this.clearBotTimers();
    const hp = this.hostPoints;
    const gp = this.guestPoints;
    let rh: string;
    let rg: string;
    if (hp > gp) {
      rh = "win";
      rg = "lose";
    } else if (gp > hp) {
      rh = "lose";
      rg = "win";
    } else {
      rh = "tie";
      rg = "tie";
    }
    this.emit({
      type: "match_end",
      host_points: hp,
      guest_points: gp,
      points_to_win: POINTS_TO_WIN,
      host_result: rh,
      guest_result: rg,
    });
  }
}
