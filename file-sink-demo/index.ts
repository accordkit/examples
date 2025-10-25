import { join } from 'node:path';

import { withOpenAI } from '@accordkit/provider-openai';
import { FileSink, Tracer } from '@accordkit/tracer';
import 'dotenv/config';
import OpenAI from 'openai';

const logDir = process.env.ACCORDKIT_LOG_DIR ?? join(process.cwd(), '.accordkit-logs');
const tracer = new Tracer({ sink: new FileSink({ base: logDir }) });

const apiKey = process.env.OPENAI_API_KEY;

async function emitSampleTrace() {
  console.warn('OPENAI_API_KEY not set; emitting a sample trace instead of calling OpenAI.');

  await tracer.message({ role: 'system', content: 'Sample system prompt for AccordKit demo.' });
  await tracer.message({ role: 'user', content: 'Generate a sample trace event.' });

  const span = tracer.spanStart({ operation: 'demo.sample' });
  await tracer.toolCall({
    tool: 'demoTool',
    input: { note: 'This was generated locally without hitting the OpenAI API.' },
  });
  await tracer.toolResult({
    tool: 'demoTool',
    output: { ok: true, message: 'Sample tool_result emitted.' },
    ok: true,
    latencyMs: 42,
  });
  await tracer.usage({ inputTokens: 12, outputTokens: 18, cost: 0.00012 });
  await tracer.spanEnd(span, { attrs: { synthetic: true } });

  console.log(`Sample trace written. Inspect ${logDir} for the JSONL file.`);
}

async function main() {
  if (!apiKey) {
    await emitSampleTrace();
    return;
  }

  const client = withOpenAI(new OpenAI({ apiKey }), tracer);
  await tracer.message({ role: 'system', content: 'You are a helpful assistant.' });

  try {
    console.log('Calling OpenAI with live credentials...');
    const res = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: 'Say hi to AccordKit' }],
    });
    console.log('OpenAI response:', res.choices[0]?.message?.content);
    console.log(`Trace data has been written successfully. Check ${logDir}.`);
  } catch (error) {
    console.error('OpenAI call failed:', error);
    console.log('Events up to this point were still recorded.');
  }
}

main().catch((err) => {
  console.error('Unexpected error:', err);
  process.exitCode = 1;
});
