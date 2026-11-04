import * as THREE from "three";
import { cars as specs } from "../data/cars.js";
import { tracks } from "../data/tracks.js";
import { Car, makeCar } from "./Car.js";
import { Track } from "./Track.js";
import { Progress } from "./Progress.js";
import { stepCar, collideCars } from "./Physics.js";
import { driveAI } from "./AIController.js";
import { InputManager } from "./InputManager.js";
import { AudioManager } from "./AudioManager.js";

export class Game {
  constructor(canvas, save, events) {
    this.save = save;
    this.events = events;
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: "high-performance",
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.scene = new THREE.Scene();
    this.cameras = [0, 1].map(
      () => new THREE.PerspectiveCamera(60, 1, 0.1, 2200),
    );
    this.sun = new THREE.DirectionalLight("#fff1d4", 3);
    this.sun.position.set(-70, 120, 50);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(1024, 1024);
    Object.assign(this.sun.shadow.camera, {
      left: -85,
      right: 85,
      top: 85,
      bottom: -85,
      near: 1,
      far: 400,
    });
    this.sun.shadow.bias = -0.001;
    this.scene.add(
      new THREE.HemisphereLight("#e1efff", "#5e5649", 2.2),
      this.sun,
      this.sun.target,
    );
    this.input = new InputManager((key) => this.action(key));
    this.audio = new AudioManager(save.data.volume);
    this.mode = "menu";
    this.cameraMode = 0;
    this.clock = new THREE.Clock();
    this.accumulator = 0;
    this.frame = 0;
    this.previewAngle = 0;
    this.drag = false;
    window.addEventListener("resize", () => this.resize());
    canvas.addEventListener("webglcontextlost", (e) => {
      e.preventDefault();
      this.pause();
      events.error(
        "O navegador perdeu o contexto 3D. Recarregue a página para continuar.",
      );
    });
    canvas.addEventListener("pointerdown", (e) => {
      if (this.mode === "menu") {
        this.drag = true;
        this.lastX = e.clientX;
        canvas.setPointerCapture(e.pointerId);
      }
    });
    canvas.addEventListener("pointermove", (e) => {
      if (this.drag) {
        this.previewAngle += (e.clientX - this.lastX) * 0.01;
        this.lastX = e.clientX;
      }
    });
    canvas.addEventListener("pointerup", () => (this.drag = false));
    canvas.addEventListener("pointercancel", () => (this.drag = false));
    this.quality();
    this.preview(save.data.car, save.data.color);
    this.resize();
    this.renderer.setAnimationLoop(() => this.tick());
  }
  quality() {
    const q = this.save.data.quality;
    this.light =
      q === "low" ||
      (q === "auto" &&
        (matchMedia("(pointer: coarse)").matches ||
          navigator.hardwareConcurrency <= 4));
    this.renderer.setPixelRatio(
      Math.min(devicePixelRatio, this.light ? 1 : 1.6),
    );
    this.renderer.shadowMap.enabled = !this.light;
    this.resize();
  }
  resize() {
    this.width = window.innerWidth;
    this.height = window.innerHeight;
    this.renderer.setSize(this.width, this.height);
    if (this.previewCar && this.mode === "menu")
      this.previewCar.scale.setScalar(this.width < 800 ? 1.15 : 1.6);
    for (const c of this.cameras) {
      c.aspect =
        this.width /
        (this.height /
          (this.config?.players === 2 && this.mode !== "menu" ? 2 : 1));
      c.updateProjectionMatrix();
    }
  }
  disposeObject(object) {
    if (!object) return;
    this.scene.remove(object);
    object.traverse((o) => {
      o.geometry?.dispose();
      if (o.material)
        for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
          m.map?.dispose();
          m.dispose();
        }
    });
  }
  clear() {
    if (this.track) {
      this.scene.remove(this.track.group);
      this.track.dispose();
      this.track = null;
    }
    for (const c of this.cars || []) this.disposeObject(c.mesh);
    this.cars = [];
    this.disposeObject(this.showroom);
    this.showroom = null;
  }
  preview(index, color) {
    this.clear();
    this.mode = "menu";
    this.config = null;
    this.audio.update(0, false);
    this.scene.background = new THREE.Color("#101a24");
    this.scene.fog = new THREE.Fog("#101a24", 25, 110);
    this.showroom = new THREE.Group();
    this.previewCar = makeCar(specs[index], color);
    this.previewCar.scale.setScalar(1.6);
    this.showroom.add(this.previewCar);
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(300, 300),
      new THREE.MeshStandardMaterial({
        color: "#16232d",
        metalness: 0.4,
        roughness: 0.4,
      }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.02;
    ground.receiveShadow = true;
    this.showroom.add(ground);
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(5.4, 5.46, 96),
      new THREE.MeshBasicMaterial({ color: "#d4ed72", side: THREE.DoubleSide }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.01;
    this.showroom.add(ring);
    const grid = new THREE.GridHelper(100, 40, "#29404c", "#20313d");
    grid.position.y = -0.01;
    this.showroom.add(grid);
    this.scene.add(this.showroom);
    this.sun.color.set("#e6f1ff");
    this.sun.intensity = 3;
    this.sun.position.set(-20, 35, 20);
    this.sun.target.position.set(0, 0, 0);
    this.resize();
  }
  start(config) {
    this.clear();
    this.config = config;
    this.mode = "countdown";
    this.time = 0;
    this.countdown = 3.7;
    this.lastBeep = 4;
    this.resultSent = false;
    this.accumulator = 0;
    this.input.clear();
    this.cameraReady = false;
    const data = tracks[config.track];
    this.track = new Track(data, this.light);
    this.scene.add(this.track.group);
    this.scene.background = new THREE.Color(data.sky);
    this.scene.fog = new THREE.Fog(data.fog, 160, this.light ? 650 : 1100);
    this.sun.intensity = data.id === "city" ? 1.1 : 3;
    this.sun.color.set(data.id === "coast" ? "#ffd1a3" : "#fff5e4");
    const count = config.mode === "time" ? config.players : 9;
    for (let i = 0; i < count; i++) {
      const human = i < config.players ? i : -1,
        specIndex =
          i === 0
            ? config.car
            : i === 1 && human === 1
              ? (config.car + 1) % 9
              : i;
      const spec = specs[specIndex],
        color = i === 0 ? config.color : spec.color;
      const car = new Car(
        spec,
        color,
        human >= 0
          ? `Jogador ${human + 1}`
          : [
              "",
              "",
              "M. Silva",
              "L. Costa",
              "A. Santos",
              "R. Lima",
              "B. Dias",
              "T. Alves",
              "N. Rocha",
            ][i] || "C. Melo",
        human,
      );
      const start = -(8 + Math.floor(i / 2) * 8) / this.track.length;
      car.position.copy(this.track.at(start, i % 2 ? 3 : -3));
      const tangent = this.track.tangent(start);
      car.heading = Math.atan2(tangent.x, tangent.z);
      car.sample = (start + 1) % 1;
      car.progress = new Progress(start);
      car.animate(0, false);
      this.cars.push(car);
      this.scene.add(car.mesh);
    }
    this.audio.start();
    this.resize();
    this.events.started();
  }
  action(key) {
    if (key === "KeyC") this.cameraMode = (this.cameraMode + 1) % 3;
    else if (key === "KeyR" && this.mode === "race") this.recover(0);
    else if (key === "blur") {
      if (["race", "countdown"].includes(this.mode)) this.pause();
    } else if (["Escape", "KeyP"].includes(key)) {
      if (this.mode === "paused") this.resume();
      else if (["race", "countdown"].includes(this.mode)) this.pause();
    }
  }
  pause() {
    if (!["race", "countdown"].includes(this.mode)) return;
    this.beforePause = this.mode;
    this.mode = "paused";
    this.audio.update(0, false);
    this.input.clear();
    this.events.paused();
  }
  resume() {
    if (this.mode !== "paused") return;
    this.mode = this.beforePause;
    this.clock.getDelta();
    this.input.clear();
    this.events.resumed();
  }
  recover(index) {
    const car = this.cars[index];
    if (!car || car.progress.finished) return;
    const t = car.progress.started
      ? (car.progress.gates - 1) / 8 - 0.001
      : -0.01;
    car.position.copy(this.track.at(t, index ? 3 : -3));
    const tangent = this.track.tangent(t);
    car.heading = Math.atan2(tangent.x, tangent.z);
    car.speed = 0;
    car.progress.previous = ((t % 1) + 1) % 1;
  }
  ranking() {
    return [...this.cars].sort(
      (a, b) => b.progress.score(b.sample) - a.progress.score(a.sample),
    );
  }
  simulate(dt) {
    if (this.mode === "countdown") {
      this.countdown -= dt;
      const n = Math.ceil(this.countdown - 0.7);
      if (n !== this.lastBeep && n >= 0) {
        this.lastBeep = n;
        this.audio.beep(n ? 550 : 1050, n ? 0.12 : 0.3);
      }
      if (this.countdown <= 0) this.mode = "race";
      return;
    }
    if (this.mode !== "race") return;
    this.time += dt;
    let impact = false;
    for (let i = 0; i < this.cars.length; i++) {
      const car = this.cars[i];
      const controls =
        car.human >= 0 && !car.progress.finished
          ? this.input.controls(car.human)
          : driveAI(car, this.track, this.cars, this.config.difficulty, i);
      const hit = stepCar(car, controls, this.track, dt);
      if (car.human >= 0 && hit) impact = true;
      const near = this.track.nearest(car.position);
      car.progress.update(
        near.t,
        near.distance <= this.track.data.width / 2 + 0.5,
        this.time,
        this.config.laps,
      );
    }
    collideCars(this.cars, dt);
    if (impact && this.time - (this.lastImpact || 0) > 0.4) {
      this.audio.beep(95, 0.08);
      this.lastImpact = this.time;
    }
    if (
      this.cars.filter((c) => c.human >= 0).every((c) => c.progress.finished) &&
      !this.resultSent
    ) {
      this.resultSent = true;
      this.mode = "results";
      this.audio.update(0, false);
      this.audio.beep(880, 0.4);
      this.events.finished(this.ranking(), this.time);
    }
  }
  updateCamera(camera, car, dt, snap = false) {
    const forward = new THREE.Vector3(
      Math.sin(car.heading),
      0,
      Math.cos(car.heading),
    );
    const distance = [11, 18, -0.8][this.cameraMode],
      height = [5.4, 8, 1.6][this.cameraMode];
    const target = car.position.clone().addScaledVector(forward, -distance);
    target.y += height;
    if (snap) camera.position.copy(target);
    else camera.position.lerp(target, 1 - Math.exp(-7 * dt));
    camera.lookAt(
      car.position
        .clone()
        .addScaledVector(forward, this.cameraMode === 2 ? 18 : 5.5)
        .add(new THREE.Vector3(0, 1, 0)),
    );
  }
  tick() {
    const dt = Math.min(this.clock.getDelta(), 0.1);
    this.frame++;
    if (this.mode === "menu") {
      if (!this.drag) this.previewAngle += dt * 0.14;
      this.previewCar.rotation.y = this.previewAngle;
      const narrow = this.width < 800;
      this.cameras[0].position.set(narrow ? 8 : 10, 5.2, narrow ? 10 : 12);
      this.cameras[0].lookAt(narrow ? 0 : -3, 0.8, 0);
    } else {
      this.accumulator += dt;
      while (this.accumulator >= 1 / 60) {
        this.simulate(1 / 60);
        this.accumulator -= 1 / 60;
      }
      this.cars.forEach((car, i) => {
        if (i < this.config.players)
          this.updateCamera(this.cameras[i], car, dt, !this.cameraReady);
      });
      this.cameraReady = true;
      const p = this.cars[0].position;
      this.sun.position.set(p.x - 70, 120, p.z + 50);
      this.sun.target.position.copy(p);
      this.audio.update(this.cars[0].speed, this.mode === "race");
      if (this.frame % 5 === 0) this.events.hud(this);
    }
    const split = this.config?.players === 2 && this.mode !== "menu";
    this.renderer.setScissorTest(split);
    if (split) {
      const h = Math.floor(this.height / 2);
      for (let i = 0; i < 2; i++) {
        this.renderer.setViewport(
          0,
          i === 0 ? this.height - h : 0,
          this.width,
          h,
        );
        this.renderer.setScissor(
          0,
          i === 0 ? this.height - h : 0,
          this.width,
          h,
        );
        this.renderer.render(this.scene, this.cameras[i]);
      }
    } else {
      this.renderer.setViewport(0, 0, this.width, this.height);
      this.renderer.render(this.scene, this.cameras[0]);
    }
  }
}
