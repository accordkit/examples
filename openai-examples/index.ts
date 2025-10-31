import { createReadStream, existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { withOpenAI, type OpenAIAdapterOptions } from '@accordkit/provider-openai';
import { FileSink, Tracer } from '@accordkit/tracer';
import 'dotenv/config';
import OpenAI from 'openai';

import type {
  ResponseOutputItem,
  ResponseOutputMessage,
} from 'openai/resources/responses/responses';

type ExampleName =
  | 'openai-chat-basic'
  | 'openai-chat-stream'
  | 'openai-responses'
  | 'openai-images'
  | 'openai-tts'
  | 'openai-transcribe'
  | 'openai-translate';

interface ExampleContext {
  client: OpenAI;
  tracer: Tracer;
  logDir: string;
}

interface ExampleDefinition {
  description: string;
  options?: OpenAIAdapterOptions;
  run: (ctx: ExampleContext) => Promise<void>;
}

const EXAMPLES: Record<ExampleName, ExampleDefinition> = {
  'openai-chat-basic': {
    description: 'Single chat completion with structured tracing.',
    async run({ client }) {
      const response = await client.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: 'You are a concise assistant that loves observability.' },
          { role: 'user', content: 'Give me two benefits of tracing LLM apps.' },
        ],
      });

      const message = response.choices[0]?.message?.content ?? '<no content>';
      console.log('\nChat completion result:\n', message);
    },
  },
  'openai-chat-stream': {
    description: 'Chat completion streaming example (delta tokens).',
    async run({ client }) {
      const stream = await client.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: 'Stream short examples about tracing best practices.' },
          { role: 'user', content: 'Stream three numbered tips for debugging chatbots.' },
        ],
        stream: true,
      });

      console.log('\nStreaming response:\n');
      for await (const chunk of stream) {
        const content = chunk.choices?.[0]?.delta?.content;
        if (content) process.stdout.write(content);
      }
      console.log('\n\n-- stream complete --');
    },
  },
  'openai-responses': {
    description: 'Responses API call with instrumentation (enableResponsesApi).',
    options: { enableResponsesApi: true },
    async run({ client }) {
      const response = await client.responses.create({
        model: 'gpt-4.1-mini',
        input: [
          { role: 'system', content: 'You are a helpful assistant.' },
          {
            role: 'user',
            content: 'Summarize how AccordKit captures usage metrics in one sentence.',
          },
        ],
      });

      const text =
        typeof response.output_text === 'string' && response.output_text.length > 0
          ? response.output_text
          : flattenResponseOutput(response.output);

      console.log('\nResponses API result:\n', text || '<no content>');
    },
  },
  'openai-images': {
    description: 'Generate an image and persist the base64 payload (enableImagesApi).',
    options: { enableImagesApi: true },
    async run({ client, logDir }) {
      const image = await client.images.generate({
        model: 'gpt-image-1',
        prompt: 'A minimalist observability dashboard sketched on a whiteboard.',
        size: '1024x1024',
      });

      const b64 = image.data?.[0]?.b64_json;
      if (!b64) {
        console.warn('Image response did not include base64 data.');
        return;
      }

      const outputPath = join(logDir, 'openai-images-dashboard.png');
      await ensureDirectory(logDir);
      await writeFile(outputPath, Buffer.from(b64, 'base64'));
      console.log(`\nImage saved to ${outputPath}`);
    },
  },
  'openai-tts': {
    description: 'Text-to-speech synthesis saved to disk (enableAudioApi).',
    options: { enableAudioApi: true },
    async run({ client, logDir }) {
      const speech = await client.audio.speech.create({
        model: 'gpt-4o-mini-tts',
        voice: 'alloy',
        input: 'Observability reveals hidden issues in your AI chain.',
        response_format: 'mp3',
      });

      const buffer = Buffer.from(await speech.arrayBuffer());
      const outputPath = join(logDir, 'openai-tts-output.mp3');
      await ensureDirectory(logDir);
      await writeFile(outputPath, buffer);
      console.log(`\nSpeech audio saved to ${outputPath}`);
    },
  },
  'openai-transcribe': {
    description:
      'Transcribe local audio input (enableAudioApi). Set ACCORDKIT_TRANSCRIBE_FILE to a valid path.',
    options: { enableAudioApi: true },
    async run({ client }) {
      const audioPath = resolveAudioFile(['ACCORDKIT_TRANSCRIBE_FILE', 'ACCORDKIT_AUDIO_FILE'], {
        purpose: 'transcription',
      });
      if (!audioPath) return;

      const transcription = await client.audio.transcriptions.create({
        model: 'gpt-4o-mini-transcribe',
        file: createReadStream(audioPath),
      });

      console.log('\nTranscription result:\n', transcription.text);
    },
  },
  'openai-translate': {
    description:
      'Translate spoken content to English (enableAudioApi). Set ACCORDKIT_TRANSLATE_FILE or reuse ACCORDKIT_AUDIO_FILE.',
    options: { enableAudioApi: true },
    async run({ client }) {
      const audioPath = resolveAudioFile(['ACCORDKIT_TRANSLATE_FILE', 'ACCORDKIT_AUDIO_FILE'], {
        purpose: 'translation',
      });
      if (!audioPath) return;

      const translation = await client.audio.translations.create({
        model: 'gpt-4o-mini-transcribe',
        file: createReadStream(audioPath),
      });

      console.log('\nTranslation result:\n', translation.text);
    },
  },
};

async function main() {
  const exampleName = process.argv[2] as ExampleName | undefined;
  const exampleNames = Object.keys(EXAMPLES) as ExampleName[];

  if (!exampleName || !(exampleName in EXAMPLES)) {
    printUsage(exampleNames, exampleName);
    process.exitCode = 1;
    return;
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error('OPENAI_API_KEY is required to run these examples.');
    process.exitCode = 1;
    return;
  }

  const logDir = process.env.ACCORDKIT_LOG_DIR ?? join(process.cwd(), '.accordkit-logs');
  await ensureDirectory(logDir);

  const tracer = new Tracer({ sink: new FileSink({ base: logDir }) });
  const definition = EXAMPLES[exampleName];
  const client = createClient(apiKey, tracer, definition.options);

  console.log(`Running ${exampleName}: ${definition.description}`);
  await definition.run({ client, tracer, logDir });
  console.log('\nDone. Inspect logs in:', logDir);
}

function printUsage(exampleNames: ExampleName[], attempted?: string) {
  if (attempted && !exampleNames.includes(attempted as ExampleName)) {
    console.error(`Unknown example "${attempted}".`);
  }

  console.log('Choose one of the available examples:');
  for (const name of exampleNames) {
    const { description } = EXAMPLES[name];
    console.log(`  - ${name}: ${description}`);
  }

  console.log('\nUsage: pnpm start -- <example-name>');
}

function createClient(apiKey: string, tracer: Tracer, options?: OpenAIAdapterOptions) {
  return withOpenAI(new OpenAI({ apiKey }), tracer, options);
}

async function ensureDirectory(dir: string) {
  await mkdir(dir, { recursive: true });
}

function flattenResponseOutput(output: ResponseOutputItem[] | undefined): string {
  if (!Array.isArray(output) || output.length === 0) {
    return '';
  }

  return output
    .map((item) => {
      if (isResponseOutputMessage(item)) {
        return item.content.map(normalizeMessageContent).join('');
      }
      return '';
    })
    .join('');
}

type OutputMessageContent = ResponseOutputMessage['content'][number];

function normalizeMessageContent(part: OutputMessageContent): string {
  if (part.type === 'output_text') {
    return part.text;
  }
  if (part.type === 'refusal') {
    return part.refusal;
  }
  return '';
}

function isResponseOutputMessage(part: ResponseOutputItem): part is ResponseOutputMessage {
  return (
    typeof part === 'object' && part !== null && (part as ResponseOutputMessage).type === 'message'
  );
}

function resolveAudioFile(envVars: string[], meta: { purpose: string }): string | null {
  for (const envVar of envVars) {
    const candidate = process.env[envVar];
    if (!candidate) continue;
    if (!existsSync(candidate)) {
      console.error(
        `The file specified by ${envVar} for ${meta.purpose} was not found: ${candidate}`,
      );
      return null;
    }
    return candidate;
  }

  console.warn(
    `Skipped ${meta.purpose} example. Set one of ${envVars.join(
      ', ',
    )} to a readable audio file path.`,
  );
  return null;
}

main().catch((err) => {
  console.error('An unexpected error occurred:', err);
  process.exitCode = 1;
});
