export const wrap = (value) => ((value % 1) + 1) % 1;
export function signedDelta(a, b) {
  let delta = b - a;
  if (delta > 0.5) delta--;
  if (delta < -0.5) delta++;
  return delta;
}
// Portões devem ser cruzados em ordem e no sentido correto. Um salto na pista não dá crédito.
export class Progress {
  constructor(start) {
    this.previous = wrap(start);
    this.distance = start;
    this.gates = 0;
    this.started = false;
    this.laps = 0;
    this.lastLapAt = 0;
    this.bestLap = Infinity;
    this.finished = false;
    this.finishTime = null;
  }
  update(position, onRoad, time, targetLaps) {
    const delta = signedDelta(this.previous, position);
    const before = this.previous;
    this.previous = position;
    if (!onRoad || delta <= 0 || delta > 0.035 || this.finished) return;
    const gate = (this.gates % 8) / 8;
    const toGate = wrap(gate - before);
    if (toGate > delta + 0.00001) return;
    this.gates++;
    if (gate === 0) {
      if (this.started) {
        this.laps++;
        this.bestLap = Math.min(this.bestLap, time - this.lastLapAt);
        if (this.laps >= targetLaps) {
          this.finished = true;
          this.finishTime = time;
        }
      }
      this.started = true;
      this.lastLapAt = time;
    }
  }
  score(position) {
    if (this.finished) return 10000 - this.finishTime / 10000;
    if (!this.started) return -wrap(-position);
    // O progresso parcial fica limitado ao próximo portão ainda não validado.
    const sector = this.gates - 1;
    const last = (sector % 8) / 8;
    return sector / 8 + Math.min(wrap(position - last), 1 / 8);
  }
}
