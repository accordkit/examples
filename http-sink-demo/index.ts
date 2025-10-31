import { createHash } from 'node:crypto';

import { HttpSink, resolveIngestEndpoint, Tracer } from '@accordkit/tracer';
import 'dotenv/config';

type Region = 'eu' | 'us' | 'auto';

async function main() {
  const apiKey = process.env.ACCORDKIT_API_KEY;
  if (!apiKey) {
    console.error('ACCORDKIT_API_KEY is required to authenticate against the ingest endpoint.');
    console.error('Generate a project key in AccordKit and export it before running the demo.');
    process.exitCode = 1;
    return;
  }

  const explicitEndpoint = process.env.ACCORDKIT_INGEST_ENDPOINT;
  const region = (process.env.ACCORDKIT_REGION as Region | undefined) ?? 'auto';
  const baseUrl = process.env.ACCORDKIT_BASE_URL;

  const endpoint =
    explicitEndpoint ??
    resolveIngestEndpoint({
      region,
      baseUrl,
    });

  const httpSink = new HttpSink({
    endpoint,
    headers: { authorization: `Bearer ${apiKey}` },
    batchSize: readNumber('ACCORDKIT_HTTP_BATCH_SIZE', 20),
    flushIntervalMs: readNumber('ACCORDKIT_HTTP_FLUSH_MS', 1000),
    maxBuffer: readNumber('ACCORDKIT_HTTP_MAX_BUFFER', 500),
    retry: {
      retries: readNumber('ACCORDKIT_HTTP_RETRIES', 4),
      baseMs: readNumber('ACCORDKIT_HTTP_RETRY_BASE_MS', 250),
      maxMs: readNumber('ACCORDKIT_HTTP_RETRY_MAX_MS', 5000),
      jitter: true,
    },
    onDropBatch: (lines, err) => {
      console.error(`Dropped a batch of ${lines.length} events after retries`, err);
    },
    idempotencyKey: (lines, attempt) => {
      const digest = createHash('sha1').update(lines.join('\n')).digest('hex');
      return `${digest}-${attempt}`;
    },
  });

  const tracer = new Tracer({
    sink: httpSink,
    service: process.env.ACCORDKIT_SERVICE ?? 'http-sink-demo',
    env: process.env.NODE_ENV ?? 'development',
  });

  console.log(`Sending events to ${endpoint} (region=${region})`);

  // The following events are placeholders that mirror a typical LLM workflow.
  // Swap each section with the real data your application produces:
  //  - system/user messages -> your prompts and model responses
  //  - tool_call/tool_result -> metadata from outbound API/database calls
  //  - usage -> token counts and cost returned by the provider (e.g., OpenAI response.usage)
  await tracer.message({
    role: 'system',
    content: 'HTTP sink demo: illustrating buffered delivery with retries and idempotency.',
  });

  const span = tracer.spanStart({
    operation: 'demo.http_sink.batch',
    attrs: { endpoint },
  });

  await tracer.message({
    role: 'user',
    content: 'Demo tool call for an upstream service.',
    ctx: span.ctx,
  });

  await tracer.toolCall({
    tool: 'demoExternalService',
    input: { url: 'https://example.com/api', method: 'GET' },
    ctx: span.ctx,
  });

  await tracer.toolResult({
    tool: 'demoExternalService',
    output: { status: 200, body: { ok: true } },
    latencyMs: 120,
    ok: true,
    ctx: span.ctx,
  });

  // Replace with provider-sourced usage metrics (e.g., OpenAI completion.usage or your billing service).
  await tracer.usage({
    inputTokens: 42,
    outputTokens: 17,
    cost: 0.00023,
  });

  await tracer.spanEnd(span, {
    status: 'ok',
    attrs: { latencyMs: 120 },
  });

  await tracer.close();

  console.log('All demo events flushed successfully.');
}

function readNumber(envVar: string, fallback: number): number {
  const raw = process.env[envVar];
  if (!raw) return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) {
    console.warn(`Ignoring invalid numeric value for ${envVar}: ${raw}`);
    return fallback;
  }
  return parsed;
}

main().catch((err) => {
  console.error('HTTP sink demo failed:', err);
  process.exitCode = 1;
});
