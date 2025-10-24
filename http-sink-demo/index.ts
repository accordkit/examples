import { HttpSink, resolveIngestEndpoint } from '@accordkit/core';
import { Tracer } from '@accordkit/tracer';

const endpoint = resolveIngestEndpoint({
  region: (process.env.ACCORDKIT_REGION as 'eu' | 'us' | 'auto') ?? 'eu',
  baseUrl: process.env.ACCORDKIT_BASE_URL, // optional self-host
});

const tracer = new Tracer({
  sink: new HttpSink({
    endpoint,
    headers: process.env.ACCORDKIT_API_KEY
      ? { authorization: `Bearer ${process.env.ACCORDKIT_API_KEY}` }
      : undefined,
    retry: { retries: 4, baseMs: 300, maxMs: 5000, jitter: true },
  }),
});

await tracer.message({ role: 'system', content: 'HTTP sink demo' });
console.log('Sent one event to', endpoint);
