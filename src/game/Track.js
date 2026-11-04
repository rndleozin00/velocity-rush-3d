import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
export const SAMPLES = 640;
export class Track {
  constructor(data, light = false, geometryOnly = false) {
    this.data = data;
    this.group = new THREE.Group();
    this.curve = new THREE.CatmullRomCurve3(
      data.points.map(([x, z]) => new THREE.Vector3(x, 0, z)),
      true,
      "catmullrom",
      0.45,
    );
    this.points = this.curve.getSpacedPoints(SAMPLES).slice(0, -1);
    this.length = this.curve.getLength();
    this.tangents = this.points.map((p, i) =>
      this.points[(i + 1) % SAMPLES]
        .clone()
        .sub(this.points[(i + SAMPLES - 1) % SAMPLES])
        .normalize(),
    );
    this.normals = this.tangents.map((t) => new THREE.Vector3(t.z, 0, -t.x));
    if (!geometryOnly) {
      this.build(light);
      this.batch();
    }
  }
  at(t, offset = 0) {
    const f = (((t % 1) + 1) % 1) * SAMPLES,
      i = Math.floor(f),
      next = (i + 1) % SAMPLES;
    return this.points[i]
      .clone()
      .lerp(this.points[next], f - i)
      .addScaledVector(this.normals[i], offset);
  }
  tangent(t) {
    return this.tangents[Math.floor((((t % 1) + 1) % 1) * SAMPLES)].clone();
  }
  nearest(position) {
    let distance = Infinity,
      index = 0,
      fraction = 0;
    // Projeção nos segmentos evita saltos de checkpoint causados pela amostragem.
    for (let i = 0; i < SAMPLES; i++) {
      const a = this.points[i],
        b = this.points[(i + 1) % SAMPLES];
      const dx = b.x - a.x,
        dz = b.z - a.z;
      const t = THREE.MathUtils.clamp(
        ((position.x - a.x) * dx + (position.z - a.z) * dz) /
          (dx * dx + dz * dz),
        0,
        1,
      );
      const d =
        (position.x - a.x - dx * t) ** 2 + (position.z - a.z - dz * t) ** 2;
      if (d < distance) {
        distance = d;
        index = i;
        fraction = t;
      }
    }
    const center = this.points[index]
      .clone()
      .lerp(this.points[(index + 1) % SAMPLES], fraction);
    return {
      t: (index + fraction) / SAMPLES,
      index,
      distance: Math.sqrt(distance),
      offset: position.clone().sub(center).dot(this.normals[index]),
      center,
      normal: this.normals[index],
    };
  }
  ribbon(inner, outer, material, height = 0.02) {
    const vertices = [],
      indices = [];
    for (let i = 0; i <= SAMPLES; i++) {
      const p = this.points[i % SAMPLES],
        n = this.normals[i % SAMPLES];
      for (const o of [inner, outer])
        vertices.push(p.x + n.x * o, height, p.z + n.z * o);
      if (i < SAMPLES) {
        const k = i * 2;
        indices.push(k, k + 2, k + 1, k + 1, k + 2, k + 3);
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(vertices, 3),
    );
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    const mesh = new THREE.Mesh(geometry, material);
    mesh.receiveShadow = true;
    this.group.add(mesh);
  }
  build(light) {
    const { data } = this,
      half = data.width / 2;
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(4500, 4500),
      new THREE.MeshStandardMaterial({ color: data.ground, roughness: 1 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.12;
    ground.receiveShadow = true;
    this.group.add(ground);
    const asphalt = new THREE.MeshStandardMaterial({
      color: data.id === "city" ? "#252d40" : "#343b42",
      roughness: 0.93,
      side: THREE.DoubleSide,
    });
    this.ribbon(-half, half, asphalt);
    const edge = new THREE.MeshStandardMaterial({
      color: "#d8ddd5",
      side: THREE.DoubleSide,
    });
    this.ribbon(-half + 0.3, -half + 0.48, edge, 0.04);
    this.ribbon(half - 0.48, half - 0.3, edge, 0.04);
    const railMat = new THREE.MeshStandardMaterial({
      color: data.id === "city" ? "#5db4c6" : "#adb6b5",
      metalness: 0.6,
      roughness: 0.45,
    });
    const box = (w, h, d, mat, x, y, z, angle = 0) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      m.position.set(x, y, z);
      m.rotation.y = angle;
      m.castShadow = !light;
      this.group.add(m);
      return m;
    };
    for (let i = 0; i < SAMPLES; i += 4) {
      const p = this.points[i],
        n = this.normals[i],
        t = this.tangents[i],
        angle = Math.atan2(t.x, t.z);
      box(0.18, 0.015, 2.8, edge, p.x, 0.045, p.z, angle);
      for (const side of [-1, 1]) {
        const curbMat = new THREE.MeshStandardMaterial({
          color: (i / 4) % 2 ? "#e5e6dc" : data.accent,
        });
        box(
          0.7,
          0.07,
          3.5,
          curbMat,
          p.x + n.x * side * (half - 0.03),
          0.05,
          p.z + n.z * side * (half - 0.03),
          angle,
        );
        box(
          0.18,
          0.65,
          (this.length / SAMPLES) * 4 + 0.1,
          railMat,
          p.x + n.x * side * (half + 3),
          0.8,
          p.z + n.z * side * (half + 3),
          angle,
        );
      }
    }
    const start = this.at(0),
      t = this.tangent(0),
      angle = Math.atan2(t.x, t.z);
    const startGroup = new THREE.Group();
    startGroup.position.copy(start);
    startGroup.rotation.y = angle;
    this.group.add(startGroup);
    for (let i = 0; i < 12; i++)
      for (let j = 0; j < 2; j++) {
        const m = new THREE.Mesh(
          new THREE.BoxGeometry(data.width / 12, 0.025, 1),
          new THREE.MeshStandardMaterial({
            color: (i + j) % 2 ? "#17212c" : "#f0f0df",
          }),
        );
        m.position.set(-half + ((i + 0.5) * data.width) / 12, 0.07, j - 0.5);
        startGroup.add(m);
      }
    const arch = new THREE.MeshStandardMaterial({ color: "#19222c" });
    for (const side of [-1, 1]) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.5, 7, 0.6), arch);
      m.position.set(side * (half + 1.5), 3.5, 0);
      startGroup.add(m);
    }
    const gantry = new THREE.Mesh(
      new THREE.BoxGeometry(data.width + 3.5, 1, 0.7),
      arch,
    );
    gantry.position.y = 7;
    startGroup.add(gantry);
    const canvas = document.createElement("canvas");
    canvas.width = 1024;
    canvas.height = 96;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#19222c";
    ctx.fillRect(0, 0, 1024, 96);
    ctx.fillStyle = "#d8ed72";
    ctx.font = "bold 48px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("VELOCITY  /  RUSH", 512, 65);
    const banner = new THREE.Mesh(
      new THREE.PlaneGeometry(data.width + 2.5, 0.85),
      new THREE.MeshBasicMaterial({
        map: new THREE.CanvasTexture(canvas),
        side: THREE.DoubleSide,
      }),
    );
    banner.position.set(0, 7, -0.36);
    banner.rotation.y = Math.PI;
    startGroup.add(banner);
    // Marcos luminosos tornam os próximos portões identificáveis sem bloquear a pista.
    for (let g = 1; g < 8; g++)
      for (const side of [-1, 1]) {
        const p = this.at(g / 8, side * (half + 1));
        box(
          0.3,
          3,
          0.3,
          new THREE.MeshStandardMaterial({
            color: data.accent,
            emissive: data.accent,
            emissiveIntensity: 0.5,
          }),
          p.x,
          1.5,
          p.z,
        );
      }
    this.decorate(box, light);
  }
  decorate(box, light) {
    const id = this.data.id;
    const rand = (i) => {
      const x = Math.sin(i * 127.1 + 31.7) * 43758.5453;
      return x - Math.floor(x);
    };
    const foliage = new THREE.MeshStandardMaterial({
      color: id === "coast" ? "#476a50" : "#345f50",
    });
    const trunk = new THREE.MeshStandardMaterial({ color: "#6e5945" });
    const sand = new THREE.MeshStandardMaterial({
      color: "#c4935e",
      flatShading: true,
    });
    for (let i = 0; i < (light ? 70 : 135); i++) {
      const side = i % 2 ? 1 : -1,
        p = this.at(
          rand(i + 1),
          side * (this.data.width / 2 + 10 + rand(i + 5) * 100),
        );
      if (this.nearest(p).distance < this.data.width / 2 + 7) continue;
      if (id === "city") {
        const height = 12 + rand(i + 8) * 80;
        const mat = new THREE.MeshStandardMaterial({
          color: new THREE.Color().setHSL(0.6, 0.18, 0.1 + rand(i) * 0.14),
        });
        box(10 + rand(i + 9) * 10, height, 12, mat, p.x, height / 2, p.z);
        const glow = new THREE.MeshStandardMaterial({
          color: i % 3 ? "#55bfdf" : "#bc68de",
          emissive: i % 3 ? "#55bfdf" : "#bc68de",
          emissiveIntensity: 1,
        });
        for (let y = 5; y < height; y += 7)
          box(9, 0.3, 12.1, glow, p.x, y, p.z);
      } else if (id === "desert") {
        const m = new THREE.Mesh(
          new THREE.SphereGeometry(12 + rand(i) * 25, 8, 5),
          sand,
        );
        m.scale.set(1, 0.3 + rand(i + 1) * 0.5, 1);
        m.position.copy(p);
        this.group.add(m);
        if (i % 4 === 0) {
          box(0.8, 5, 0.8, foliage, p.x, 2.5, p.z);
          box(3, 0.6, 0.6, foliage, p.x + 0.5, 3, p.z);
        }
      } else {
        const palm = id === "coast",
          height = palm ? 7 + rand(i) * 4 : 4 + rand(i) * 5;
        box(0.5, height, 0.5, trunk, p.x, height / 2, p.z);
        if (palm)
          for (let k = 0; k < 5; k++) {
            const leaf = box(
              0.8,
              0.15,
              6,
              foliage,
              p.x,
              height,
              p.z,
              k * Math.PI * 0.4,
            );
            leaf.rotation.x = 0.18;
          }
        else {
          const m = new THREE.Mesh(
            new THREE.ConeGeometry(3, height, 7),
            foliage,
          );
          m.position.set(p.x, height, p.z);
          m.castShadow = !light;
          this.group.add(m);
        }
      }
    }
    if (id === "coast") {
      const water = new THREE.Mesh(
        new THREE.PlaneGeometry(2500, 3500),
        new THREE.MeshStandardMaterial({
          color: "#549baf",
          metalness: 0.4,
          roughness: 0.3,
        }),
      );
      water.rotation.x = -Math.PI / 2;
      water.position.set(-1400, -0.08, 0);
      this.group.add(water);
    }
    if (id === "mountain")
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2;
        const m = new THREE.Mesh(
          new THREE.ConeGeometry(100 + (i % 3) * 40, 140 + (i % 4) * 30, 5),
          new THREE.MeshStandardMaterial({
            color: i % 2 ? "#7a8990" : "#8f9d9d",
            flatShading: true,
          }),
        );
        m.position.set(Math.sin(a) * 650, 35, Math.cos(a) * 650);
        this.group.add(m);
      }
    if (id === "city") {
      const p = this.at(0.16),
        t = this.tangent(0.16),
        a = Math.atan2(t.x, t.z);
      const g = new THREE.Group();
      g.position.copy(p);
      g.rotation.y = a;
      const mat = new THREE.MeshStandardMaterial({
        color: "#151b2a",
        side: THREE.DoubleSide,
      });
      for (const side of [-1, 1]) {
        const m = new THREE.Mesh(new THREE.BoxGeometry(0.8, 7, 24), mat);
        m.position.set(side * (this.data.width / 2 + 1), 3.5, 0);
        g.add(m);
      }
      const roof = new THREE.Mesh(
        new THREE.BoxGeometry(this.data.width + 3, 0.6, 24),
        mat,
      );
      roof.position.y = 7;
      g.add(roof);
      this.group.add(g);
    }
  }
  batch() {
    // Cenário estático é agrupado por material para reduzir chamadas de desenho no celular.
    this.group.updateMatrixWorld(true);
    const groups = new Map(),
      original = [];
    this.group.traverse((object) => {
      if (!object.isMesh || object.material.map) return;
      const m = object.material,
        key = [
          m.type,
          m.color.getHex(),
          m.emissive?.getHex(),
          m.emissiveIntensity,
          m.roughness,
          m.metalness,
          m.side,
        ].join("/");
      if (!groups.has(key)) groups.set(key, { material: m, geometries: [] });
      const geometry = object.geometry.clone().applyMatrix4(object.matrixWorld);
      geometry.deleteAttribute("uv");
      groups.get(key).geometries.push(geometry);
      original.push(object);
    });
    for (const object of original) {
      object.removeFromParent();
      object.geometry.dispose();
    }
    const retained = new Set();
    for (const { material, geometries } of groups.values()) {
      const mesh = new THREE.Mesh(mergeGeometries(geometries), material);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.group.add(mesh);
      retained.add(material);
      geometries.forEach((g) => g.dispose());
    }
    for (const object of original)
      if (!retained.has(object.material)) object.material.dispose();
  }
  dispose() {
    this.group.traverse((o) => {
      o.geometry?.dispose();
      if (o.material)
        for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
          m.map?.dispose();
          m.dispose();
        }
    });
  }
}
