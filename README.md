# examples

AccordKit ships with runnable demos that showcase tracing against a variety of OpenAI surface areas. Each example is wired so emitted events land in the same session, making it easy to inspect what's recorded in `.accordkit-logs`.

## Quickstart


## Quickstart

### Install (real users)
Use published packages in your app:

```bash
# with pnpm
pnpm add @accordkit/tracer @accordkit/provider-openai
```

Minimal setup:

```ts
import OpenAI from "openai";
import { Tracer, FileSink } from "@accordkit/tracer";
import { withOpenAI } from "@accordkit/provider-openai";

const tracer = new Tracer({
  sinks: [new FileSink({ dir: ".accordkit-logs" })],
});

const client = withOpenAI(new OpenAI({ apiKey: process.env.OPENAI_API_KEY! }), tracer, {
  // Enable additional surfaces as needed
  enableResponsesApi: false,
  enableImagesApi: false,
  enableAudioApi: false,
  // Emission controls
  emitPrompts: true,
  emitResponses: true,
  emitToolCalls: true,
  emitToolResults: true,
  emitUsage: true,
  emitSpan: true,
  operationName: "my-app",
});

// example call
await client.chat.completions.create({
  model: "gpt-4o-mini",
  messages: [{ role: "user", content: "Hello AccordKit!" }],
});
```

> Contributors working inside the monorepo can still use `workspace:*` versions.

## 
## OpenAI examples

| Example | Description | How to run | Notes |
| --- | --- | --- | --- |
| `openai-chat-basic` | One-off chat completion with structured logging. | `cd openai-examples && pnpm start -- openai-chat-basic` | Demonstrates base tracing without streaming. |
| `openai-chat-stream` | Streams deltas from `chat.completions.create`. | `cd openai-examples && pnpm start -- openai-chat-stream` | Observe incremental events logged while tokens arrive. |
| `openai-responses` | Calls the Responses API with `enableResponsesApi`. | `cd openai-examples && pnpm start -- openai-responses` | Mirrors chat instrumentation, showing usage events. |
| `openai-images` | Generates an image and writes it to disk. | `cd openai-examples && pnpm start -- openai-images` | Requires `enableImagesApi`; output saved to `.accordkit-logs/openai-images-dashboard.png`. |
| `openai-tts` | Synthesizes speech and persists the audio file. | `cd openai-examples && pnpm start -- openai-tts` | Requires `enableAudioApi`; audio is stored as `openai-tts-output.mp3`. |
| `openai-transcribe` | Transcribes local audio input. | `cd openai-examples && pnpm start -- openai-transcribe` | Set `ACCORDKIT_TRANSCRIBE_FILE` (or `ACCORDKIT_AUDIO_FILE`) to a readable audio file. |
| `openai-translate` | Translates speech to English. | `cd openai-examples && pnpm start -- openai-translate` | Set `ACCORDKIT_TRANSLATE_FILE` (or reuse `ACCORDKIT_AUDIO_FILE`). |

## Log output

Each run writes JSONL traces using the `FileSink` configured in `openai-examples/index.ts`. Look inside the `.accordkit-logs` directory (override with `ACCORDKIT_LOG_DIR`) to inspect emitted messages, spans, and usage metrics.

## Usage telemetry

- `withOpenAI` (and other AccordKit adapters) automatically emits `usage` events by reading the SDK response (e.g., `response.usage.prompt_tokens`). If you wrap your provider with the adapter, no extra work is needed.
- For custom instrumentation, call `tracer.usage({ inputTokens, outputTokens, cost })` after you receive a model response. Pull counts from the provider payload or your own token counter, and compute cost via your pricing table when the vendor does not return it.
- Non-LLM services can emit regular spans or tool results with relevant metrics attached (latency, payload size, number of items processed) so traces contain the full workflow context.

## Viewer live tail

Run the live-tail bridge alongside the Viewer UI to stream events in real time:

```
cd viewer-live-tail && pnpm start      # SSE server at http://localhost:1967/api/events (pushes sample events continuously)
cd ../viewer && pnpm dev                  # launch the Viewer at http://localhost:5173
```

Open *Start live* inside the Viewer. It defaults to `/api/events`, so the sample spans/messages/tool events begin appearing immediately. Replace the placeholder emissions in `viewer-live-tail/index.ts` with the tracer calls from your own application, or lift the `LiveTailSink` helper into your service so you can broadcast every event while still persisting to your durable sink.

Environment knobs:

- `ACCORDKIT_LIVE_PORT` — choose a different SSE port (defaults to `1967`).
- `ACCORDKIT_LOG_DIR` — directory backing the `FileSink` (defaults to `.accordkit-logs` under the example).
- `ACCORDKIT_SERVICE` — set the service tag emitted with each event.
- `ACCORDKIT_LIVE_INTERVAL_MS` — control how often the demo emits its synthetic events (defaults to `2000` ms).

## Other demos


## Other demos

| Example | Description | How to run | Notes |
| --- | --- | --- | --- |
| `file-sink-demo` | Emits events; logs JSONL to `.accordkit-logs/`. | `cd file-sink-demo && pnpm start` | Open the JSONL in the Viewer |
| `http-sink-demo` | Forwards buffered batches to an ingest endpoint. | `cd http-sink-demo && pnpm start` | Set `ACCORDKIT_API_KEY`; optionally `ACCORDKIT_REGION`, `ACCORDKIT_BASE_URL`, `ACCORDKIT_INGEST_ENDPOINT` |
| `viewer-live-tail` | Bridges tracer events to SSE for real-time viewing. | `cd viewer-live-tail && pnpm start` | Starts SSE at `http://localhost:1967/api/events`; then run the Viewer (`cd ../viewer && pnpm dev`) |