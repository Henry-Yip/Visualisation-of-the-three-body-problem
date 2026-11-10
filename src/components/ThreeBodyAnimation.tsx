import { useEffect, useRef, useState, useMemo } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import {
  BufferGeometry,
  NormalBufferAttributes,
  BufferAttribute,
  AdditiveBlending,
  ShaderMaterial,
} from "three";
import { OrbitControls } from "@react-three/drei";
import {
  FIXED_CENTRE_ORBITS,
  FIXED_CENTRE_SCALE,
  isFixedCentreOrbit,
} from "../utils/fixedCentres";

// Types
interface Vector3 {
  x: number;
  y: number;
  z: number;
}

interface BodyConfig {
  id: string;
  position: Vector3;
  velocity: Vector3;
  mass: number;
  color: string;
}

interface FrameData {
  momentumChange: Vector3;
  energyChange: number;
  // Change in Euler's second integral g, for the fixed-centre orbits only
  gChange?: number;
  bodies: BodyConfig[];
}

// Shader constants
const VERTEX_SHADER = `
  attribute float size;
  attribute vec3 color;
  varying vec3 vColor;

  void main() {
    vColor = color;
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = size * (300.0 / max(1.0, -mvPosition.z));
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const FRAGMENT_SHADER = `
  varying vec3 vColor;
    
  void main() {
    float alpha = 1.0 - length(gl_PointCoord - vec2(0.5)) * 2.0;
    alpha = clamp(alpha, 0.0, 1.0);
    gl_FragColor = vec4(vColor, alpha);
  }
`;

// Constants
const TRAIL_LENGTH = 1200;
const SPHERE_SIZE = 0.07;
const TRAIL_START_SIZE = SPHERE_SIZE * 3;
const TARGET_FPS = 30; // Set desired FPS
const FRAME_INTERVAL = Math.floor(60 / TARGET_FPS); // Calculate frame skip interval

// Utility function for trail updates
function updateBodyTrail(
  body: BodyConfig,
  trailPositions: number[],
  maxLength: number
) {
  // Add new position to the trail
  trailPositions.push(body.position.x, body.position.y, body.position.z);

  // Trim trail if too long
  while (trailPositions.length > maxLength * 3) {
    trailPositions.splice(0, 3);
  }

  // Create arrays for the trail visualization
  const positions = new Float32Array(trailPositions);
  const colors = new Float32Array(trailPositions.length);
  const sizes = new Float32Array(trailPositions.length / 3);

  // Parse body color to RGB values
  const bodyColor =
    body.color === "red"
      ? [1, 0, 0]
      : body.color === "blue"
      ? [0, 0, 1]
      : [0, 1, 0];

  // Fill color and size arrays
  for (let i = 0; i < positions.length / 3; i++) {
    const alpha = i / (positions.length / 3);

    // Color interpolation from body color to white
    colors[i * 3] = bodyColor[0] + (1 - bodyColor[0]) * (1 - alpha); // Red
    colors[i * 3 + 1] = bodyColor[1] + (1 - bodyColor[1]) * (1 - alpha); // Green
    colors[i * 3 + 2] = bodyColor[2] + (1 - bodyColor[2]) * (1 - alpha); // Blue

    // Size decreases along the trail
    sizes[i] = TRAIL_START_SIZE * alpha;
  }

  return { positions, colors, sizes };
}

type SimulationBodyProps = {
  body: BodyConfig;
  trailRef: (node: BufferGeometry<NormalBufferAttributes> | null) => void;
  updateTrail: (positions: number[]) => void;
  trailHistory: number[];
};

function SimulationBody({
  body,
  trailRef,
  updateTrail,
  trailHistory,
}: SimulationBodyProps) {
  const frameCounter = useRef(0);

  const shaderMaterial = useMemo(
    () =>
      new ShaderMaterial({
        vertexShader: VERTEX_SHADER,
        fragmentShader: FRAGMENT_SHADER,
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
      }),
    []
  );

  useFrame(() => {
    frameCounter.current += 1;
    if (frameCounter.current % FRAME_INTERVAL === 0) {
      updateTrail(trailHistory);
    }
  });

  return (
    <>
      <mesh position={[body.position.x, body.position.y, body.position.z]}>
        <sphereGeometry args={[SPHERE_SIZE, 32, 32]} />
        <meshStandardMaterial color={body.color} />
      </mesh>

      <points frustumCulled={false}>
        <bufferGeometry ref={trailRef} />
        <primitive object={shaderMaterial} />
      </points>
    </>
  );
}

type OrbitProps = {
  onStatsUpdate?: (stats: {
    momentumChange: Vector3;
    energyChange: number;
    gChange?: number;
    velocities: Vector3[];
  }) => void;
  integrator: string;
  orbit: string;
};

function Orbit({ onStatsUpdate, integrator, orbit }: OrbitProps) {
  const [frames, setFrames] = useState<FrameData[]>([]);
  const [frameIndex, setFrameIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const trailRefs = useRef<(BufferGeometry | null)[]>([null, null, null]);
  const trailPositionsRef = useRef<number[][]>([[], [], []]);

  const frameCounter = useRef(0);

  // Mapping constants
  const integratorMap: { [key: string]: string } = {
    "Neri (4th)": "4",
    "Ruth (3rd)": "3",
    "Verlet (2nd)": "2",
    "Euler (1st)": "1",
  };

  const orbitFileMap: { [key: string]: string } = {
    "Figure of 8": "fo8.txt",
    "Butterfly I": "butterfly1.txt",
    "Butterfly II": "butterfly2.txt",
    "Butterfly III": "butterfly3.txt",
    "Butterfly IV": "butterfly4.txt",
    "Bumblebee": "bumblebee.txt",
    "Dragonfly": "dragonfly.txt",
    "Goggles": "goggle.txt",
    "Lagrange": "lagrang.txt",
    "Moth I": "moth1.txt",
    "Moth II": "moth2.txt",
    "Moth III": "moth3.txt",
    "Yarn": "yar.txt",
    "Yin-Yang I": "yin-yang1.txt",
    "Yin-Yang II": "yin-yang2.txt",
    "Yin-Yang III": "yin-yang3.txt",
    ...FIXED_CENTRE_ORBITS,
  };

  useEffect(() => {
    const integratorFolder = integratorMap[integrator] || "4";
    const orbitFile = orbitFileMap[orbit] || "fo8.txt";
    const filePath = `/position_files/${integratorFolder}/${orbitFile}`;

    setIsLoading(true);
    setError(null);

    fetch(filePath)
      .then((response) => {
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        return response.text();
      })
      .then((text) => {
        const parsedFrames: FrameData[] = [];
        const lines = text.split(/\r?\n/).filter((line) => line.trim() !== "");
        const scale = isFixedCentreOrbit(orbit) ? FIXED_CENTRE_SCALE : 1;

        let i = 0;
        while (i + 4 < lines.length) {
          // The first line holds the change in momentum, or, for the fixed-centre
          // orbits, where momentum is not conserved, the change in g.
          const firstLine = lines[i++].trim();
          const firstTokens = firstLine.split(/[ =]+/).filter(Boolean);
          const gChange =
            firstTokens[0] === "dG" ? parseFloat(firstTokens[1]) : undefined;
          const momentumChange =
            gChange === undefined
              ? {
                  x: parseFloat(firstTokens[1]),
                  y: parseFloat(firstTokens[2]),
                  z: parseFloat(firstTokens[3]),
                }
              : { x: 0, y: 0, z: 0 };

          const dEnergyLine = lines[i++].trim();
          const energyTokens = dEnergyLine.split(/[ =]+/).filter(Boolean);
          const energyChange = parseFloat(energyTokens[1]);

          const bodies: BodyConfig[] = [];
          for (let j = 0; j < 3; j++) {
            const bodyLine = lines[i++].trim();
            const tokens = bodyLine.split(/\s+/).filter(Boolean);
            const [id, posX, posY, posZ, velX, velY, velZ] = tokens;
            const color = id === "0" ? "red" : id === "1" ? "blue" : "green";

            bodies.push({
              id,
              position: {
                x: parseFloat(posX) * scale,
                y: parseFloat(posY) * scale,
                z: parseFloat(posZ) * scale,
              },
              velocity: {
                x: parseFloat(velX),
                y: parseFloat(velY),
                z: parseFloat(velZ),
              },
              mass: 1,
              color,
            });
          }

          parsedFrames.push({ momentumChange, energyChange, gChange, bodies });
        }

        setFrames(parsedFrames);
        setIsLoading(false);
      })
      .catch((error) => {
        console.error("Error loading simulation data:", error);
        setError(error.message);
        setIsLoading(false);
      });

    // Cleanup function
    return () => {
      setFrames([]);
      setFrameIndex(0);
      trailPositionsRef.current = [[], [], []];
    };
  }, [integrator, orbit]);

  useFrame(() => {
    if (frames.length === 0 || isLoading || error) return;

    frameCounter.current += 1;
    if (frameCounter.current % FRAME_INTERVAL === 0) {
      setFrameIndex((prev) => (prev + 1) % frames.length);
      const currentFrame = frames[frameIndex];

      if (onStatsUpdate) {
        onStatsUpdate({
          momentumChange: currentFrame.momentumChange,
          energyChange: currentFrame.energyChange,
          gChange: currentFrame.gChange,
          velocities: currentFrame.bodies.map((b) => b.velocity),
        });
      }
    }
  });

  if (error) {
    return (
      <mesh>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color="red" />
      </mesh>
    );
  }

  if (isLoading || frames.length === 0) {
    return (
      <>
        <mesh rotation={[1, 1, 1]}>
          <boxGeometry args={[0.2, 0.2, 0.2]} />
          <meshStandardMaterial color="skyblue" />
        </mesh>
        <ambientLight intensity={2} />
        <directionalLight position={[5, 5, 5]} intensity={5} />
      </>
    );
  }

  return (
    <>
      {frames[frameIndex].bodies.map((body, i) => (
        <SimulationBody
          key={body.id}
          body={body}
          trailRef={(el) => {
            trailRefs.current[i] = el;
          }}
          updateTrail={(positions) => {
            const {
              positions: newPositions,
              colors,
              sizes,
            } = updateBodyTrail(body, positions, TRAIL_LENGTH);

            if (trailRefs.current[i]) {
              const trail = trailRefs.current[i];
              trail?.setAttribute(
                "position",
                new BufferAttribute(newPositions, 3)
              );
              trail?.setAttribute("color", new BufferAttribute(colors, 3));
              trail?.setAttribute("size", new BufferAttribute(sizes, 1));

              if (trail?.attributes.position)
                trail.attributes.position.needsUpdate = true;
              if (trail?.attributes.color)
                trail.attributes.color.needsUpdate = true;
              if (trail?.attributes.size)
                trail.attributes.size.needsUpdate = true;
            }
          }}
          trailHistory={trailPositionsRef.current[i]}
        />
      ))}
      <ambientLight intensity={5} />
      <directionalLight position={[5, 5, 5]} intensity={17} />
    </>
  );
}

function ThreeBodySimulation({
  onStatsUpdate,
  integrator,
  orbit,
}: {
  onStatsUpdate?: OrbitProps["onStatsUpdate"];
  integrator: string;
  orbit: string;
}) {
  // Move the camera back on narrow screens so the orbit stays in view.
  // 0.767 is the tangent of half the default vertical field of view.
  const aspect = window.innerWidth / window.innerHeight;
  const cameraDistance = Math.max(2, 1.4 / (0.767 * aspect));

  return (
    <Canvas camera={{ position: [0, 0, cameraDistance] }}>
      <Orbit
        onStatsUpdate={onStatsUpdate}
        integrator={integrator}
        orbit={orbit}
      />
      <OrbitControls />
    </Canvas>
  );
}

export default ThreeBodySimulation;
