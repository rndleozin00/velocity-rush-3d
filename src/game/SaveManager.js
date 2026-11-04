const defaults = () => ({
  car: 0,
  color: "#ff583d",
  track: 0,
  quality: "auto",
  volume: 0.3,
  wins: 0,
  races: 0,
  records: {},
  championship: null,
});
export class SaveManager {
  constructor(storage) {
    try {
      this.storage = storage ?? globalThis.localStorage;
      this.data = {
        ...defaults(),
        ...JSON.parse(this.storage.getItem("velocity-rush-v1") || "{}"),
      };
    } catch {
      this.data = defaults();
    }
    this.data.car = Math.max(0, Math.min(8, Number(this.data.car) || 0));
    this.data.track = Math.max(0, Math.min(3, Number(this.data.track) || 0));
    this.data.volume = Math.max(0, Math.min(1, Number(this.data.volume) || 0));
    if (!this.data.records || typeof this.data.records !== "object")
      this.data.records = {};
  }
  save() {
    try {
      this.storage.setItem("velocity-rush-v1", JSON.stringify(this.data));
      return true;
    } catch {
      return false;
    }
  }
  result(track, time, bestLap, position, eligible = true) {
    this.data.races++;
    if (position === 1) this.data.wins++;
    if (eligible) {
      const previous = this.data.records[track] || {};
      this.data.records[track] = {
        time: Math.min(previous.time || Infinity, time),
        lap: Math.min(previous.lap || Infinity, bestLap),
      };
    }
    return this.save();
  }
}
