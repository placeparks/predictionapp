"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls, Html } from "@react-three/drei";

type Minter = {
  wallet: string;
  level: "Common" | "Rare" | "Epic" | "Legendary";
  wins: number;
  losses: number;
  coherence: number; // 0..100
  winRate: number;   // 0..1
  lat: number | null;
  lon: number | null;
  mintedTier: number;
  mintedAnimal: string | null;
  mintedTokenId: number | null;
  mintedMetadataUrl: string | null;
  mintedAt: string | null;
  totalPredictions: number;
  resolvedPredictions: number;
  unresolvedPredictions: number;
};

type HoverInfo = {
  index: number;
  x: number;
  y: number;
  screenX: number;
  screenY: number;
  isShard?: boolean;
  shardObject?: THREE.Object3D;
} | null;

const LEVEL_SIZE = { Common: 0.6, Rare: 0.8, Epic: 1.0, Legendary: 1.2 };
const LEVEL_COLOR = {
  Common: new THREE.Color("#7dd3fc"),
  Rare: new THREE.Color("#a78bfa"),
  Epic: new THREE.Color("#f59e0b"),
  Legendary: new THREE.Color("#22c55e"),
};

const RADIUS = 8; // globe radius
const NODE_COUNT_CAP = 12000; // safety

function walletSeed(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h += (h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24);
  }
  return Math.abs(h >>> 0) / 2 ** 32;
}

// If lat/lon present, map to sphere; else deterministic Fibonacci mapping by wallet
function positionForMinter(m: Minter, i: number, total: number): THREE.Vector3 {
  if (m.lat != null && m.lon != null) {
    const lat = (m.lat * Math.PI) / 180;
    const lon = (m.lon * Math.PI) / 180;
    const x = Math.cos(lat) * Math.cos(lon);
    const y = Math.sin(lat);
    const z = Math.cos(lat) * Math.sin(lon);
    return new THREE.Vector3(x, y, z).multiplyScalar(RADIUS + 0.05);
  }
  // Fibonacci sphere (deterministic per index + wallet)
  const n = Math.max(1, total);
  const golden = Math.PI * (3 - Math.sqrt(5));
  const seed = walletSeed(m.wallet);
  const k = (i + seed) % n;
  const y = 1 - (k / (n - 1)) * 2; // y from 1 to -1
  const r = Math.sqrt(1 - y * y);
  const theta = golden * k;
  const x = Math.cos(theta) * r;
  const z = Math.sin(theta) * r;
  return new THREE.Vector3(x, y, z).multiplyScalar(RADIUS + 0.05);
}

function NeuralArcs() {
  // faint neural wires orbiting the globe
  const group = useRef<THREE.Group>(null);
  const [curves] = useState(() => {
    const arr: THREE.CatmullRomCurve3[] = [];
    for (let i = 0; i < 60; i++) {
      const a = new THREE.Vector3().randomDirection().multiplyScalar(RADIUS);
      const b = new THREE.Vector3().randomDirection().multiplyScalar(RADIUS);
      const mid = a.clone().add(b).multiplyScalar(0.5).normalize().multiplyScalar(RADIUS * 1.15);
      const curve = new THREE.CatmullRomCurve3([a, mid, b]);
      arr.push(curve);
    }
    return arr;
  });

  return (
    <group ref={group}>
      {curves.map((c, i) => {
        const points = c.getPoints(50);
        const geom = new THREE.BufferGeometry().setFromPoints(points);
        return (
          <primitive key={i} object={new THREE.Line(geom, new THREE.LineBasicMaterial({
            color: "#6366f1",
            transparent: true,
            opacity: 0.22,
            depthWrite: false,
            depthTest: false,
          }))} />
        );
      })}
    </group>
  );
}

function ShardSprite({ 
  minter, 
  index, 
  total,
  shardRefs 
}: { 
  minter: Minter; 
  index: number; 
  total: number;
  shardRefs: React.MutableRefObject<THREE.Points[]>;
}) {
  const [texture, setTexture] = useState<THREE.Texture | null>(null);
  const [_loading, setLoading] = useState(true);
  const pointsRef = useRef<THREE.Points>(null);

  useEffect(() => {
    if (!minter.mintedTokenId) {
      setLoading(false);
      return;
    }

    const loader = new THREE.TextureLoader();
    const imageUrl = `/api/image/${minter.mintedTokenId}.png`;
    
    loader.load(
      imageUrl,
      (loadedTexture) => {
        loadedTexture.colorSpace = THREE.SRGBColorSpace;
        loadedTexture.anisotropy = 4;
        loadedTexture.minFilter = THREE.LinearFilter;
        loadedTexture.magFilter = THREE.LinearFilter;
        setTexture(loadedTexture);
        setLoading(false);
      },
      undefined,
      (error) => {
        console.warn(`Failed to load shard image for token ${minter.mintedTokenId}:`, error);
        setLoading(false);
      }
    );
  }, [minter.mintedTokenId]);

  // Calculate position and scale (always calculate, even if we return early)
  const pos = positionForMinter(minter, index, total).multiplyScalar(1.02);
  const baseSize = LEVEL_SIZE[minter.level] ?? 1;
  // Make shards visible - increased size
  const scale = baseSize * 1.5;
  
  // Calculate glow intensity based on prediction accuracy
  // Use winRate (0-1) and coherence (0-100) to determine glow
  // ALL HOOKS MUST BE CALLED BEFORE ANY CONDITIONAL RETURNS
  const accuracy = useMemo(() => {
    return minter.winRate * 0.7 + (minter.coherence / 100) * 0.3;
  }, [minter.winRate, minter.coherence]);
  
  const glowIntensity = useMemo(() => {
    return Math.max(0, Math.min(1, accuracy));
  }, [accuracy]);
  
  const glowColorArray = useMemo(() => {
    return [1.0, 1.0, 0.8]; // Warm white/yellow glow
  }, []);

  // Custom shader material for circular sprite with glow
  const material = useMemo(() => {
    if (!texture) return null;
    
    try {
      const mat = new THREE.ShaderMaterial({
        uniforms: {
          uTexture: { value: texture },
          uGlowIntensity: { value: glowIntensity },
          uGlowColor: { value: glowColorArray },
        },
        vertexShader: `
          attribute float size;
          
          void main() {
            vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
            // Increase point size multiplier for better visibility
            gl_PointSize = size * (500.0 / -mvPosition.z);
            gl_Position = projectionMatrix * mvPosition;
          }
        `,
        fragmentShader: `
          uniform sampler2D uTexture;
          uniform float uGlowIntensity;
          uniform vec3 uGlowColor;
          
          void main() {
            // Create circular mask from sprite coordinates
            vec2 uv = gl_PointCoord * 2.0 - 1.0;
            float dist = length(uv);
            
            // Circular cutout
            if (dist > 1.0) {
              discard;
            }
            
            // Sample texture (flip vertically to fix upside down issue)
            vec2 flippedCoord = vec2(gl_PointCoord.x, 1.0 - gl_PointCoord.y);
            vec4 texColor = texture2D(uTexture, flippedCoord);
            
            // Brighten the image
            texColor.rgb = pow(texColor.rgb, vec3(0.8)); // Gamma correction to brighten
            texColor.rgb *= 1.3; // Additional brightness multiplier
            
            // Create glow effect based on accuracy
            float glowRadius = 0.82;
            float glowFalloff = 0.18;
            float glow = 0.0;
            
            if (dist > glowRadius) {
              // Outer glow ring
              float glowDist = (dist - glowRadius) / glowFalloff;
              glow = uGlowIntensity * (1.0 - smoothstep(0.0, 1.0, glowDist));
            }
            
            // Combine texture with glow
            vec3 finalColor = mix(texColor.rgb, uGlowColor, glow * 0.5);
            float alpha = texColor.a;
            
            // Add glow to alpha for outer ring
            if (dist > glowRadius) {
              alpha = max(alpha, glow * 0.9);
            }
            
            // Smooth circular edge
            float edge = smoothstep(0.92, 1.0, dist);
            alpha *= (1.0 - edge);
            
            gl_FragColor = vec4(finalColor, alpha);
          }
        `,
        transparent: true,
        depthWrite: false,
        depthTest: false,
        blending: THREE.NormalBlending,
      });
      
      return mat;
    } catch (error) {
      console.error('Error creating shader material:', error);
      return null;
    }
  }, [texture, glowIntensity, glowColorArray]);

  // Update uniforms when values change
  useEffect(() => {
    if (material && texture) {
      try {
        material.uniforms.uTexture.value = texture;
        material.uniforms.uGlowIntensity.value = glowIntensity;
        material.uniforms.uGlowColor.value = glowColorArray;
        material.needsUpdate = true;
      } catch (error) {
        console.error('Error updating material uniforms:', error);
      }
    }
  }, [material, texture, glowIntensity, glowColorArray]);

  const geometry = useMemo(() => {
    const geom = new THREE.BufferGeometry();
    const positions = new Float32Array([0, 0, 0]);
    // Increase point size multiplier for better visibility
    const sizes = new Float32Array([scale * 1.2]);
    geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geom.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
    return geom;
  }, [scale]);

  // Store minter data in the object for hover detection and add to refs array
  useEffect(() => {
    const currentPointsRef = pointsRef.current;
    const currentShardRefs = shardRefs.current;
    
    if (currentPointsRef) {
      currentPointsRef.userData.minterIndex = index;
      currentPointsRef.userData.minter = minter;
      // Add to shard refs array if not already there
      if (!currentShardRefs.includes(currentPointsRef)) {
        currentShardRefs.push(currentPointsRef);
      }
    }
    return () => {
      if (currentPointsRef) {
        const idx = currentShardRefs.indexOf(currentPointsRef);
        if (idx > -1) {
          currentShardRefs.splice(idx, 1);
        }
      }
    };
  }, [index, minter, shardRefs]);

  // NOW we can do conditional returns after all hooks
  if (!minter.mintedTokenId || !texture || !material) return null;

  return (
    <points
      ref={pointsRef}
      key={`${minter.wallet}-shard-${minter.mintedTokenId}`}
      position={pos}
      geometry={geometry}
    >
      <primitive object={material} attach="material" />
    </points>
  );
}

function ShardSprites({ data, shardRefs }: { data: Minter[]; shardRefs: React.MutableRefObject<THREE.Points[]> }) {
  return (
    <group>
      {data.map((minter, index) => (
        <ShardSprite
          key={`${minter.wallet}-${minter.mintedTokenId}`}
          minter={minter}
          index={index}
          total={data.length}
          shardRefs={shardRefs}
        />
      ))}
    </group>
  );
}

function GlobeCore() {
  // Reduce geometry complexity on mobile for better performance
  const [isMobile, setIsMobile] = useState(false);
  
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);
  
  const segments = isMobile ? 32 : 64;
  
  return (
    <mesh>
      <sphereGeometry args={[RADIUS, segments, segments]} />
      <meshStandardMaterial
        color="#172e57"
        roughness={0.65}
        metalness={0.2}
        emissive="#3a65ad"
        emissiveIntensity={0.85}
      />
    </mesh>
  );
}

function useHover(
  rtc: React.MutableRefObject<THREE.InstancedMesh | null>,
  shardRefs: React.MutableRefObject<THREE.Points[]>
) {
  const { gl, camera } = useThree();
  const raycaster = useMemo(() => new THREE.Raycaster(), []);
  const mouse = useMemo(() => new THREE.Vector2(), []);
  const [hover, setHover] = useState<HoverInfo & { isShard?: boolean } | null>(null);

  useEffect(() => {
    const el = gl.domElement;
    const isMobile = window.innerWidth < 768;
    
    const updateHover = (clientX: number, clientY: number) => {
      const rect = el.getBoundingClientRect();
      mouse.x = ((clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(mouse, camera);
      
      // First check shards (they're on top, so prioritize them)
      let hit: THREE.Intersection | null = null;
      let isShard = false;
      
      if (shardRefs.current && shardRefs.current.length > 0) {
        for (const shard of shardRefs.current) {
          if (shard) {
            const shardHits = raycaster.intersectObject(shard, true);
            if (shardHits.length > 0) {
              hit = shardHits[0];
              isShard = true;
              break;
            }
          }
        }
      }
      
      // If no shard hit, check instanced mesh points
      if (!hit && rtc.current) {
        const meshHits = raycaster.intersectObject(rtc.current, true);
        if (meshHits.length > 0 && meshHits[0].instanceId != null) {
          hit = meshHits[0];
          isShard = false;
        }
      }
      
      if (hit) {
        // For shards, get index from userData
        let index = -1;
        if (isShard && hit.object instanceof THREE.Points && hit.object.userData.minterIndex != null) {
          index = hit.object.userData.minterIndex;
        } else if (!isShard && hit.instanceId != null) {
          index = hit.instanceId;
        }
        
        if (index >= 0) {
          setHover({
            index: index,
            x: hit.point.x,
            y: hit.point.y,
            screenX: clientX - rect.left,
            screenY: clientY - rect.top,
            isShard,
            shardObject: isShard ? hit.object : undefined,
          } as HoverInfo & { isShard?: boolean; shardObject?: THREE.Object3D });
        } else {
          setHover(null);
        }
      } else {
        setHover(null);
      }
    };
    
    const onMove = (e: MouseEvent) => {
      updateHover(e.clientX, e.clientY);
    };
    
    const onTouch = (e: TouchEvent) => {
      // Don't preventDefault - let OrbitControls handle rotation
      // Only handle hover if it's a single touch (multi-touch is for zoom)
      if (e.touches.length === 1) {
        const touch = e.touches[0];
        updateHover(touch.clientX, touch.clientY);
      } else {
        setHover(null);
      }
    };
    
    const onLeave = () => setHover(null);
    
    el.addEventListener("mousemove", onMove);
    el.addEventListener("mouseleave", onLeave);
    if (isMobile) {
      el.addEventListener("touchmove", onTouch, { passive: true });
      el.addEventListener("touchend", onLeave, { passive: true });
    }
    
    return () => {
      el.removeEventListener("mousemove", onMove);
      el.removeEventListener("mouseleave", onLeave);
      if (isMobile) {
        el.removeEventListener("touchmove", onTouch);
        el.removeEventListener("touchend", onLeave);
      }
    };
  }, [camera, gl, mouse, raycaster, rtc, shardRefs]);

  return hover;
}

function MintersPoints({ data, shardRefs }: { data: Minter[]; shardRefs: React.MutableRefObject<THREE.Points[]> }) {
  const count = Math.min(data.length, NODE_COUNT_CAP);
  const ref = useRef<THREE.InstancedMesh>(null);
  const hover = useHover(ref, shardRefs);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const [hoverXY, setHoverXY] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    if (!hover) {
      setHoverIdx(null);
      setHoverXY(null);
      return;
    }
    setHoverIdx(hover.index);
    setHoverXY({ x: hover.screenX, y: hover.screenY });
  }, [hover]);

  // per-instance attributes
  const colorArray = useMemo(() => new Float32Array(count * 3), [count]);
  const scaleArray = useMemo(() => new Float32Array(count), [count]);

  // initial placement & attributes
  useEffect(() => {
    if (!ref.current) return;
    const dummy = new THREE.Object3D();

    for (let i = 0; i < count; i++) {
      const m = data[i];
      const pos = positionForMinter(m, i, count);
      dummy.position.copy(pos);
      dummy.lookAt(new THREE.Vector3(0, 0, 0));
      dummy.updateMatrix();
      ref.current.setMatrixAt(i, dummy.matrix);

      const bright =
        Math.sqrt(Math.max(0, m.coherence) / 100) * 0.6 + m.winRate * 0.4; // 0..1
      const base = LEVEL_COLOR[m.level].clone();
      const col = base.lerp(new THREE.Color("#ffffff"), bright * 0.6);
      colorArray[i * 3 + 0] = col.r;
      colorArray[i * 3 + 1] = col.g;
      colorArray[i * 3 + 2] = col.b;

      scaleArray[i] = LEVEL_SIZE[m.level] * (0.8 + bright * 0.8);
    }
    ref.current.instanceMatrix.needsUpdate = true;
    const geometry = ref.current.geometry as THREE.InstancedBufferGeometry;
    if (geometry.attributes.instanceColor) {
      geometry.attributes.instanceColor.needsUpdate = true;
    }
    if (geometry.attributes.instanceScale) {
      geometry.attributes.instanceScale.needsUpdate = true;
    }
  }, [colorArray, count, data, scaleArray]);

  // pulsing animation
  useFrame(({ clock }) => {
    if (!ref.current) return;
    const t = clock.getElapsedTime();
    const dummy = new THREE.Object3D();
    for (let i = 0; i < count; i++) {
      const m = data[i];
      const seed = walletSeed(m.wallet);
      const osc = 1 + 0.12 * Math.sin(t * 1.5 + seed * 20.0);
      ref.current.getMatrixAt(i, dummy.matrix);
      dummy.matrix.decompose(dummy.position, dummy.quaternion, new THREE.Vector3(1, 1, 1));
      dummy.scale.setScalar(scaleArray[i] * osc);
      dummy.updateMatrix();
      ref.current.setMatrixAt(i, dummy.matrix);
    }
    ref.current.instanceMatrix.needsUpdate = true;
  });

  // shader material for glow-ish points
  const material = useMemo(() => {
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uSize: { value: 15.0 },
      },
      vertexShader: `
        uniform float uSize;
        attribute float instanceScale;
        attribute vec3 instanceColor;
        attribute mat4 instanceMatrix;
        varying vec3 vColor;
        void main() {
          vColor = instanceColor;
          vec4 mvPosition = modelViewMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
          gl_PointSize = instanceScale * (uSize / -mvPosition.z);
          gl_Position = projectionMatrix * mvPosition;
        }
      `,
      fragmentShader: `
        varying vec3 vColor;
        void main() {
          // soft round point
          vec2 uv = gl_PointCoord * 2.0 - 1.0;
          float d = dot(uv, uv);
          float alpha = smoothstep(1.0, 0.2, d); // glow falloff
          gl_FragColor = vec4(vColor, alpha);
        }
      `,
    });
    return mat;
  }, []);

  // geometry with per-instance attributes
  const geometry = useMemo(() => {
    const g = new THREE.InstancedBufferGeometry();
    // base quad as a single point (we use gl_PointSize in shader)
    g.setAttribute("position", new THREE.Float32BufferAttribute([0, 0, 0], 3));
    // per-instance attributes
    g.setAttribute("instanceColor", new THREE.InstancedBufferAttribute(colorArray, 3));
    g.setAttribute("instanceScale", new THREE.InstancedBufferAttribute(scaleArray, 1));
    g.instanceCount = count;
    return g;
  }, [colorArray, count, scaleArray]);

  // Get minter data - either from shard userData or from data array
  const hoveredMinter = useMemo(() => {
    if (!hover || hoverIdx == null) return null;
    // If hovering over a shard, get minter from userData
    if (hover.isShard && hover.shardObject?.userData?.minter) {
      return hover.shardObject.userData.minter as Minter;
    }
    // Otherwise, get from data array using index
    return data[hoverIdx] || null;
  }, [hover, hoverIdx, data]);

  return (
    <>
      <instancedMesh ref={ref} args={[geometry, material, count]} />
      {hoveredMinter && hoverXY && (
        <Html
          transform={false}
          zIndexRange={[1000, 1000]}
          style={{
            position: "absolute",
            left: typeof window !== "undefined" && window.innerWidth < 768 
              ? Math.max(10, Math.min(hoverXY.x, window.innerWidth - 200))
              : hoverXY.x,
            top: typeof window !== "undefined" && window.innerWidth < 768
              ? Math.max(10, hoverXY.y - 150)
              : hoverXY.y,
            pointerEvents: "none",
            transform: typeof window !== "undefined" && window.innerWidth < 768
              ? "translateY(-100%)"
              : "none",
          }}
        >
          <div
            style={{
              background: "rgba(2,6,23,0.95)",
              border: "1px solid rgba(99,102,241,0.35)",
              borderRadius: 10,
              padding: "clamp(6px, 2vw, 10px) clamp(8px, 2.5vw, 12px)",
              color: "#e2e8f0",
              minWidth: "clamp(180px, 50vw, 220px)",
              maxWidth: "90vw",
              boxShadow: "0 8px 30px rgba(0,0,0,0.45)",
              fontSize: "clamp(11px, 3vw, 12px)",
              lineHeight: 1.4,
            }}
          >
            <div style={{ fontWeight: 700, marginBottom: 8, fontSize: "clamp(12px, 3.5vw, 14px)", color: "#fff" }}>
              {hoveredMinter.wallet.slice(0, 6)}...{hoveredMinter.wallet.slice(-4)}
            </div>
            <div style={{ marginBottom: 8, paddingBottom: 8, borderBottom: "1px solid rgba(255,255,255,0.1)" }}>
              <div style={{ fontSize: "clamp(11px, 3vw, 13px)", color: "#22c55e", fontWeight: 600 }}>
                ✅ Successful Predictions: <b style={{ fontSize: "clamp(13px, 3.5vw, 15px)" }}>{hoveredMinter.wins}</b>
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: "clamp(10px, 2.8vw, 11px)" }}>
              <div>Level: <b>{hoveredMinter.level}</b></div>
              <div>
                NFT: <b>{hoveredMinter.mintedAnimal ?? "N/A"}{hoveredMinter.mintedTokenId != null ? ` #${hoveredMinter.mintedTokenId}` : ""}</b>
              </div>
              <div>Win Rate: <b>{Math.round(hoveredMinter.winRate * 100)}%</b> ({hoveredMinter.wins}W / {hoveredMinter.losses}L)</div>
              <div>Total Predictions: <b>{hoveredMinter.totalPredictions}</b></div>
            </div>
          </div>
        </Html>
      )}
    </>
  );
}

export default function NeuralGlobe() {
  const [minters, setMinters] = useState<Minter[]>([]);
  const [loading, setLoading] = useState(true);
  const [isMobile, setIsMobile] = useState(false);
  const shardRefs = useRef<THREE.Points[]>([]);

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch("/api/shards/minters");
        const j = await r.json();
        if (j?.ok) setMinters(j.data as Minter[]);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const showEmpty = !loading && minters.length === 0;
  
  return (
    <div
      style={{
        width: "100%",
        height: isMobile ? "60vh" : "70vh",
        minHeight: isMobile ? "400px" : "500px",
        borderRadius: 16,
        overflow: "hidden",
        border: "1px solid rgba(99,102,241,0.25)",
        position: "relative",
        background: "radial-gradient(ellipse at top, rgba(99,102,241,0.12), rgba(15,23,42,0.85))",
      }}
    >
      {loading && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#cbd5e1",
            fontSize: 15,
            zIndex: 3,
            pointerEvents: "none",
            background: "linear-gradient(180deg, rgba(15,23,42,0.55), rgba(11,15,32,0.4))",
          }}
        >
          Loading globe...
        </div>
      )}
      {showEmpty && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "rgba(226,232,240,0.75)",
            fontSize: 14,
            pointerEvents: "none",
            background: "linear-gradient(180deg, rgba(15,23,42,0.35), rgba(15,23,42,0.6))",
            zIndex: 2,
          }}
        >
          No minters yet. As shards make correct predictions their nodes will illuminate here.
        </div>
      )}
      <Canvas 
        camera={{ position: [0, 0, 20], fov: 50 }} 
        dpr={isMobile ? [1, 1.5] : [1, 2]}
        gl={{ antialias: !isMobile, powerPreference: "high-performance" }}
      >
        <ambientLight intensity={0.4} />
        <hemisphereLight args={["#cbd5f5", "#0b1120", 0.55]} />
        <directionalLight position={[6, 7, 8]} intensity={0.85} color="#93c5fd" />
        <pointLight position={[0, 0, 14]} intensity={1.2} color="#60a5fa" />
        <GlobeCore />
        <NeuralArcs />
        <MintersPoints data={minters} shardRefs={shardRefs} />
        <ShardSprites data={minters} shardRefs={shardRefs} />
        <OrbitControls 
          enablePan={false} 
          enableRotate={true}
          enableZoom={true}
          rotateSpeed={isMobile ? 0.5 : 0.5} 
          zoomSpeed={isMobile ? 0.8 : 0.7} 
          minDistance={12} 
          maxDistance={35}
          enableDamping={true}
          dampingFactor={0.05}
          touches={{ 
            ONE: 0,  // THREE.TOUCH.ROTATE - Single touch = rotate
            TWO: 1   // THREE.TOUCH.DOLLY_PAN - Two fingers = zoom
          }}
        />
      </Canvas>
    </div>
  );
}
