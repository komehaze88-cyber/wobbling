import { useEffect, useRef, useState } from "react";
import "./App.css";

const TAU = Math.PI * 2;

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
  const [speed, setSpeed] = useState(1);
  const [wobbleAmount, setWobbleAmount] = useState(3);
  const [wobbleFrequency, setWobbleFrequency] = useState(8);
  const [radiusScale, setRadiusScale] = useState(0.8);
  const [lineWidth, setLineWidth] = useState(1);
  const [circleCount, setCircleCount] = useState(1);
  const [radiusStep, setRadiusStep] = useState(15);
  const [individualFrequency, setIndividualFrequency] = useState(false);
  const [targetFps, setTargetFps] = useState(60);
  const timeRef = useRef(0);
  const animationRef = useRef<number>(0);
  const lastDrawTimeRef = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let lastTime = performance.now();
    const frameInterval = 1000 / targetFps;

    const draw = (currentTime: number) => {
      animationRef.current = requestAnimationFrame(draw);

      const elapsed = currentTime - lastDrawTimeRef.current;
      if (elapsed < frameInterval) return;

      lastDrawTimeRef.current = currentTime - (elapsed % frameInterval);

      const deltaTime = (currentTime - lastTime) / 1000;
      lastTime = currentTime;
      timeRef.current += deltaTime * speed;

      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;

      const centerX = canvas.width / 2;
      const centerY = canvas.height / 2;
      const baseRadius = Math.min(centerX, centerY) * radiusScale;

      const segments = 360;
      const time = timeRef.current;

      // 周波数を整数に丸めて円周上で周期が完結するようにする
      const baseFreq1 = Math.round(wobbleFrequency);
      const baseFreq2 = Math.round(wobbleFrequency * 2);
      const baseFreq3 = Math.round(wobbleFrequency * 4);

      // `Individual Frequency` 時に倍音成分のオフセットを独立させ、似通いを減らす
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
        const radiusOffset = c * radiusStep;

        ctx.beginPath();

        const freq1 = baseFreq1 + (individualFrequency ? c : 0);
        const idx2 = individualFrequency ? (c * step2) % circleCount : 0;
        const idx3 = individualFrequency ? (c * step3) % circleCount : 0;
        const freq2 = baseFreq2 + idx2;
        const freq3 = baseFreq3 + idx3;

        // 各円・各成分に初期位相を追加（似通いを防ぐ、フレーム間で固定）
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

          const r = baseRadius - radiusOffset + wobble;
          const x = centerX + Math.cos(angle) * r;
          const y = centerY + Math.sin(angle) * r;

          if (i === 0) {
            ctx.moveTo(x, y);
          } else {
            ctx.lineTo(x, y);
          }
        }
        ctx.closePath();
        ctx.strokeStyle = `rgba(255, 255, 255, ${1 - (c / circleCount) * 0.5})`;
        ctx.lineWidth = lineWidth;
        ctx.stroke();
      }
    };

    animationRef.current = requestAnimationFrame(draw);

    return () => cancelAnimationFrame(animationRef.current);
  }, [speed, wobbleAmount, wobbleFrequency, radiusScale, lineWidth, circleCount, radiusStep, individualFrequency, targetFps]);

  return (
    <>
      <canvas ref={canvasRef} />
      <div className="controls">
        <div className="slider-group">
          <label>
            <span>Circles</span>
            <span className="value">{circleCount}</span>
          </label>
          <input
            type="range"
            min="1"
            max="20"
            step="1"
            value={circleCount}
            onChange={(e) => setCircleCount(parseInt(e.target.value))}
          />
        </div>

        <div className="slider-group">
          <label>
            <span>Radius Step</span>
            <span className="value">{radiusStep}px</span>
          </label>
          <input
            type="range"
            min="0"
            max="50"
            step="1"
            value={radiusStep}
            onChange={(e) => setRadiusStep(parseInt(e.target.value))}
          />
        </div>

        <div className="toggle-group">
          <label>
            <span>Individual Frequency</span>
            <button
              className={`toggle-button ${individualFrequency ? "active" : ""}`}
              onClick={() => setIndividualFrequency(!individualFrequency)}
            >
              {individualFrequency ? "ON" : "OFF"}
            </button>
          </label>
        </div>

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

        <div className="slider-group">
          <label>
            <span>Speed</span>
            <span className="value">{speed.toFixed(1)}x</span>
          </label>
          <input
            type="range"
            min="0"
            max="5"
            step="0.1"
            value={speed}
            onChange={(e) => setSpeed(parseFloat(e.target.value))}
          />
        </div>

        <div className="slider-group">
          <label>
            <span>Wobble Amount</span>
            <span className="value">{wobbleAmount.toFixed(1)}px</span>
          </label>
          <input
            type="range"
            min="0"
            max="20"
            step="0.5"
            value={wobbleAmount}
            onChange={(e) => setWobbleAmount(parseFloat(e.target.value))}
          />
        </div>

        <div className="slider-group">
          <label>
            <span>Wobble Frequency</span>
            <span className="value">{wobbleFrequency.toFixed(0)}</span>
          </label>
          <input
            type="range"
            min="1"
            max="30"
            step="1"
            value={wobbleFrequency}
            onChange={(e) => setWobbleFrequency(parseFloat(e.target.value))}
          />
        </div>

        <div className="slider-group">
          <label>
            <span>Radius</span>
            <span className="value">{(radiusScale * 100).toFixed(0)}%</span>
          </label>
          <input
            type="range"
            min="0.1"
            max="0.95"
            step="0.05"
            value={radiusScale}
            onChange={(e) => setRadiusScale(parseFloat(e.target.value))}
          />
        </div>

        <div className="slider-group">
          <label>
            <span>Line Width</span>
            <span className="value">{lineWidth.toFixed(1)}px</span>
          </label>
          <input
            type="range"
            min="0.5"
            max="10"
            step="0.5"
            value={lineWidth}
            onChange={(e) => setLineWidth(parseFloat(e.target.value))}
          />
        </div>
      </div>
    </>
  );
}

export default App;
