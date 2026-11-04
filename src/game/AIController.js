import * as THREE from "three";
const angleDiff = (a) => Math.atan2(Math.sin(a), Math.cos(a));
export function driveAI(car, track, cars, difficulty, index) {
  const near = track.nearest(car.position),
    look = 10 + Math.max(0, car.speed) * 0.65;
  let lane = Math.sin(index * 2.4) * 2.8;
  for (const other of cars)
    if (
      other !== car &&
      other.position.distanceTo(car.position) < 16 &&
      other.speed < car.speed + 2
    )
      lane = other.offset > 0 ? -3.4 : 3.4;
  const target = track.at(near.t + look / track.length, lane),
    direction = target.sub(car.position);
  const angle = angleDiff(Math.atan2(direction.x, direction.z) - car.heading);
  const forward = track.tangent(near.t),
    future = track.tangent(near.t + (look + 20) / track.length);
  const bend = Math.acos(THREE.MathUtils.clamp(forward.dot(future), -1, 1));
  const ability = [0.67, 0.82, 0.96][difficulty] * (0.94 + (index % 4) * 0.025);
  const desired =
    Math.min(
      car.spec.speed / 3.6,
      (35 + car.spec.grip * 0.32) / (1 + bend * 2.3),
    ) * ability;
  return {
    steer: THREE.MathUtils.clamp(angle * 2.1, -1, 1),
    throttle: car.speed < desired,
    brake: car.speed > desired + 3,
  };
}
