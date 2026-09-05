import axios from 'axios';

export interface EvaluationResult {
  technical_score: number;
  voice_mode: 'officer_british' | 'indic_local';
  feedback: string;
  raw_transcript: string;
}

export interface TTSPayload {
  audioBuffer: Buffer;
  engineUsed: 'Cartesia-Sonic-3.6' | 'Sarvam-Bulbul-v3';
  ttfbMs: number;
}

export class EvaluatorRouter {
  private sarvamKey: string;
  private cartesiaKey: string;

  constructor(sarvamKey: string, cartesiaKey: string) {
    this.sarvamKey = sarvamKey;
    this.cartesiaKey = cartesiaKey;
  }

  /**
   * Step 1: Evaluate Candidate Speech via Sarvam-105B
   */
  public async evaluateCandidate(transcript: string): Promise<EvaluationResult> {
    const response = await axios.post(
      'https://api.sarvam.ai/v1/chat/completions',
      {
        model: 'sarvam-105b-conversations',
        messages: [
          {
            role: 'system',
            content: `You are an elite technical interview/visa officer evaluating a candidate.
Evaluate the candidate's answer strictly based on TECHNICAL LOGIC and ARCHITECTURAL DEPTH.
IGNORE non-native Indian English accent quirks, grammar mistakes, or colloquial phrasing.

Rule for voice_mode selection:
- If technical_score < 70 (vague, insufficient detail, or off-topic) -> set voice_mode to "officer_british" for strict rejection/follow-up.
- If technical_score >= 70 (strong architectural detail, precise logic) -> set voice_mode to "indic_local" for collaborative feedback.

Return output strictly in JSON format:
{
  "technical_score": number (0 to 100),
  "voice_mode": "officer_british" | "indic_local",
  "feedback": "Short direct response to candidate (20 words max)"
}`
          },
          {
            role: 'user',
            content: transcript
          }
        ],
        temperature: 0.1
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'api-subscription-key': this.sarvamKey
        }
      }
    );

    const content = response.data.choices[0].message.content;
    const parsed = JSON.parse(content);
    return {
      ...parsed,
      raw_transcript: transcript
    };
  }

  /**
   * Step 2: Synthesize the Visa Officer's initial cold-start greeting
   */
  public async synthesizeGreeting(): Promise<TTSPayload> {
    const startTime = Date.now();

    const greetingText =
      "Good morning. I am the consular officer handling your visa interview. Please state your name and visa category, and briefly describe your primary technical work or field of study.";

    const response = await axios.post(
      'https://api.cartesia.ai/tts/bytes',
      {
        model_id: 'sonic-3.6',
        transcript: greetingText,
        voice: {
          mode: 'id',
          id: '7cf0e2b1-8daf-4fe4-89ad-f6039398f359' // "Benedict" British Officer
        },
        output_format: {
          container: 'raw',
          encoding: 'pcm_s16le',
          sample_rate: 24000
        }
      },
      {
        headers: {
          'Cartesia-Version': '2024-06-10',
          'X-API-Key': this.cartesiaKey,
          'Content-Type': 'application/json'
        },
        responseType: 'arraybuffer'
      }
    );

    return {
      audioBuffer: Buffer.from(response.data),
      engineUsed: 'Cartesia-Sonic-3.6',
      ttfbMs: Date.now() - startTime
    };
  }

  /**
   * Step 3: Route Feedback Text to the Appropriate TTS Engine
   */
  public async synthesizeRoutedSpeech(evalResult: EvaluationResult): Promise<TTSPayload> {
    const startTime = Date.now();

    if (evalResult.voice_mode === 'officer_british') {
      // Route to Cartesia Sonic 3.6
      const response = await axios.post(
        'https://api.cartesia.ai/tts/bytes',
        {
          model_id: 'sonic-3.6',
          transcript: evalResult.feedback,
          voice: {
            mode: 'id',
            id: '7cf0e2b1-8daf-4fe4-89ad-f6039398f359' // "Benedict" British Officer
          },
          output_format: {
            container: 'raw',
            encoding: 'pcm_s16le',
            sample_rate: 24000
          }
        },
        {
          headers: {
            'Cartesia-Version': '2024-06-10',
            'X-API-Key': this.cartesiaKey,
            'Content-Type': 'application/json'
          },
          responseType: 'arraybuffer'
        }
      );

      return {
        audioBuffer: Buffer.from(response.data),
        engineUsed: 'Cartesia-Sonic-3.6',
        ttfbMs: Date.now() - startTime
      };
    } else {
      // Route to Sarvam Bulbul v3
      const response = await axios.post(
        'https://api.sarvam.ai/text-to-speech',
        {
          text: evalResult.feedback,
          language_code: 'en-IN',
          speaker: 'shubh',
          model: 'bulbul:v3',
          speech_sample_rate: 24000
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'api-subscription-key': this.sarvamKey
          }
        }
      );

      const audioBase64 = response.data.audios?.[0] || '';
      return {
        audioBuffer: Buffer.from(audioBase64, 'base64'),
        engineUsed: 'Sarvam-Bulbul-v3',
        ttfbMs: Date.now() - startTime
      };
    }
  }
}