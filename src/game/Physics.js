import * as THREE from "three";
export function stepCar(car, controls, track, dt) {
  const s = car.spec,
    near = track.nearest(car.position),
    off = near.distance > track.data.width / 2;
  const top = s.speed / 3.6;
  const acceleration =
    (27.78 / s.zero) * (s.power / 560) ** 0.12 * (s.torque / 650) ** 0.08;
  const traction = s.drive === "AWD" ? 1.05 : 0.98;
  if (controls.throttle)
    car.speed +=
      acceleration * traction * (1 - 0.65 * Math.max(0, car.speed / top)) * dt;
  if (controls.brake) {
    if (car.speed > 0.7) car.speed -= (13 + s.brakes * 0.16) * dt;
    else car.speed = Math.max(-9, car.speed - 5 * dt);
  }
  car.speed -= car.speed * (off ? 1.5 : 0.022) * dt;
  car.speed = THREE.MathUtils.clamp(car.speed, -9, top * (off ? 0.42 : 1));
  car.steer = THREE.MathUtils.damp(car.steer, controls.steer, 8, dt);
  const speedFactor =
    Math.min(Math.abs(car.speed) / 9, 1) / (1 + Math.abs(car.speed) / 43);
  car.heading +=
    car.steer *
    (1.25 + s.handling / 110) *
    speedFactor *
    Math.sign(car.speed) *
    dt;
  // Aderência e peso alteram a perda de velocidade em curvas fortes.
  car.speed *=
    1 -
    ((Math.abs(car.steer) * Math.abs(car.speed)) / top) *
      (1 - s.grip / 135) *
      (s.weight / 1480) *
      dt *
      0.6;
  car.position.x += Math.sin(car.heading) * car.speed * dt;
  car.position.z += Math.cos(car.heading) * car.speed * dt;
  const current = track.nearest(car.position),
    limit = track.data.width / 2 + 2.3;
  let impact = false;
  if (current.distance > limit) {
    car.position
      .copy(current.center)
      .addScaledVector(current.normal, Math.sign(current.offset) * limit);
    if (Math.abs(car.speed) > 8) impact = true;
    car.speed *= 0.65;
  }
  car.sample = current.t;
  car.offset = current.offset;
  car.animate(dt, controls.brake);
  return impact;
}
export function collideCars(cars, dt) {
  let hit = false;
  for (let i = 0; i < cars.length; i++)
    for (let j = i + 1; j < cars.length; j++) {
      const a = cars[i],
        b = cars[j];
      if (a.position.distanceToSquared(b.position) > 25) continue;
      let penetration = 0,
        normal = null;
      // Duas esferas por carro aproximam uma cápsula comprida, evitando sobrepor capô e traseira.
      for (const frontA of [-1.15, 1.15])
        for (const frontB of [-1.15, 1.15]) {
          const pa = a.position
            .clone()
            .add(
              new THREE.Vector3(
                Math.sin(a.heading) * frontA,
                0,
                Math.cos(a.heading) * frontA,
              ),
            );
          const pb = b.position
            .clone()
            .add(
              new THREE.Vector3(
                Math.sin(b.heading) * frontB,
                0,
                Math.cos(b.heading) * frontB,
              ),
            );
          const delta = pb.sub(pa),
            distance = delta.length();
          if (distance < 2.05 && 2.05 - distance > penetration) {
            penetration = 2.05 - distance;
            normal =
              distance > 0.001
                ? delta.divideScalar(distance)
                : new THREE.Vector3(1, 0, 0);
          }
        }
      if (normal) {
        const correction = normal.multiplyScalar(penetration * 0.5);
        a.position.sub(correction);
        b.position.add(correction);
        const avg = (a.speed + b.speed) / 2;
        a.speed = THREE.MathUtils.lerp(a.speed, avg, Math.min(1, dt * 8));
        b.speed = THREE.MathUtils.lerp(b.speed, avg, Math.min(1, dt * 8));
        hit = true;
      }
    }
  return hit;
}
