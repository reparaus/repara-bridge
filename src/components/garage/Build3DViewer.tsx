/**
 * Real-time 3D build preview (React Three Fiber).
 *
 * Asset honesty: the only 3D vehicle available today is Kenney's CC0 "sedan"
 * (public/models, license in KENNEY-LICENSE.txt). It is ALWAYS labelled as a
 * fallback, never as the driver's car. A licensed exact/trim asset plugs in via
 * VEHICLE_ASSETS without changing the configurator.
 */
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { ContactShadows, Environment, Lightformer, OrbitControls, useGLTF } from "@react-three/drei";
import { Suspense, useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";

export type WheelStyle = "stock" | "dark" | "racing";
export type VisualConfig = { paint: string | null; wheel: WheelStyle; rideHeightIn: number };
export const DEFAULT_VISUAL: VisualConfig = { paint: null, wheel: "stock", rideHeightIn: 0 };
export type CameraView = "three_quarter" | "front" | "side" | "rear" | "top";
export type AssetMatch = "exact" | "trim" | "model" | "fallback" | "unavailable";

export const VEHICLE_ASSETS = {
  fallback_sedan: { url: "/models/sedan.glb", match: "fallback" as AssetMatch, license: "CC0 — Kenney Car Kit" },
};
const WHEEL_URLS: Record<Exclude<WheelStyle, "stock">, string> = {
  dark: "/models/wheel-dark.glb",
  racing: "/models/wheel-racing.glb",
};
// Model is ~1.3 units long for a ~190 in sedan → ~0.007 units per inch.
const UNITS_PER_INCH = 0.007;

const VIEWS: Record<CameraView, [number, number, number]> = {
  three_quarter: [2.6, 1.4, 3.0],
  front: [0, 1.2, 4.8],
  side: [5, 1.0, 0],
  rear: [0, 1.4, -4.8],
  top: [0.01, 5.6, 0],
};

function Car({ config }: { config: VisualConfig }) {
  const { scene } = useGLTF(VEHICLE_ASSETS.fallback_sedan.url);
  const dark = useGLTF(WHEEL_URLS.dark);
  const racing = useGLTF(WHEEL_URLS.racing);
  const car = useMemo(() => scene.clone(true), [scene]);
  const bodyMat = useRef<THREE.MeshStandardMaterial | null>(null);
  const swaps = useRef<THREE.Object3D[]>([]);

  useEffect(() => {
    const body = car.getObjectByName("body");
    body?.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) {
        m.castShadow = true;
        if (!bodyMat.current) bodyMat.current = (m.material as THREE.MeshStandardMaterial).clone();
        m.material = bodyMat.current;
      }
    });
  }, [car]);

  useEffect(() => {
    if (bodyMat.current) {
      bodyMat.current.color.set(config.paint ?? "#ffffff");
      bodyMat.current.metalness = config.paint ? 0.35 : 0;
      bodyMat.current.roughness = config.paint ? 0.35 : 0.8;
    }
  }, [config.paint, car]);

  useEffect(() => {
    swaps.current.forEach((s) => s.removeFromParent());
    swaps.current = [];
    const src = config.wheel === "dark" ? dark.scene : config.wheel === "racing" ? racing.scene : null;
    for (const name of ["wheel-front-left", "wheel-front-right", "wheel-back-left", "wheel-back-right"]) {
      const node = car.getObjectByName(name);
      if (!node) continue;
      node.visible = !src;
      if (src) {
        const w = src.clone(true);
        w.position.copy(node.position);
        w.quaternion.copy(node.quaternion);
        if (name.includes("left") && node.quaternion.equals(new THREE.Quaternion())) w.rotation.y = Math.PI;
        car.add(w);
        swaps.current.push(w);
      }
    }
  }, [config.wheel, car, dark.scene, racing.scene]);

  const body = useRef<THREE.Object3D | null>(null);
  useEffect(() => {
    body.current = car.getObjectByName("body") ?? null;
  }, [car]);
  const baseY = useRef<number | null>(null);
  useFrame((_, raw) => {
    const b = body.current;
    if (!b) return;
    if (baseY.current == null) baseY.current = b.position.y;
    const target = baseY.current + config.rideHeightIn * UNITS_PER_INCH;
    b.position.y += (target - b.position.y) * (1 - Math.exp(-10 * Math.min(raw, 0.05)));
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

export default function Build3DViewer({ config, view, viewNonce }: { config: VisualConfig; view: CameraView; viewNonce: number }) {
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
        <Car config={config} />
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

useGLTF.preload(VEHICLE_ASSETS.fallback_sedan.url);
