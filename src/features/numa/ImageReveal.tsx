import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "framer-motion";

/**
 * WebGL image reveal — a studio shot doesn't fade in, it *develops*: an
 * organic noise-front sweeps the image into view with a soft lime-tinted
 * edge, like a print coming up in the tray. One quad, one tiny fragment
 * shader, zero dependencies.
 *
 * Falls back to a plain CSS fade when WebGL is unavailable, and skips
 * straight to the final frame under prefers-reduced-motion.
 */

const VERT = `
attribute vec2 aPos;
varying vec2 vUv;
void main() {
  vUv = aPos * 0.5 + 0.5;
  vUv.y = 1.0 - vUv.y;
  gl_Position = vec4(aPos, 0.0, 1.0);
}
`;

const FRAG = `
precision mediump float;
varying vec2 vUv;
uniform sampler2D uTex;
uniform float uProgress;   // 0 → 1 develop
uniform vec3 uEdge;        // reveal-front tint (Citrus lime)

// Cheap value noise — enough organic character for a reveal front.
float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}
float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
    mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
    u.y
  );
}

void main() {
  vec4 tex = texture2D(uTex, vUv);
  // Reveal front: diagonal sweep + noise wobble.
  float sweep = (vUv.x + vUv.y) * 0.5;
  float n = noise(vUv * 6.0) * 0.35;
  float front = smoothstep(uProgress - 0.14, uProgress + 0.02, sweep + n - 0.18);
  // front = 1 → not yet revealed; 0 → fully revealed.
  float alpha = tex.a * (1.0 - front);
  // A whisper of lime right at the developing edge.
  float edgeBand = smoothstep(0.0, 0.5, front) * (1.0 - smoothstep(0.5, 1.0, front));
  vec3 rgb = mix(tex.rgb, uEdge, edgeBand * 0.35);
  gl_FragColor = vec4(rgb * alpha, alpha); // premultiplied
}
`;

function compile(gl: WebGLRenderingContext, type: number, src: string): WebGLShader | null {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, src);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.warn("[numa] shader compile failed:", gl.getShaderInfoLog(shader));
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

/** Citrus lime, sampled once — the shader edge shouldn't re-read CSS per frame. */
function limeEdge(): [number, number, number] {
  if (typeof window === "undefined") return [0.81, 0.98, 0.14];
  const raw = getComputedStyle(document.documentElement)
    .getPropertyValue("--color-coin-lime")
    .trim();
  const m = raw.match(/^#?([0-9a-f]{6})$/i);
  if (!m) return [0.81, 0.98, 0.14];
  const n = parseInt(m[1]!, 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

export function ImageReveal({
  src,
  alt,
  className,
  durationMs = 900
}: {
  src: string;
  alt: string;
  className?: string;
  durationMs?: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const reducedMotion = useReducedMotion();
  const [mode, setMode] = useState<"gl" | "css" | "done">("gl");

  useEffect(() => {
    if (reducedMotion) {
      setMode("done");
      return;
    }
    const canvas = canvasRef.current;
    if (!canvas) return;
    const gl = canvas.getContext("webgl", { alpha: true, premultipliedAlpha: true });
    if (!gl) {
      setMode("css");
      return;
    }

    let raf = 0;
    let cancelled = false;
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => {
      if (cancelled) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.max(1, Math.round(canvas.clientWidth * dpr));
      canvas.height = Math.max(1, Math.round(canvas.clientHeight * dpr));
      gl.viewport(0, 0, canvas.width, canvas.height);

      const vs = compile(gl, gl.VERTEX_SHADER, VERT);
      const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG);
      const program = gl.createProgram();
      if (!vs || !fs || !program) {
        setMode("css");
        return;
      }
      gl.attachShader(program, vs);
      gl.attachShader(program, fs);
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        setMode("css");
        return;
      }
      gl.useProgram(program);

      const quad = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, quad);
      gl.bufferData(
        gl.ARRAY_BUFFER,
        new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
        gl.STATIC_DRAW
      );
      const aPos = gl.getAttribLocation(program, "aPos");
      gl.enableVertexAttribArray(aPos);
      gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

      const texture = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.clearColor(0, 0, 0, 0);

      const uProgress = gl.getUniformLocation(program, "uProgress");
      const uEdge = gl.getUniformLocation(program, "uEdge");
      gl.uniform3fv(uEdge, limeEdge());

      const start = performance.now();
      const frame = (now: number) => {
        if (cancelled) return;
        const t = Math.min(1, (now - start) / durationMs);
        // easeOutCubic — the front decelerates like a real developing print.
        const eased = 1 - Math.pow(1 - t, 3);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.uniform1f(uProgress, eased * 1.5);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        if (t < 1) {
          raf = requestAnimationFrame(frame);
        } else {
          // Hand off to the plain <img> and free the GL context.
          setMode("done");
          const ext = gl.getExtension("WEBGL_lose_context");
          ext?.loseContext();
        }
      };
      raf = requestAnimationFrame(frame);
    };
    image.onerror = () => setMode("css");
    image.src = src;

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
    };
  }, [src, durationMs, reducedMotion]);

  if (mode === "done") {
    return <img src={src} alt={alt} className={className} draggable={false} />;
  }
  if (mode === "css") {
    return (
      <img
        src={src}
        alt={alt}
        className={className}
        draggable={false}
        style={{ animation: "nm-image-fade 0.5s ease-out both" }}
      />
    );
  }
  return <canvas ref={canvasRef} className={className} aria-label={alt} role="img" />;
}
