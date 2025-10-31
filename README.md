# examples

AccordKit ships with runnable demos that showcase tracing against a variety of OpenAI surface areas. Each example is wired so emitted events land in the same session, making it easy to inspect what's recorded in `.accordkit-logs`.

## Quickstart

```
pnpm install
pnpm --filter openai-examples start -- <example-name>
```

Set `OPENAI_API_KEY` in your environment before running any of the examples that hit the live API. Audio samples require extra file paths; see the table below.

## OpenAI examples

| Example | Description | How to run | Notes |
| --- | --- | --- | --- |
| `openai-chat-basic` | One-off chat completion with structured logging. | `pnpm --filter openai-examples start -- openai-chat-basic` | Demonstrates base tracing without streaming. |
| `openai-chat-stream` | Streams deltas from `chat.completions.create`. | `pnpm --filter openai-examples start -- openai-chat-stream` | Observe incremental events logged while tokens arrive. |
| `openai-responses` | Calls the Responses API with `enableResponsesApi`. | `pnpm --filter openai-examples start -- openai-responses` | Mirrors chat instrumentation, showing usage events. |
| `openai-images` | Generates an image and writes it to disk. | `pnpm --filter openai-examples start -- openai-images` | Requires `enableImagesApi`; output saved to `.accordkit-logs/openai-images-dashboard.png`. |
| `openai-tts` | Synthesizes speech and persists the audio file. | `pnpm --filter openai-examples start -- openai-tts` | Requires `enableAudioApi`; audio is stored as `openai-tts-output.mp3`. |
| `openai-transcribe` | Transcribes local audio input. | `pnpm --filter openai-examples start -- openai-transcribe` | Set `ACCORDKIT_TRANSCRIBE_FILE` (or `ACCORDKIT_AUDIO_FILE`) to a readable audio file. |
| `openai-translate` | Translates speech to English. | `pnpm --filter openai-examples start -- openai-translate` | Set `ACCORDKIT_TRANSLATE_FILE` (or reuse `ACCORDKIT_AUDIO_FILE`). |

## Log output

Each run writes JSONL traces using the `FileSink` configured in `openai-examples/index.ts`. Look inside the `.accordkit-logs` directory (override with `ACCORDKIT_LOG_DIR`) to inspect emitted messages, spans, and usage metrics.

## Usage telemetry

- `withOpenAI` (and other AccordKit adapters) automatically emits `usage` events by reading the SDK response (e.g., `response.usage.prompt_tokens`). If you wrap your provider with the adapter, no extra work is needed.
- For custom instrumentation, call `tracer.usage({ inputTokens, outputTokens, cost })` after you receive a model response. Pull counts from the provider payload or your own token counter, and compute cost via your pricing table when the vendor does not return it.
- Non-LLM services can emit regular spans or tool results with relevant metrics attached (latency, payload size, number of items processed) so traces contain the full workflow context.

## Viewer live tail

Run the live-tail bridge alongside the Viewer UI to stream events in real time:

```
pnpm --filter viewer-live-tail start      # SSE server at http://localhost:1967/api/events (pushes sample events continuously)
pnpm --filter viewer dev                  # launch the Viewer at http://localhost:5173
```

Open *Live Tail* inside the Viewer (bottom-left). It defaults to `/api/events`, so the sample spans/messages/tool events begin appearing immediately. Replace the placeholder emissions in `viewer-live-tail/index.ts` with the tracer calls from your own application, or lift the `LiveTailSink` helper into your service so you can broadcast every event while still persisting to your durable sink.

Environment knobs:

- `ACCORDKIT_LIVE_PORT` — choose a different SSE port (defaults to `1967`).
- `ACCORDKIT_LOG_DIR` — directory backing the `FileSink` (defaults to `.accordkit-logs` under the example).
- `ACCORDKIT_SERVICE` — set the service tag emitted with each event.
- `ACCORDKIT_LIVE_INTERVAL_MS` — control how often the demo emits its synthetic events (defaults to `2000` ms).

## Other demos

- `file-sink-demo` – Emits synthetic events when no API key is configured and falls back to a live completion otherwise.
- `http-sink-demo` – Forwards buffered batches to AccordKit ingest. Run `pnpm --filter http-sink-demo start`; requires `ACCORDKIT_API_KEY` and optionally `ACCORDKIT_REGION`, `ACCORDKIT_BASE_URL`, or `ACCORDKIT_INGEST_ENDPOINT` to target a specific cluster. The sample emits system/user prompts, an external tool call/result, and usage metrics—swap those placeholders for values sourced from your real workflow (SDK responses, HTTP clients, billing helpers).
- `viewer-live-tail` – Bridges tracer events to SSE so the Viewer can render them in real time. Start it with `pnpm --filter viewer-live-tail start`, then open the Viewer dev server and connect to `/api/events`.
