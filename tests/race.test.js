import test from "node:test";
import assert from "node:assert/strict";
import { Progress } from "../src/game/Progress.js";
import { SaveManager } from "../src/game/SaveManager.js";
import { Track } from "../src/game/Track.js";
import { Car } from "../src/game/Car.js";
import { stepCar } from "../src/game/Physics.js";
import { driveAI } from "../src/game/AIController.js";
import { cars } from "../src/data/cars.js";
import { tracks } from "../src/data/tracks.js";

function advance(progress, from, to, time = 0, laps = 1) {
  for (let t = from + 0.005; t <= to + 0.00001; t += 0.005) {
    time += 0.1;
    progress.update(((t % 1) + 1) % 1, true, time, laps);
  }
  return time;
}
test("volta exige todos os portões e termina com tempo e melhor volta", () => {
  const p = new Progress(-0.01);
  advance(p, -0.01, 1.01);
  assert.equal(p.laps, 1);
  assert.equal(p.finished, true);
  assert.ok(p.finishTime > 0);
  assert.ok(Number.isFinite(p.bestLap));
});
test("atalho, sentido contrário e portões fora da pista não validam chegada", () => {
  const p = new Progress(-0.01);
  advance(p, -0.01, 0.05);
  p.update(0.8, true, 5, 1);
  advance(p, 0.8, 1.01, 5);
  assert.equal(p.laps, 0);
  assert.equal(p.gates, 1);
  const q = new Progress(-0.01);
  for (let t = 0; t < 1.02; t += 0.01) q.update(t % 1, false, t, 1);
  assert.equal(q.gates, 0);
  const r = new Progress(-0.01);
  for (let t = 0.98; t > 0; t -= 0.01) r.update(t, true, 1, 1);
  assert.equal(r.laps, 0);
});
test("classificação distingue grid, setores e carros que finalizaram", () => {
  const a = new Progress(-0.01),
    b = new Progress(-0.03);
  assert.ok(a.score(0.99) > b.score(0.97));
  advance(a, -0.01, 0.4);
  advance(b, -0.03, 0.2);
  assert.ok(a.score(0.4) > b.score(0.2));
  advance(a, 0.4, 1.01);
  assert.ok(a.score(0.01) > b.score(0.2));
});
test("três voltas precisam de três circuitos completos", () => {
  const p = new Progress(-0.01);
  let time = advance(p, -0.01, 1.01, 0, 3);
  assert.equal(p.finished, false);
  assert.equal(p.laps, 1);
  time = advance(p, 1.01, 2.01, time, 3);
  assert.equal(p.finished, false);
  assert.equal(p.laps, 2);
  advance(p, 2.01, 3.01, time, 3);
  assert.equal(p.finished, true);
  assert.equal(p.laps, 3);
});
test("dificuldade altera de fato a velocidade desejada dos bots", () => {
  const track = new Track(tracks[3], true, true),
    car = new Car(cars[0], cars[0].color, "Bot");
  car.position.copy(track.at(0));
  car.heading = Math.atan2(track.tangent(0).x, track.tangent(0).z);
  car.speed = 30;
  assert.equal(driveAI(car, track, [car], 0, 0).brake, true);
  assert.equal(driveAI(car, track, [car], 2, 0).throttle, true);
});
test("salvamento mantém recorde anterior melhor e tolera armazenamento bloqueado", () => {
  const map = new Map(),
    storage = { getItem: (k) => map.get(k), setItem: (k, v) => map.set(k, v) };
  const s = new SaveManager(storage);
  s.result("coast-1", 60, 60, 1);
  s.result("coast-1", 70, 70, 3);
  const loaded = new SaveManager(storage);
  assert.equal(loaded.data.races, 2);
  assert.equal(loaded.data.wins, 1);
  assert.equal(loaded.data.records["coast-1"].time, 60);
  loaded.result("coast-1", 10, 10, 1, false);
  assert.equal(loaded.data.records["coast-1"].time, 60);
  const blocked = new SaveManager({
    getItem() {
      throw Error("denied");
    },
    setItem() {
      throw Error("denied");
    },
  });
  assert.equal(blocked.save(), false);
});
test("carro acelera, freia, dá ré e barreira impede escapar do circuito", () => {
  const track = new Track(tracks[0], true, true),
    car = new Car(cars[0], cars[0].color, "Teste");
  car.position.copy(track.at(0));
  const tangent = track.tangent(0);
  car.heading = Math.atan2(tangent.x, tangent.z);
  for (let i = 0; i < 60; i++)
    stepCar(car, { throttle: true, brake: false, steer: 0 }, track, 1 / 60);
  assert.ok(car.speed > 5);
  for (let i = 0; i < 180; i++)
    stepCar(car, { throttle: false, brake: true, steer: 0 }, track, 1 / 60);
  assert.ok(car.speed < 0);
  assert.ok(track.nearest(car.position).distance <= track.data.width / 2 + 2.4);
});
for (const data of tracks)
  test(`IA completa ${data.name} com física e checkpoints reais`, () => {
    const track = new Track(data, true, true),
      car = new Car(cars[0], cars[0].color, "Bot"),
      start = -8 / track.length;
    car.position.copy(track.at(start, -3));
    const tangent = track.tangent(start);
    car.heading = Math.atan2(tangent.x, tangent.z);
    car.progress = new Progress(start);
    for (let frame = 0; frame < 60 * 240 && !car.progress.finished; frame++) {
      const controls = driveAI(car, track, [car], 1, 0);
      stepCar(car, controls, track, 1 / 60);
      const near = track.nearest(car.position);
      car.progress.update(
        near.t,
        near.distance <= data.width / 2 + 0.5,
        frame / 60,
        1,
      );
    }
    assert.equal(
      car.progress.finished,
      true,
      `Bot parou em ${car.sample.toFixed(3)}, portão ${car.progress.gates}, velocidade ${car.speed}`,
    );
  });
