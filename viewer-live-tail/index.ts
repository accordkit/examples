import { createServer } from "node:http";
import { join } from "node:path";

import { FileSink, Tracer } from "@accordkit/tracer";
import "dotenv/config";
import express, { type Request, type Response } from "express";

import type { BufferedSink, Sink, TracerEvent } from "@accordkit/tracer";

type Broadcast = (event: TracerEvent) => void;

interface LiveServer {
  broadcast: Broadcast;
  close(): Promise<void>;
}

class LiveTailSink implements BufferedSink {
  constructor(
    private readonly sinks: Array<Sink | BufferedSink>,
    private readonly push: Broadcast
  ) {}

  async write(sessionId: string, event: TracerEvent): Promise<void> {
    console.log(sessionId, event);
    this.push(event);
    for (const sink of this.sinks) {
      await Promise.resolve(sink.write(sessionId, event));
    }
  }

  async flush(): Promise<void> {
    for (const sink of this.sinks) {
      const candidate = sink as BufferedSink;
      if (typeof candidate.flush === "function") {
        await candidate.flush();
      }
    }
  }

  async close(): Promise<void> {
    for (const sink of this.sinks) {
      const candidate = sink as BufferedSink;
      if (typeof candidate.close === "function") {
        await candidate.close();
        continue;
      }
      if (typeof candidate.flush === "function") {
        await candidate.flush();
      }
    }
  }
}

async function main() {
  const port = readNumber(process.env.ACCORDKIT_LIVE_PORT, 1967);
  const logDir =
    process.env.ACCORDKIT_LOG_DIR ?? join(process.cwd(), ".accordkit-logs");
  const intervalMs = readNumber(process.env.ACCORDKIT_LIVE_INTERVAL_MS, 2000);

  const live = startLiveServer(port);
  const fileSink = new FileSink({ base: logDir });
  const sink = new LiveTailSink([fileSink], (evt) => live.broadcast(evt));

  const tracer = new Tracer({
    sink,
    service: process.env.ACCORDKIT_SERVICE ?? "viewer-live-tail-demo",
    env: process.env.NODE_ENV ?? "development",
  });

  console.log("✅ Live tail server ready");
  console.log(`   SSE endpoint: http://localhost:${port}/api/events`);
  console.log("   Start the viewer with: pnpm --filter viewer dev");
  console.log("   In the viewer, open Live Tail (defaults to /api/events).");

  const stopDemo = startDemoTraffic(tracer, intervalMs);

  // Emit an initial sample immediately for any already-connected viewers.
  await emitSampleTrace(tracer, 0);

  handleShutdown(async () => {
    stopDemo();
    await tracer.close();
    await live.close();
  });
}

function startLiveServer(port: number): LiveServer {
  const app = express();
  const clients = new Set<Response>();

  app.use((_req, res, next) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    next();
  });

  app.get("/health", (_req: Request, res: Response) => {
    res.json({ status: "ok" });
  });

  app.get("/api/events", (req: Request, res: Response) => {
    res.writeHead(200, {
      "Cache-Control": "no-cache",
      "Content-Type": "text/event-stream",
      Connection: "keep-alive",
    });
    res.write("\n");

    clients.add(res);
    req.on("close", () => {
      clients.delete(res);
    });
  });

  const server = createServer(app);
  server.listen(port, () => {
    console.log(`   Listening on http://localhost:${port}`);
  });

  return {
    broadcast(event: TracerEvent) {
      const payload = `data: ${JSON.stringify(event)}\n\n`;
      for (const client of clients) {
        client.write(payload);
      }
    },
    async close() {
      await new Promise<void>((resolve, reject) => {
        server.close((err) => {
          if (err) reject(err);
          else resolve();
        });
      });
      for (const client of clients) {
        client.end();
      }
      clients.clear();
    },
  };
}

function startDemoTraffic(tracer: Tracer, intervalMs: number): () => void {
  let seq = 1;
  let inFlight = false;

  const timer = setInterval(() => {
    if (inFlight) return;
    inFlight = true;
    void emitSampleTrace(tracer, seq++)
      .catch((err) => {
        console.error("Failed to emit live tail sample event:", err);
      })
      .finally(() => {
        inFlight = false;
      });
  }, Math.max(intervalMs, 250));

  return () => clearInterval(timer);
}

async function emitSampleTrace(
  tracer: Tracer,
  sequence: number,
): Promise<void> {
  await tracer.message({
    role: "system",
    content:
      sequence === 0
        ? "AccordKit live tail is streaming events to the viewer."
        : `Live tail heartbeat #${sequence}`,
  });

  const span = tracer.spanStart({
    operation: "demo.viewer_live_tail",
    attrs: {
      note: "Replace with your own application spans.",
      sequence,
    },
  });

  await tracer.message({
    role: "user",
    content:
      sequence === 0
        ? "How do I watch traces live?"
        : `Polling instruction set iteration ${sequence}`,
    ctx: span.ctx,
  });

  await tracer.toolCall({
    tool: "knowledgeBase.lookup",
    input: { topic: "live tail setup" },
    ctx: span.ctx,
  });

  await tracer.toolResult({
    tool: "knowledgeBase.lookup",
    output: {
      success: true,
      instructions:
        sequence === 0
          ? "Point AccordKit Viewer to /api/events."
          : `Streaming payload delivered for iteration ${sequence}.`,
    },
    latencyMs: 60 + (sequence % 5) * 15,
    ok: true,
    ctx: span.ctx,
  });

  await tracer.usage({
    inputTokens: 18 + sequence,
    outputTokens: 42 + sequence * 2,
    cost: 0.00031 + sequence * 0.00001,
  });

  await tracer.spanEnd(span, {
    status: "ok",
    attrs: { streamedToViewer: true, sequence },
  });
}

function handleShutdown(onShutdown: () => Promise<void>) {
  const signals: NodeJS.Signals[] = ["SIGINT", "SIGTERM"];
  for (const sig of signals) {
    process.on(sig, () => {
      void onShutdown()
        .catch((err) => {
          console.error("Failed to shut down cleanly:", err);
        })
        .finally(() => process.exit(0));
    });
  }
}

function readNumber(raw: string | undefined, fallback: number): number {
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

main().catch((err) => {
  console.error("Viewer live tail demo crashed:", err);
  process.exitCode = 1;
});
