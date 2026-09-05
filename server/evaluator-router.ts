import axios from 'axios';

export interface EvaluationResult {
  technical_score: number;
  voice_mode: 'officer_british' | 'indic_local';
  feedback: string;
  follow_up_question: boolean;
  conversation_round: number;
  is_final: boolean;
  verdict?: 'APPROVED' | 'CONDITIONAL' | 'NOT_CONVINCING';
  raw_transcript: string;
}

export interface ConversationMessage {
  role: 'officer' | 'candidate';
  content: string;
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
  public async evaluateCandidate(
    transcript: string,
    conversationHistory: ConversationMessage[] = [],
    roundNumber: number = 1
  ): Promise<EvaluationResult> {
    const response = await axios.post(
      'https://api.sarvam.ai/v1/chat/completions',
      {
        model: 'sarvam-105b-conversations',
        messages: [
          {
            role: 'system',
            content: `You are an elite H-1B visa consular officer conducting a technical visa interview.
Evaluate the candidate's answer strictly based on TECHNICAL LOGIC and ARCHITECTURAL DEPTH.
IGNORE non-native Indian English accent quirks, grammar mistakes, or colloquial phrasing.

CONTEXT:
- This is a CONVERSATION. The candidate has already given previous answers.
- You MUST remember what the candidate said before and use it to follow up.
- If the candidate's latest answer is strong (score >= 70), ask a relevant DEEPER follow-up question about their specific tech stack.
- If the candidate's latest answer is weak/vague (score < 70), push back skeptically and demand specifics.
- Do NOT repeat questions you've already asked. Each turn must advance the conversation.

DIFFICULTY ESCALATION (based on round number):
- Round 1-2: Friendly, general questions. Let the candidate establish their narrative.
- Round 3-4: Skeptical drilling. Challenge their choices, demand specific metrics and tradeoffs.
- Round 5+: Aggressive. Point out inconsistencies, demand evidence, apply high pressure.

FINAL VERDICT:
- If this is round ${roundNumber}, you must deliver a FINAL VERDICT instead of another question.
- Consider ALL previous answers cumulatively, not just this one.
- APPROVED if consistently strong (avg score >= 75 from all rounds)
- CONDITIONAL if mixed (avg score 55-74) — needs more documentation
- NOT_CONVINCING if consistently weak (avg score < 55)

Rule for voice_mode selection:
- If technical_score < 70 (vague, insufficient detail, or off-topic) -> voice_mode = "officer_british" for strict pushback.
- If technical_score >= 70 (strong architectural detail, precise logic) -> voice_mode = "indic_local" for collaborative follow-up.
- For FINAL VERDICT, ALWAYS use "officer_british" for a formal official tone.

Return output strictly in JSON format:
{
  "technical_score": number (0 to 100),
  "voice_mode": "officer_british" | "indic_local",
  "feedback": "Short direct spoken response + next follow-up question (30 words max). For final verdict: formal verdict statement (40 words max)",
  "follow_up_question": true,
  "conversation_round": number (increment this round),
  "is_final": boolean (true if delivering final verdict, false otherwise),
  "verdict": "APPROVED" | "CONDITIONAL" | "NOT_CONVINCING" (only when is_final is true)
}`
          },
          ...conversationHistory.map((msg) =>
            msg.role === 'officer'
              ? { role: 'assistant' as const, content: msg.content }
              : { role: 'user' as const, content: msg.content }
          ),
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
    let parsed: any;

    // Attempt 1: Direct JSON parse
    try {
      parsed = JSON.parse(content);
    } catch (e) {
      // Attempt 2: Extract JSON object from text using regex
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          parsed = JSON.parse(jsonMatch[0]);
        } catch (e2) {
          // Attempt 3: Use minimal fallback
          parsed = {
            technical_score: 60,
            voice_mode: 'officer_british',
            feedback: 'Please provide more specific technical details about your implementation.',
            follow_up_question: true
          };
        }
      } else {
        // No JSON found at all - use fallback
        parsed = {
          technical_score: 60,
          voice_mode: 'officer_british',
          feedback: content.substring(0, 150) || 'Please elaborate on your technical approach.',
          follow_up_question: true
        };
      }
    }

    return {
      ...parsed,
      conversation_round: parsed.conversation_round || conversationHistory.length + 1,
      is_final: parsed.is_final || false,
      voice_mode: parsed.is_final ? 'officer_british' : (parsed.voice_mode || 'officer_british'),
      raw_transcript: transcript
    };
  }

  /**
   * Step 2: Synthesize the Visa Officer's initial cold-start greeting
   */
  public async synthesizeGreeting(): Promise<TTSPayload> {
    const startTime = Date.now();

    const greetingText =
      "Good morning Vishal, I see you're applying for H1B visa. Tell me about your primary technical work.";

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

    // Final verdicts should ALWAYS use the formal British officer voice (Cartesia)
    if (evalResult.voice_mode === 'officer_british' || evalResult.is_final) {
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