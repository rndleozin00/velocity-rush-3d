export class InputManager {
  constructor(onAction) {
    this.keys = new Set();
    this.touch = new Set();
    window.addEventListener("keydown", (e) => {
      if (e.target.matches("input,select,textarea")) return;
      if (
        ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " "].includes(e.key)
      )
        e.preventDefault();
      this.keys.add(e.code);
      if (!e.repeat && ["Escape", "KeyP", "KeyC", "KeyR"].includes(e.code))
        onAction(e.code);
    });
    window.addEventListener("keyup", (e) => this.keys.delete(e.code));
    window.addEventListener("blur", () => {
      this.clear();
      onAction("blur");
    });
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) {
        this.clear();
        onAction("blur");
      }
    });
  }
  clear() {
    this.keys.clear();
    this.touch.clear();
  }
  controls(player) {
    const keys =
      player === 0
        ? ["KeyW", "KeyS", "KeyA", "KeyD"]
        : ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"];
    const active = (i) =>
      this.keys.has(keys[i]) ||
      (player === 0 && this.touch.has(["gas", "brake", "left", "right"][i]));
    return {
      throttle: active(0),
      brake: active(1),
      steer: Number(active(2)) - Number(active(3)),
    };
  }
  bindTouch(root) {
    for (const button of root.querySelectorAll("[data-control]")) {
      const key = button.dataset.control;
      button.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        button.setPointerCapture(e.pointerId);
        this.touch.add(key);
        button.classList.add("pressed");
      });
      const release = () => {
        this.touch.delete(key);
        button.classList.remove("pressed");
      };
      button.addEventListener("pointerup", release);
      button.addEventListener("pointercancel", release);
      button.addEventListener("lostpointercapture", release);
    }
  }
}
