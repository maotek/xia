import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, CheckCircle2, ExternalLink, Printer, RotateCcw, Sparkles, TriangleAlert } from "lucide-react";

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "";
const SHOT_COUNT = 3;

type Phase = "loading" | "ready" | "countdown" | "capturing" | "printing" | "complete" | "error";

type PrintResult = {
  job_id: string;
  image_url: string;
  printed: boolean;
  printer: string | null;
  message: string;
};

function App() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const runningRef = useRef(false);

  const [phase, setPhase] = useState<Phase>("loading");
  const [countdown, setCountdown] = useState<number | null>(null);
  const [shots, setShots] = useState<string[]>([]);
  const [flash, setFlash] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<PrintResult | null>(null);

  useEffect(() => {
    let mounted = true;

    async function openCamera() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: "user",
            width: { ideal: 1920 },
            height: { ideal: 1080 }
          },
          audio: false
        });

        if (!mounted) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        setPhase("ready");
      } catch (cameraError) {
        setError(cameraError instanceof Error ? cameraError.message : "Camera permission failed.");
        setPhase("error");
      }
    }

    openCamera();

    return () => {
      mounted = false;
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  const resetSession = useCallback(() => {
    if (runningRef.current) {
      return;
    }
    setShots([]);
    setResult(null);
    setCountdown(null);
    setError(null);
    setPhase(streamRef.current ? "ready" : "loading");
  }, []);

  const captureFrame = useCallback(() => {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0 || video.videoHeight === 0) {
      throw new Error("Camera frame is not ready.");
    }

    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext("2d");
    if (!context) {
      throw new Error("Could not capture a camera frame.");
    }

    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.94);
  }, []);

  const runCountdown = useCallback(async (startAt: number) => {
    for (let value = startAt; value >= 0; value -= 1) {
      setCountdown(value);
      await sleep(value === 0 ? 260 : 1000);
    }
  }, []);

  const submitPrint = useCallback(
    async (capturedShots: string[]) => {
      setPhase("printing");
      const response = await fetch(apiUrl("/api/print"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          images: capturedShots,
          copies: 1,
          print: true
        })
      });

      if (!response.ok) {
        let detail = "Print request failed.";
        try {
          const payload = (await response.json()) as { detail?: string };
          detail = payload.detail ?? detail;
        } catch {
          detail = await response.text();
        }
        throw new Error(detail);
      }

      const payload = (await response.json()) as PrintResult;
      setResult(payload);
      setPhase("complete");
    },
    []
  );

  const startSession = useCallback(async () => {
    if (runningRef.current || phase === "loading") {
      return;
    }

    runningRef.current = true;
    setShots([]);
    setResult(null);
    setError(null);

    try {
      const capturedShots: string[] = [];
      for (let index = 0; index < SHOT_COUNT; index += 1) {
        setPhase("countdown");
        await runCountdown(index === 0 ? 5 : 3);
        setPhase("capturing");
        const image = captureFrame();
        capturedShots.push(image);
        setShots([...capturedShots]);
        setFlash(true);
        await sleep(180);
        setFlash(false);
        await sleep(220);
      }
      setCountdown(null);
      await submitPrint(capturedShots);
    } catch (sessionError) {
      setError(sessionError instanceof Error ? sessionError.message : "Photobooth session failed.");
      setPhase("error");
    } finally {
      setCountdown(null);
      runningRef.current = false;
    }
  }, [captureFrame, phase, runCountdown, submitPrint]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.code === "Space") {
        event.preventDefault();
        void startSession();
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [startSession]);

  const previewUrl = result ? withCacheBust(apiUrl(result.image_url), result.job_id) : null;
  const canStart = Boolean(streamRef.current) && (phase === "ready" || phase === "complete" || phase === "error");

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand-lockup">
          <div className="brand-mark" aria-hidden="true">
            <Sparkles size={22} />
          </div>
          <div>
            <h1>Champagne Photobooth</h1>
            <p>{statusLabel(phase, shots.length)}</p>
          </div>
        </div>
        <div className="status-pill">
          <span className={`status-dot status-${phase}`} />
          <span>{shots.length}/3</span>
        </div>
      </header>

      <section className="workspace">
        <div className="stage-panel">
          <div className="camera-frame">
            <video ref={videoRef} playsInline muted />
            {phase === "loading" ? <div className="camera-placeholder">Camera</div> : null}
            {countdown !== null ? <div className="countdown">{countdown}</div> : null}
            {flash ? <div className="flash" /> : null}
          </div>

          <div className="controls">
            <button className="primary-button" type="button" onClick={() => void startSession()} disabled={!canStart}>
              <Camera size={20} />
              <span>Start</span>
            </button>
            <button className="icon-button" type="button" onClick={resetSession} disabled={runningRef.current} title="Reset">
              <RotateCcw size={20} />
            </button>
          </div>
        </div>

        <aside className="side-panel">
          <div className="preview-header">
            <span>Captures</span>
            <span>{shots.length}/3</span>
          </div>

          <div className="shot-grid" aria-label="Captured photos">
            {Array.from({ length: SHOT_COUNT }).map((_, index) => (
              <div className={`shot-slot ${shots[index] ? "is-filled" : ""}`} key={index}>
                {shots[index] ? (
                  <img src={shots[index]} alt={`Capture ${index + 1}`} />
                ) : (
                  <div className="shot-placeholder">
                    <Camera size={22} />
                    <span>{String(index + 1).padStart(2, "0")}</span>
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="print-state">
            {phase === "printing" ? (
              <>
                <Printer size={20} />
                <span>Rendering</span>
              </>
            ) : null}
            {result ? (
              <>
                <CheckCircle2 size={20} />
                <span>{result.message}</span>
              </>
            ) : null}
            {error ? (
              <>
                <TriangleAlert size={20} />
                <span>{error}</span>
              </>
            ) : null}
          </div>

          {previewUrl ? (
            <a className="preview-link" href={previewUrl} target="_blank" rel="noreferrer">
              <ExternalLink size={18} />
              <span>Print sheet</span>
            </a>
          ) : null}
        </aside>
      </section>
    </main>
  );
}

function sleep(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function apiUrl(path: string) {
  if (!API_BASE) {
    return path;
  }
  return new URL(path, API_BASE).toString();
}

function withCacheBust(url: string, value: string) {
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}v=${encodeURIComponent(value)}`;
}

function statusLabel(phase: Phase, shotCount: number) {
  switch (phase) {
    case "loading":
      return "Opening camera";
    case "countdown":
      return "Counting down";
    case "capturing":
      return "Capturing";
    case "printing":
      return "Preparing print";
    case "complete":
      return "Complete";
    case "error":
      return "Needs attention";
    default:
      return `${shotCount}/3 captured`;
  }
}

export default App;
