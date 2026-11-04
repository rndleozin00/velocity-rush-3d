import * as THREE from "three";

export function makeCar(spec, color = spec.color) {
  const group = new THREE.Group();
  const paint = new THREE.MeshStandardMaterial({
    color,
    roughness: 0.3,
    metalness: 0.65,
  });
  const dark = new THREE.MeshStandardMaterial({
    color: "#121923",
    roughness: 0.65,
  });
  const glass = new THREE.MeshStandardMaterial({
    color: "#152f42",
    metalness: 0.75,
    roughness: 0.18,
  });
  const chrome = new THREE.MeshStandardMaterial({
    color: "#a7b5bb",
    metalness: 0.85,
    roughness: 0.25,
  });
  const wheels = [];
  const width = 1.95 + (spec.shape % 3) * 0.08;
  const length = 4.25 + (spec.shape % 4) * 0.15;
  const box = (w, h, d, x, y, z, material) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    return mesh;
  };
  const body = box(width, 0.45, length, 0, 0.65, 0, paint);
  const bodyVertices = body.geometry.attributes.position;
  for (let i = 0; i < bodyVertices.count; i++) {
    const z = bodyVertices.getZ(i),
      y = bodyVertices.getY(i);
    bodyVertices.setX(i, bodyVertices.getX(i) * (z > 0 ? 0.91 : 0.97));
    if (y > 0) bodyVertices.setY(i, y - (z > 0 ? 0.09 : 0));
  }
  body.geometry.computeVertexNormals();
  box(width * 0.95, 0.23, length * 0.92, 0, 0.38, 0, dark);
  const hood = box(width * 0.94, 0.16, 1.45, 0, 0.91, 1.23, paint);
  hood.rotation.x = -0.06;
  const cabin = box(width * 0.77, 0.55, 2.05, 0, 1.07, -0.24, glass);
  const vertices = cabin.geometry.attributes.position;
  for (let i = 0; i < vertices.count; i++)
    if (vertices.getY(i) > 0) {
      vertices.setZ(i, vertices.getZ(i) * 0.52 - 0.16);
      vertices.setX(i, vertices.getX(i) * 0.86);
    }
  cabin.geometry.computeVertexNormals();
  box(width * 0.65, 0.055, 1.05, 0, 1.37, -0.4, paint);
  for (const side of [-1, 1]) {
    const pillar = box(
      0.065,
      0.54,
      0.085,
      side * width * 0.345,
      1.1,
      -0.45,
      paint,
    );
    pillar.rotation.z = side * 0.16;
    box(0.12, 0.16, 1.35, side * width * 0.48, 0.36, 0, dark);
    box(0.28, 0.12, 0.3, side * (width / 2 + 0.12), 1.05, 0.38, paint);
    box(0.14, 0.025, 0.75, side * width * 0.31, 0.945, 1.22, dark);
    for (const z of [-1.4, 1.35]) {
      const pivot = new THREE.Group();
      pivot.position.set(side * (width / 2), 0.48, z);
      group.add(pivot);
      const tire = new THREE.Mesh(
        new THREE.CylinderGeometry(0.46, 0.46, 0.29, 16),
        dark,
      );
      tire.rotation.z = Math.PI / 2;
      tire.castShadow = true;
      pivot.add(tire);
      const rim = new THREE.Mesh(
        new THREE.CylinderGeometry(0.3, 0.3, 0.305, 8),
        chrome,
      );
      rim.rotation.z = Math.PI / 2;
      pivot.add(rim);
      wheels.push({ pivot, tire, rim, front: z > 0 });
    }
  }
  const headlight = new THREE.MeshStandardMaterial({
    color: "#d9fcff",
    emissive: "#b4e4ff",
    emissiveIntensity: 1.7,
  });
  const brake = new THREE.MeshStandardMaterial({
    color: "#ff2e2e",
    emissive: "#ff1000",
    emissiveIntensity: 0.7,
  });
  for (const x of [-0.68, 0.68]) {
    box(0.48, 0.12, 0.055, x, 0.77, length / 2 + 0.02, headlight);
    box(0.55, 0.1, 0.055, x, 0.77, -length / 2 - 0.02, brake);
    box(0.16, 0.13, 0.15, x, 0.4, -length / 2, chrome);
  }
  box(width * 0.7, 0.14, 0.07, 0, 0.5, length / 2 + 0.01, dark);
  box(width + 0.08, 0.06, 0.55, 0, 0.31, length / 2 - 0.15, dark);
  box(width * 0.72, 0.15, 0.12, 0, 0.38, -length / 2 - 0.05, dark);
  if ([1, 4, 5, 6, 7, 8].includes(spec.shape)) {
    for (const x of [-0.65, 0.65]) box(0.08, 0.4, 0.12, x, 1.1, -1.85, dark);
    box(width + 0.18, 0.09, 0.48, 0, 1.33, -1.85, paint);
  }
  group.userData = { wheels, brake, paint };
  return group;
}

export class Car {
  constructor(spec, color, name, human = -1) {
    this.spec = spec;
    this.mesh = makeCar(spec, color);
    this.name = name;
    this.human = human;
    this.position = new THREE.Vector3();
    this.heading = 0;
    this.speed = 0;
    this.steer = 0;
    this.sample = 0;
    this.offset = 0;
    this.color = color;
    this.finish = false;
  }
  animate(dt, brake) {
    this.mesh.position.copy(this.position);
    this.mesh.rotation.y = this.heading;
    this.mesh.rotation.z =
      -this.steer * Math.min(Math.abs(this.speed) / 75, 1) * 0.035;
    for (const wheel of this.mesh.userData.wheels) {
      wheel.tire.rotation.x += (this.speed * dt) / 0.46;
      wheel.rim.rotation.x += (this.speed * dt) / 0.46;
      wheel.pivot.rotation.y = wheel.front ? this.steer * 0.3 : 0;
    }
    this.mesh.userData.brake.emissiveIntensity = brake ? 3.5 : 0.65;
  }
}
