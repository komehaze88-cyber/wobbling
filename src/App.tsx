import { useEffect, useRef, useState } from "react";
import { load, Store } from "@tauri-apps/plugin-store";
import { useWallpaperMode } from "./hooks/useWallpaperMode";
import "./App.css";

const TAU = Math.PI * 2;

interface CircleSettings {
  speed: number;
  wobbleAmount: number;
  wobbleFrequency: number;
  radiusScale: number;
  lineWidth: number;
  circleCount: number;
  radiusStep: number;
  individualFrequency: boolean;
  opacityFade: number;
  mouseOffset: number;
  sphereMode: boolean;
}

const defaultSettings: CircleSettings = {
  speed: 1,
  wobbleAmount: 3,
  wobbleFrequency: 8,
  radiusScale: 0.8,
  lineWidth: 1,
  circleCount: 1,
  radiusStep: 15,
  individualFrequency: false,
  opacityFade: 0.5,
  mouseOffset: 50,
  sphereMode: false,
};

function gcdInt(a: number, b: number) {
  let x = Math.abs(a | 0);
  let y = Math.abs(b | 0);
  while (y !== 0) {
    const t = x % y;
    x = y;
    y = t;
  }
  return x;
}

function pickCoprimeStep(mod: number, avoid: ReadonlySet<number>) {
  if (mod <= 2) return 1;

  const candidates = [7, 11, 13, 17, 19, 5, 3, 2];
  for (const candidate of candidates) {
    const step = candidate % mod;
    if (step <= 1) continue;
    if (avoid.has(step)) continue;
    if (gcdInt(step, mod) === 1) return step;
  }

  for (let step = 2; step < mod; step++) {
    if (avoid.has(step)) continue;
    if (gcdInt(step, mod) === 1) return step;
  }

  return 1;
}

function hash32(seed: number) {
  let x = seed | 0;
  x = Math.imul(x ^ (x >>> 16), 0x7feb352d);
  x = Math.imul(x ^ (x >>> 15), 0x846ca68b);
  x = x ^ (x >>> 16);
  return x >>> 0;
}

function rand01(seed: number) {
  return hash32(seed) / 4294967296;
}

function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [leftSettings, setLeftSettings] = useState<CircleSettings>({ ...defaultSettings });
  const [rightSettings, setRightSettings] = useState<CircleSettings>({ ...defaultSettings });
  const [targetFps, setTargetFps] = useState(60);
  const { isWallpaperMode, toggleWallpaperMode } = useWallpaperMode();
  const [isLoading, setIsLoading] = useState(true);
  const leftTimeRef = useRef(0);
  const rightTimeRef = useRef(0);
  const animationRef = useRef<number>(0);
  const lastDrawTimeRef = useRef(0);
  const mouseRef = useRef({ x: 0, y: 0 });
  const storeRef = useRef<Store | null>(null);

  // Load settings from store on mount
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const store = await load("settings.json");
        storeRef.current = store;

        const savedLeft = await store.get<CircleSettings>("leftSettings");
        const savedRight = await store.get<CircleSettings>("rightSettings");
        const savedFps = await store.get<number>("targetFps");

        if (savedLeft) setLeftSettings(savedLeft);
        if (savedRight) setRightSettings(savedRight);
        if (savedFps) setTargetFps(savedFps);
      } catch (error) {
        console.error("Failed to load settings:", error);
      } finally {
        setIsLoading(false);
      }
    };

    loadSettings();
  }, []);

  // Save settings when they change
  useEffect(() => {
    if (isLoading || !storeRef.current) return;

    const saveSettings = async () => {
      try {
        const store = storeRef.current!;
        await store.set("leftSettings", leftSettings);
        await store.set("rightSettings", rightSettings);
        await store.set("targetFps", targetFps);
        await store.save();
      } catch (error) {
        console.error("Failed to save settings:", error);
      }
    };

    saveSettings();
  }, [leftSettings, rightSettings, targetFps, isLoading]);

  // Keyboard shortcut to exit wallpaper mode
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isWallpaperMode && e.key === "Escape") {
        toggleWallpaperMode();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isWallpaperMode, toggleWallpaperMode]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      mouseRef.current = { x: e.clientX, y: e.clientY };
    };
    window.addEventListener("mousemove", handleMouseMove);
    return () => window.removeEventListener("mousemove", handleMouseMove);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let lastTime = performance.now();
    const frameInterval = 1000 / targetFps;

    const drawCircleGroup = (
      settings: CircleSettings,
      time: number,
      centerX: number,
      centerY: number,
      areaWidth: number,
      areaHeight: number
    ) => {
      const {
        wobbleAmount,
        wobbleFrequency,
        radiusScale,
        lineWidth,
        circleCount,
        radiusStep,
        individualFrequency,
        opacityFade,
        mouseOffset,
        sphereMode,
      } = settings;

      const baseRadius = Math.min(areaWidth / 2, areaHeight / 2) * radiusScale;

      const mouseDx = mouseRef.current.x - centerX;
      const mouseDy = mouseRef.current.y - centerY;
      const mouseDist = Math.sqrt(mouseDx * mouseDx + mouseDy * mouseDy);
      const mouseNormX = mouseDist > 0 ? mouseDx / mouseDist : 0;
      const mouseNormY = mouseDist > 0 ? mouseDy / mouseDist : 0;

      const maxDist = Math.sqrt((areaWidth / 2) ** 2 + (areaHeight / 2) ** 2);
      const distFactor = mouseDist / maxDist;

      const segments = 360;

      const baseFreq1 = Math.round(wobbleFrequency);
      const baseFreq2 = Math.round(wobbleFrequency * 2);
      const baseFreq3 = Math.round(wobbleFrequency * 4);

      let step2 = 1;
      let step3 = 1;
      if (individualFrequency && circleCount > 1) {
        const avoid = new Set<number>();
        step2 = pickCoprimeStep(circleCount, avoid);
        avoid.add(step2);
        step3 = pickCoprimeStep(circleCount, avoid);
      }

      for (let c = 0; c < circleCount; c++) {
        const phaseOffset = (c / circleCount) * TAU;

        let circleRadius: number;
        if (sphereMode) {
          const angleStep = radiusStep * (Math.PI / 180);
          const angle = c * angleStep;
          circleRadius = baseRadius * Math.cos(angle);
        } else {
          circleRadius = baseRadius - c * radiusStep;
        }

        const offsetFactor = circleCount > 1 ? c / (circleCount - 1) : 0;
        const circleOffsetX = mouseNormX * mouseOffset * offsetFactor * distFactor;
        const circleOffsetY = mouseNormY * mouseOffset * offsetFactor * distFactor;

        ctx.beginPath();

        const freq1 = baseFreq1 + (individualFrequency ? c : 0);
        const idx2 = individualFrequency ? (c * step2) % circleCount : 0;
        const idx3 = individualFrequency ? (c * step3) % circleCount : 0;
        const freq2 = baseFreq2 + idx2;
        const freq3 = baseFreq3 + idx3;

        const phaseSeed = baseFreq1 * 100_000 + circleCount * 1_000 + c;
        const phase1 = individualFrequency ? rand01(phaseSeed + 1) * TAU : 0;
        const phase2 = individualFrequency ? rand01(phaseSeed + 2) * TAU : 0;
        const phase3 = individualFrequency ? rand01(phaseSeed + 3) * TAU : 0;

        for (let i = 0; i < segments; i++) {
          const angle = (i / segments) * TAU;

          const wobble =
            Math.sin(angle * freq1 + time * 2 + phaseOffset + phase1) * wobbleAmount * 0.5 +
            Math.sin(angle * freq2 - time * 1.5 + phaseOffset + phase2) * wobbleAmount * 0.3 +
            Math.sin(angle * freq3 + time * 0.8 + (individualFrequency ? phaseOffset + phase3 : c * 1.3)) *
              wobbleAmount *
              0.2;

          const r = circleRadius + wobble;
          const x = centerX + circleOffsetX + Math.cos(angle) * r;
          const y = centerY + circleOffsetY + Math.sin(angle) * r;

          if (i === 0) {
            ctx.moveTo(x, y);
          } else {
            ctx.lineTo(x, y);
          }
        }
        ctx.closePath();
        ctx.strokeStyle = `rgba(255, 255, 255, ${1 - (c / circleCount) * opacityFade})`;
        ctx.lineWidth = lineWidth;
        ctx.stroke();
      }
    };

    const draw = (currentTime: number) => {
      animationRef.current = requestAnimationFrame(draw);

      const elapsed = currentTime - lastDrawTimeRef.current;
      if (elapsed < frameInterval) return;

      lastDrawTimeRef.current = currentTime - (elapsed % frameInterval);

      const deltaTime = (currentTime - lastTime) / 1000;
      lastTime = currentTime;
      leftTimeRef.current += deltaTime * leftSettings.speed;
      rightTimeRef.current += deltaTime * rightSettings.speed;

      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;

      const halfWidth = canvas.width / 2;

      drawCircleGroup(
        leftSettings,
        leftTimeRef.current,
        halfWidth / 2,
        canvas.height / 2,
        halfWidth,
        canvas.height
      );

      drawCircleGroup(
        rightSettings,
        rightTimeRef.current,
        halfWidth + halfWidth / 2,
        canvas.height / 2,
        halfWidth,
        canvas.height
      );
    };

    animationRef.current = requestAnimationFrame(draw);

    return () => cancelAnimationFrame(animationRef.current);
  }, [leftSettings, rightSettings, targetFps]);

  const renderControls = (
    settings: CircleSettings,
    setSettings: React.Dispatch<React.SetStateAction<CircleSettings>>,
    label: string
  ) => (
    <div className="controls">
      <h3 className="controls-title">{label}</h3>
      <div className="slider-group">
        <label>
          <span>Circles</span>
          <span className="value">{settings.circleCount}</span>
        </label>
        <input
          type="range"
          min="1"
          max="20"
          step="1"
          value={settings.circleCount}
          onChange={(e) => setSettings((s) => ({ ...s, circleCount: parseInt(e.target.value) }))}
        />
      </div>

      <div className="toggle-group">
        <label>
          <span>Sphere Mode</span>
          <button
            className={`toggle-button ${settings.sphereMode ? "active" : ""}`}
            onClick={() => setSettings((s) => ({ ...s, sphereMode: !s.sphereMode }))}
          >
            {settings.sphereMode ? "ON" : "OFF"}
          </button>
        </label>
      </div>

      <div className="slider-group">
        <label>
          <span>{settings.sphereMode ? "Angle Step" : "Radius Step"}</span>
          <span className="value">{settings.radiusStep}{settings.sphereMode ? "°" : "px"}</span>
        </label>
        <input
          type="range"
          min="1"
          max={settings.sphereMode ? "30" : "50"}
          step="1"
          value={settings.radiusStep}
          onChange={(e) => setSettings((s) => ({ ...s, radiusStep: parseInt(e.target.value) }))}
        />
      </div>

      <div className="slider-group">
        <label>
          <span>Opacity Fade</span>
          <span className="value">{(settings.opacityFade * 100).toFixed(0)}%</span>
        </label>
        <input
          type="range"
          min="0"
          max="1"
          step="0.05"
          value={settings.opacityFade}
          onChange={(e) => setSettings((s) => ({ ...s, opacityFade: parseFloat(e.target.value) }))}
        />
      </div>

      <div className="slider-group">
        <label>
          <span>Mouse Offset</span>
          <span className="value">{settings.mouseOffset}px</span>
        </label>
        <input
          type="range"
          min="0"
          max="200"
          step="5"
          value={settings.mouseOffset}
          onChange={(e) => setSettings((s) => ({ ...s, mouseOffset: parseInt(e.target.value) }))}
        />
      </div>

      <div className="toggle-group">
        <label>
          <span>Individual Frequency</span>
          <button
            className={`toggle-button ${settings.individualFrequency ? "active" : ""}`}
            onClick={() => setSettings((s) => ({ ...s, individualFrequency: !s.individualFrequency }))}
          >
            {settings.individualFrequency ? "ON" : "OFF"}
          </button>
        </label>
      </div>

      <div className="slider-group">
        <label>
          <span>Speed</span>
          <span className="value">{settings.speed.toFixed(1)}x</span>
        </label>
        <input
          type="range"
          min="0"
          max="5"
          step="0.1"
          value={settings.speed}
          onChange={(e) => setSettings((s) => ({ ...s, speed: parseFloat(e.target.value) }))}
        />
      </div>

      <div className="slider-group">
        <label>
          <span>Wobble Amount</span>
          <span className="value">{settings.wobbleAmount.toFixed(1)}px</span>
        </label>
        <input
          type="range"
          min="0"
          max="20"
          step="0.5"
          value={settings.wobbleAmount}
          onChange={(e) => setSettings((s) => ({ ...s, wobbleAmount: parseFloat(e.target.value) }))}
        />
      </div>

      <div className="slider-group">
        <label>
          <span>Wobble Frequency</span>
          <span className="value">{settings.wobbleFrequency.toFixed(0)}</span>
        </label>
        <input
          type="range"
          min="1"
          max="30"
          step="1"
          value={settings.wobbleFrequency}
          onChange={(e) => setSettings((s) => ({ ...s, wobbleFrequency: parseFloat(e.target.value) }))}
        />
      </div>

      <div className="slider-group">
        <label>
          <span>Radius</span>
          <span className="value">{(settings.radiusScale * 100).toFixed(0)}%</span>
        </label>
        <input
          type="range"
          min="0.1"
          max="0.95"
          step="0.05"
          value={settings.radiusScale}
          onChange={(e) => setSettings((s) => ({ ...s, radiusScale: parseFloat(e.target.value) }))}
        />
      </div>

      <div className="slider-group">
        <label>
          <span>Line Width</span>
          <span className="value">{settings.lineWidth.toFixed(1)}px</span>
        </label>
        <input
          type="range"
          min="0.5"
          max="10"
          step="0.5"
          value={settings.lineWidth}
          onChange={(e) => setSettings((s) => ({ ...s, lineWidth: parseFloat(e.target.value) }))}
        />
      </div>
    </div>
  );

  return (
    <>
      <canvas ref={canvasRef} />
      {!isWallpaperMode && (
        <div className="controls-container">
          {renderControls(leftSettings, setLeftSettings, "Left")}
          <div className="controls global-controls">
            <h3 className="controls-title">Global</h3>
            <div className="slider-group">
              <label>
                <span>Frame Rate</span>
                <span className="value">{targetFps} fps</span>
              </label>
              <input
                type="range"
                min="1"
                max="120"
                step="1"
                value={targetFps}
                onChange={(e) => setTargetFps(parseInt(e.target.value))}
              />
            </div>
            <button className="wallpaper-toggle" onClick={toggleWallpaperMode}>
              Set as Wallpaper
            </button>
          </div>
          {renderControls(rightSettings, setRightSettings, "Right")}
        </div>
      )}
    </>
  );
}

export default App;
