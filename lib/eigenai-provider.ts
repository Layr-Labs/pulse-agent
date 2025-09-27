import { LanguageModelV1, LanguageModelV1Message, LanguageModelV1StreamPart } from '@ai-sdk/provider';

export interface EigenAIConfig {
  apiKey: string;
  baseURL?: string;
}

export interface EigenAIModelOptions {
  maxTokens?: number;
  temperature?: number;
}

export class EigenAIModel implements LanguageModelV1 {
  readonly specificationVersion = 'v1';
  readonly provider = 'eigenai';
  readonly modelId: string;
  readonly defaultObjectGenerationMode = 'json' as const;

  private config: EigenAIConfig;
  private options: EigenAIModelOptions;

  constructor(modelId: string, config: EigenAIConfig, options: EigenAIModelOptions = {}) {
    this.modelId = modelId;
    this.config = config;
    this.options = options;
  }

  async doGenerate(options: Parameters<LanguageModelV1['doGenerate']>[0]) {
    const { prompt, maxTokens, temperature } = options;

    const body = {
      model: this.modelId,
      messages: prompt.map(this.convertMessage),
      max_tokens: maxTokens ?? this.options.maxTokens ?? 500,
      temperature: temperature ?? this.options.temperature ?? 0.1,
    };

    try {
      const response = await fetch(`${this.config.baseURL ?? 'https://eigenai-sepolia.eigencloud.xyz/v1'}/chat/completions`, {
        method: 'POST',
        headers: {
          'x-api-key': this.config.apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      const choice = data.choices[0];

      return {
        text: choice.message.content,
        usage: {
          promptTokens: data.usage?.prompt_tokens ?? 0,
          completionTokens: data.usage?.completion_tokens ?? 0,
        },
        finishReason: this.mapFinishReason(choice.finish_reason),
        rawCall: { rawPrompt: options.prompt, rawSettings: {} },
        rawResponse: { headers: response.headers },
        warnings: [],
      };
    } catch (error) {
      console.error('Eigen AI API error:', error);
      throw error;
    }
  }

  async doStream(options: Parameters<LanguageModelV1['doStream']>[0]) {
    // For now, we'll implement streaming by falling back to regular generation
    // Eigen AI API may not support streaming, so this is a basic implementation
    const result = await this.doGenerate(options);

    return {
      stream: (async function* () {
        yield {
          type: 'text-delta' as const,
          textDelta: result.text,
        };
        yield {
          type: 'finish' as const,
          finishReason: result.finishReason,
          usage: result.usage,
        };
      })(),
      rawCall: result.rawCall,
      rawResponse: result.rawResponse,
      warnings: result.warnings,
    };
  }

  private convertMessage(message: LanguageModelV1Message) {
    switch (message.role) {
      case 'user':
        return {
          role: 'user' as const,
          content: message.content.map(part => {
            if (part.type === 'text') {
              return part.text;
            }
            throw new Error(`Unsupported message part type: ${part.type}`);
          }).join(''),
        };
      case 'assistant':
        return {
          role: 'assistant' as const,
          content: message.content.map(part => {
            if (part.type === 'text') {
              return part.text;
            }
            throw new Error(`Unsupported message part type: ${part.type}`);
          }).join(''),
        };
      case 'system':
        return {
          role: 'system' as const,
          content: message.content,
        };
      default:
        throw new Error(`Unsupported message role: ${(message as any).role}`);
    }
  }

  private mapFinishReason(finishReason: string) {
    switch (finishReason) {
      case 'stop':
        return 'stop' as const;
      case 'length':
        return 'length' as const;
      case 'content_filter':
        return 'content-filter' as const;
      default:
        return 'other' as const;
    }
  }
}

export function eigenai(modelId: string, options: EigenAIModelOptions = {}) {
  const apiKey = process.env.EIGENAI_API_KEY;

  if (!apiKey) {
    throw new Error('EIGENAI_API_KEY environment variable is not set');
  }

  return new EigenAIModel(modelId, { apiKey }, options);
}