/**
 * Wheels and tires generated from real dimensions (three.js, no React), so a
 * size change in inches/millimetres is what the driver sees. Axle = local X;
 * the face (outboard side) points toward +X.
 */
import * as THREE from "three";

import { overallDiameterIn, sidewallIn, type TireSpec, type WheelSpec } from "@/lib/build3d/fitment";
import type { WheelDesign, WheelFinish } from "@/lib/build3d/visual-config";

const FINISHES: Record<WheelFinish, { color: string; metalness: number; roughness: number }> = {
  // Flat faces mirror the dark studio, so painted finishes stay semi-metallic.
  silver: { color: "#d4d8dd", metalness: 0.55, roughness: 0.32 },
  gloss_black: { color: "#16171a", metalness: 0.3, roughness: 0.18 },
  gunmetal: { color: "#4a4f57", metalness: 0.55, roughness: 0.35 },
  bronze: { color: "#9a7444", metalness: 0.6, roughness: 0.32 },
  chrome: { color: "#f2f4f6", metalness: 0.95, roughness: 0.06 },
};

const SPOKES: Record<Exclude<WheelDesign, "stock">, { count: number; width: number; ring?: boolean }> = {
  five_spoke: { count: 5, width: 0.16 },
  ten_spoke: { count: 10, width: 0.08 },
  multi_spoke: { count: 20, width: 0.04 },
  mesh: { count: 16, width: 0.035, ring: true },
};

/** Tire cross-section revolved around the axle. */
function tireGeometry(tire: TireSpec, upi: number): THREE.BufferGeometry {
  const rimR = (tire.rimIn / 2) * upi;
  const outerR = (overallDiameterIn(tire) / 2) * upi;
  const half = ((tire.widthMm / 25.4) / 2) * upi;
  const shoulder = Math.min(sidewallIn(tire) * upi * 0.35, half * 0.4);
  const pts = [
    new THREE.Vector2(rimR, -half * 0.92),
    new THREE.Vector2(outerR - shoulder, -half),
    new THREE.Vector2(outerR, -half + shoulder),
    new THREE.Vector2(outerR, half - shoulder),
    new THREE.Vector2(outerR - shoulder, half),
    new THREE.Vector2(rimR, half * 0.92),
  ];
  // Lathe revolves around Y; rotate so the axle is X.
  return new THREE.LatheGeometry(pts, 64).rotateZ(Math.PI / 2);
}

export function buildWheel(opts: {
  wheel: WheelSpec;
  tire: TireSpec;
  design: Exclude<WheelDesign, "stock">;
  finish: WheelFinish;
  /** Model units per real inch for this asset. */
  upi: number;
}): THREE.Group {
  const { wheel, tire, design, finish, upi } = opts;
  const group = new THREE.Group();
  const metal = new THREE.MeshStandardMaterial(FINISHES[finish]);
  const rubber = new THREE.MeshStandardMaterial({ color: "#151515", roughness: 0.92, metalness: 0 });

  const tireMesh = new THREE.Mesh(tireGeometry(tire, upi), rubber);
  tireMesh.castShadow = true;
  group.add(tireMesh);

  const rimR = (wheel.diameterIn / 2) * upi;
  const width = wheel.widthIn * upi;

  // Barrel (inside of the rim).
  const barrel = new THREE.Mesh(
    new THREE.CylinderGeometry(rimR * 0.97, rimR * 0.97, width * 0.96, 48, 1, true).rotateZ(Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: "#2a2c30", metalness: 0.6, roughness: 0.5, side: THREE.DoubleSide }),
  );
  group.add(barrel);

  // Outer lip.
  const lip = new THREE.Mesh(new THREE.TorusGeometry(rimR * 0.985, rimR * 0.03, 8, 64).rotateY(Math.PI / 2), metal);
  lip.position.x = width / 2;
  group.add(lip);

  // Face: hub + spokes, set slightly inside the lip for a little concavity.
  const faceX = width / 2 - rimR * 0.08;
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(rimR * 0.22, rimR * 0.24, rimR * 0.12, 24).rotateZ(Math.PI / 2), metal);
  hub.position.x = faceX;
  group.add(hub);

  const s = SPOKES[design];
  const spokeLen = rimR * 0.76;
  for (let i = 0; i < s.count; i++) {
    const spoke = new THREE.Mesh(new THREE.BoxGeometry(rimR * 0.07, spokeLen, rimR * s.width * 2), metal);
    spoke.position.set(faceX, 0, 0);
    spoke.geometry.translate(0, rimR * 0.22 + spokeLen / 2, 0);
    // Concave dish: spokes angle inward toward the lip, catching light like real wheels.
    spoke.geometry.rotateZ(0.2);
    spoke.rotation.x = (i / s.count) * Math.PI * 2 + (design === "mesh" && i % 2 ? 0.18 : 0);
    spoke.castShadow = true;
    group.add(spoke);
  }
  if (s.ring) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(rimR * 0.6, rimR * 0.025, 6, 48).rotateY(Math.PI / 2), metal);
    ring.position.x = faceX;
    group.add(ring);
  }
  return group;
}
