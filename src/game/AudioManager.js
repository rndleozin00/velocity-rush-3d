export class AudioManager {
  constructor(volume) {
    this.volume = volume;
  }
  start() {
    try {
      if (!this.context) {
        this.context = new AudioContext();
        this.master = this.context.createGain();
        this.master.gain.value = this.volume;
        this.master.connect(this.context.destination);
        this.engine = this.context.createOscillator();
        this.engine.type = "sawtooth";
        this.filter = this.context.createBiquadFilter();
        this.filter.type = "lowpass";
        this.filter.frequency.value = 550;
        this.gain = this.context.createGain();
        this.gain.gain.value = 0;
        this.engine.connect(this.filter);
        this.filter.connect(this.gain);
        this.gain.connect(this.master);
        this.engine.start();
      }
      this.context.resume();
    } catch {
      /* Áudio indisponível não impede a corrida. */
    }
  }
  setVolume(value) {
    this.volume = value;
    if (this.master) this.master.gain.value = value;
  }
  update(speed, running) {
    if (!this.context) return;
    this.engine.frequency.setTargetAtTime(
      40 + Math.abs(speed) * 2.1,
      this.context.currentTime,
      0.08,
    );
    this.gain.gain.setTargetAtTime(
      running ? 0.045 : 0,
      this.context.currentTime,
      0.08,
    );
  }
  beep(frequency = 600, duration = 0.12) {
    if (!this.context) return;
    const oscillator = this.context.createOscillator(),
      gain = this.context.createGain(),
      now = this.context.currentTime;
    oscillator.frequency.value = frequency;
    oscillator.connect(gain);
    gain.connect(this.master);
    gain.gain.setValueAtTime(0.12, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
    oscillator.start(now);
    oscillator.stop(now + duration);
  }
}
