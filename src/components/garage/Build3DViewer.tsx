/**
 * Real-time 3D build preview (React Three Fiber). CLAUDE.md §22b.
 *
 * The car comes from the asset registry (src/lib/build3d/assets.ts): a licensed
 * model of the driver's exact vehicle when one exists, otherwise Kenney's CC0
 * sedan, always labelled as a fallback. Wheels/tires are generated from real
 * dimensions and sized against the model's own stock wheel, so proportions hold
 * on any model. Paint, tint and hood act on the asset's named slots.
 */
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { ContactShadows, Environment, Lightformer, OrbitControls, useGLTF } from "@react-three/drei";
import { Suspense, useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";

import { FALLBACK_SEDAN, type VehicleAsset } from "@/lib/build3d/assets";
import { lipPositionsMm, overallDiameterIn } from "@/lib/build3d/fitment";
import type { StockFitment } from "@/lib/build3d/stock-fitment";
import type { PaintFinish, VisualConfig } from "@/lib/build3d/visual-config";
import { buildWheel } from "./procedural-wheel";

export type { VisualConfig } from "@/lib/build3d/visual-config";
export type CameraView = "three_quarter" | "front" | "side" | "rear" | "top";

/** Used only when the vehicle's stock tire size is unknown. */
const GENERIC_STOCK_DIAMETER_IN = 26;

const VIEWS: Record<CameraView, [number, number, number]> = {
  three_quarter: [2.6, 1.4, 3.0],
  front: [0, 1.2, 4.8],
  side: [5, 1.0, 0],
  rear: [0, 1.4, -4.8],
  top: [0.01, 5.6, 0],
};

const PAINT: Record<PaintFinish, Partial<THREE.MeshPhysicalMaterialParameters>> = {
  gloss: { metalness: 0.1, roughness: 0.18, clearcoat: 1, clearcoatRoughness: 0.05 },
  metallic: { metalness: 0.65, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.08 },
  matte: { metalness: 0.05, roughness: 0.85, clearcoat: 0 },
  pearl: { metalness: 0.35, roughness: 0.22, clearcoat: 1, clearcoatRoughness: 0.05, iridescence: 0.35, sheen: 1, sheenColor: new THREE.Color("#ffffff") },
};

let carbonTexture: THREE.Texture | null = null;
function carbonWeave(): THREE.Texture {
  if (carbonTexture) return carbonTexture;
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d")!;
  for (let y = 0; y < 8; y++)
    for (let x = 0; x < 8; x++) {
      const shade = (x + y) % 2 ? 28 : 46;
      const grad = g.createLinearGradient(x * 8, y * 8, x * 8 + 8, y * 8 + 8);
      grad.addColorStop(0, `rgb(${shade},${shade},${shade + 4})`);
      grad.addColorStop(1, `rgb(${shade - 12},${shade - 12},${shade - 8})`);
      g.fillStyle = grad;
      g.fillRect(x * 8, y * 8, 8, 8);
    }
  carbonTexture = new THREE.CanvasTexture(c);
  carbonTexture.wrapS = carbonTexture.wrapT = THREE.RepeatWrapping;
  carbonTexture.repeat.set(6, 6);
  carbonTexture.colorSpace = THREE.SRGBColorSpace;
  return carbonTexture;
}

function meshesOf(root: THREE.Object3D | undefined): THREE.Mesh[] {
  const out: THREE.Mesh[] = [];
  root?.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) out.push(o as THREE.Mesh);
  });
  return out;
}

/** halfWidthUnits: half the model's stock wheel width, i.e. where its outer face sits. */
type Slot = { node: THREE.Object3D; outboard: 1 | -1; diameterUnits: number; halfWidthUnits: number };

function Car({ config, asset, stock }: { config: VisualConfig; asset: VehicleAsset; stock: StockFitment | null }) {
  const { scene } = useGLTF(asset.url);
  const car = useMemo(() => scene.clone(true), [scene]);

  // One-time setup: own materials for the slots we change, wheel geometry.
  const parts = useMemo(() => {
    const bodyMeshes = asset.body.flatMap((n) => meshesOf(car.getObjectByName(n)));
    const original = bodyMeshes[0]?.material as THREE.MeshStandardMaterial | undefined;
    const paint = new THREE.MeshPhysicalMaterial({ map: original?.map ?? null, color: "#ffffff" });
    bodyMeshes.forEach((m) => {
      m.castShadow = true;
      m.material = paint;
    });
    const glass = new THREE.MeshPhysicalMaterial({ color: "#0b0d10", transparent: true, roughness: 0.05, metalness: 0.2 });
    const glassMeshes = asset.glass.flatMap((n) => meshesOf(car.getObjectByName(n)));
    const glassOriginal = glassMeshes.map((m) => m.material);
    const hoodMeshes = asset.hood.flatMap((n) => meshesOf(car.getObjectByName(n)));
    const carbon = new THREE.MeshPhysicalMaterial({ map: carbonWeave(), metalness: 0.3, roughness: 0.35, clearcoat: 1, clearcoatRoughness: 0.04 });

    const slots: Slot[] = Object.values(asset.wheels).flatMap((name) => {
      const node = car.getObjectByName(name);
      if (!node) return [];
      const size = new THREE.Box3().setFromObject(node).getSize(new THREE.Vector3());
      return [{ node, outboard: node.position.x >= 0 ? 1 : -1, diameterUnits: Math.max(size.y, size.z), halfWidthUnits: size.x / 2 } as Slot];
    });
    const stockDiameterIn = stock ? overallDiameterIn(stock.tire) : GENERIC_STOCK_DIAMETER_IN;
    const upi = slots.length ? slots[0]!.diameterUnits / stockDiameterIn : 0.02;
    const bodyRoots = asset.body.map((n) => car.getObjectByName(n)).filter(Boolean) as THREE.Object3D[];
    return { paint, glass, glassMeshes, glassOriginal, hoodMeshes, carbon, slots, upi, bodyRoots, stockDiameterIn };
  }, [car, asset, stock]);

  // Paint colour + finish.
  useEffect(() => {
    parts.paint.setValues({ ...PAINT[config.paintFinish] });
    parts.paint.color.set(config.paint ?? "#ffffff");
    parts.paint.needsUpdate = true;
  }, [parts, config.paint, config.paintFinish]);

  // Tint: lower visible-light % = darker glass.
  useEffect(() => {
    parts.glassMeshes.forEach((m, i) => {
      if (config.tintPct === null) m.material = parts.glassOriginal[i]!;
      else {
        parts.glass.opacity = Math.min(0.95, Math.max(0.25, 1 - config.tintPct / 100));
        m.material = parts.glass;
      }
    });
  }, [parts, config.tintPct]);

  // Hood swap.
  useEffect(() => {
    parts.hoodMeshes.forEach((m) => {
      m.material = config.hood === "carbon" ? parts.carbon : parts.paint;
    });
  }, [parts, config.hood]);

  // Wheels: generated from real sizes, placed at each slot, offset applied.
  const lift = useRef(0);
  useEffect(() => {
    const custom = config.wheelDesign !== "stock" && config.wheelSpec && config.tireSpec;
    const added: THREE.Object3D[] = [];
    lift.current = 0;
    for (const slot of parts.slots) {
      slot.node.visible = !custom;
      if (!custom) continue;
      const wheel = buildWheel({
        wheel: config.wheelSpec!,
        tire: config.tireSpec!,
        design: config.wheelDesign as Exclude<typeof config.wheelDesign, "stock">,
        finish: config.wheelFinish,
        upi: parts.upi,
      });
      const stockRadius = slot.diameterUnits / 2;
      const newRadius = (overallDiameterIn(config.tireSpec!) / 2) * parts.upi;
      // Anchor to the model's stock wheel face, then move the outer lip by the
      // real change in lip position (width + offset). Unknown stock width:
      // assume the same width, so only the offset change moves it.
      const next = lipPositionsMm(config.wheelSpec!);
      const lipDeltaMm = !stock
        ? 0
        : stock.wheel.widthIn !== null
          ? next.outer - lipPositionsMm({ ...stock.wheel, widthIn: stock.wheel.widthIn }).outer
          : stock.wheel.offsetMm - config.wheelSpec!.offsetMm;
      const outerFace = slot.halfWidthUnits + (lipDeltaMm / 25.4) * parts.upi;
      const halfNew = ((config.wheelSpec!.widthIn / 2) * parts.upi);
      wheel.position.set(slot.node.position.x + slot.outboard * (outerFace - halfNew), slot.node.position.y - stockRadius + newRadius, slot.node.position.z);
      if (slot.outboard < 0) wheel.rotation.y = Math.PI;
      car.add(wheel);
      added.push(wheel);
      lift.current = newRadius - stockRadius;
    }
    return () => {
      added.forEach((w) => {
        w.removeFromParent();
        w.traverse((o) => {
          const m = o as THREE.Mesh;
          if (m.isMesh) {
            m.geometry.dispose();
            (m.material as THREE.Material).dispose();
          }
        });
      });
    };
  }, [car, parts, stock, config.wheelDesign, config.wheelFinish, config.wheelSpec, config.tireSpec]);

  // Body height: bigger tires lift it; ride height lowers/raises it. Eased.
  const baseY = useRef<number[] | null>(null);
  useFrame((_, raw) => {
    if (!baseY.current) baseY.current = parts.bodyRoots.map((b) => b.position.y);
    const target = lift.current + config.rideHeightIn * parts.upi;
    const k = 1 - Math.exp(-10 * Math.min(raw, 0.05));
    parts.bodyRoots.forEach((b, i) => {
      const goal = baseY.current![i]! + target;
      b.position.y += (goal - b.position.y) * k;
    });
  });

  return <primitive object={car} scale={1.2} />;
}

function CameraRig({ view, nonce, controls }: { view: CameraView; nonce: number; controls: React.RefObject<OrbitControlsImpl | null> }) {
  const { camera } = useThree();
  const target = useRef<THREE.Vector3 | null>(null);
  useEffect(() => {
    target.current = new THREE.Vector3(...VIEWS[view]);
  }, [view, nonce]);
  useFrame((_, raw) => {
    if (!target.current) return;
    camera.position.lerp(target.current, 1 - Math.exp(-6 * Math.min(raw, 0.05)));
    controls.current?.update();
    if (camera.position.distanceTo(target.current) < 0.01) target.current = null;
  });
  return null;
}

export default function Build3DViewer({
  config,
  view,
  viewNonce,
  asset = FALLBACK_SEDAN,
  stock = null,
}: {
  config: VisualConfig;
  view: CameraView;
  viewNonce: number;
  asset?: VehicleAsset;
  stock?: StockFitment | null;
}) {
  const controls = useRef<OrbitControlsImpl | null>(null);
  return (
    <Canvas shadows dpr={[1, 2]} camera={{ position: VIEWS.three_quarter, fov: 40 }} className="touch-none">
      <color attach="background" args={["#16181b"]} />
      <hemisphereLight intensity={0.6} groundColor="#222" />
      <directionalLight position={[3, 5, 2]} intensity={1.6} castShadow shadow-mapSize-width={1024} shadow-mapSize-height={1024} />
      <Environment>
        <Lightformer intensity={2} position={[0, 4, 0]} scale={[6, 6, 1]} rotation-x={Math.PI / 2} />
        <Lightformer intensity={1} color="#cfd8e3" position={[-4, 1, 0]} rotation-y={Math.PI / 2} scale={[10, 1, 1]} />
        <Lightformer intensity={1} color="#e8dccb" position={[4, 1, 0]} rotation-y={-Math.PI / 2} scale={[10, 1, 1]} />
      </Environment>
      <Suspense fallback={null}>
        <Car config={config} asset={asset} stock={stock} />
      </Suspense>
      <mesh rotation-x={-Math.PI / 2} receiveShadow>
        <circleGeometry args={[5, 64]} />
        <meshStandardMaterial color="#26292e" roughness={0.9} />
      </mesh>
      <ContactShadows position={[0, 0.005, 0]} opacity={0.6} scale={6} blur={2} far={1} />
      <OrbitControls ref={controls} makeDefault enablePan={false} minDistance={2.2} maxDistance={8} maxPolarAngle={Math.PI / 2.05} target={[0, 0.3, 0]} />
      <CameraRig view={view} nonce={viewNonce} controls={controls} />
    </Canvas>
  );
}

useGLTF.preload(FALLBACK_SEDAN.url);
