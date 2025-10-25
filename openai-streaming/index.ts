import { join } from 'node:path';

import { withOpenAI } from '@accordkit/provider-openai';
import { FileSink, Tracer } from '@accordkit/tracer';
import 'dotenv/config';
import OpenAI from 'openai';

async function main() {
  const logDir = process.env.ACCORDKIT_LOG_DIR ?? join(process.cwd(), '.accordkit-logs');
  const tracer = new Tracer({ sink: new FileSink({ base: logDir }) });
  const client = withOpenAI(new OpenAI({ apiKey: process.env.OPENAI_API_KEY! }), tracer);

  const stream = await client.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [{ role: 'user', content: 'Stream a 3-line poem about tracing/observability.' }],
    stream: true,
  });

  for await (const chunk of stream) {
    // chunks are normalized in your adapter internals
    process.stdout.write(chunk.choices?.[0]?.delta?.content ?? '');
  }
  console.log('\n-- done --');
}

main().catch((err) => {
  console.error('An unexpected error occurred:', err);
  process.exitCode = 1;
});
