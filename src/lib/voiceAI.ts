/**
 * Voice AI — TTS 음성 생성 (OpenAI TTS / ElevenLabs)
 * 나레이션 및 캐릭터 대사 음성 생성에 사용
 */

export type TTSProvider = "openai" | "elevenlabs";
export type OpenAIVoice = "alloy" | "echo" | "fable" | "onyx" | "nova" | "shimmer";
export type OpenAITTSModel = "tts-1" | "tts-1-hd";

export const TTS_VOICE_INFO: Record<OpenAIVoice, { label: string; gender: string; character: string }> = {
  alloy:   { label: "Alloy",   gender: "중성",  character: "차분하고 균형 잡힌" },
  echo:    { label: "Echo",    gender: "남성",  character: "깊고 낮은 목소리" },
  fable:   { label: "Fable",   gender: "중성",  character: "밝고 이야기하는 듯한" },
  onyx:    { label: "Onyx",    gender: "남성",  character: "강하고 진중한" },
  nova:    { label: "Nova",    gender: "여성",  character: "활기차고 따뜻한" },
  shimmer: { label: "Shimmer", gender: "여성",  character: "부드럽고 감성적인" },
};

export interface TTSParams {
  provider: TTSProvider;
  apiKey: string;
  text: string;
  voice: OpenAIVoice;          // OpenAI 전용
  model?: OpenAITTSModel;      // OpenAI: tts-1 or tts-1-hd
  speed?: number;              // 0.25 ~ 4.0
  elevenLabsVoiceId?: string;  // ElevenLabs 전용
  outputFormat?: "mp3" | "opus" | "aac" | "flac";
}

/* ------------------------------------------------------------------ */
/*  TTS 생성 → Blob URL 반환                                           */
/* ------------------------------------------------------------------ */
export async function generateVoice(params: TTSParams): Promise<string> {
  if (params.provider === "openai") return callOpenAITTS(params);
  if (params.provider === "elevenlabs") return callElevenLabs(params);
  throw new Error("Unknown TTS provider");
}

/* --- OpenAI TTS --------------------------------------------------- */
async function callOpenAITTS(p: TTSParams): Promise<string> {
  const res = await fetch("https://api.openai.com/v1/audio/speech", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${p.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: p.model || "tts-1",
      input: p.text,
      voice: p.voice,
      speed: p.speed || 1.0,
      response_format: p.outputFormat || "mp3",
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: { message: res.statusText } }));
    throw new Error(err?.error?.message || `OpenAI TTS error ${res.status}`);
  }

  const blob = await res.blob();
  return URL.createObjectURL(blob);
}

/* --- ElevenLabs --------------------------------------------------- */
async function callElevenLabs(p: TTSParams): Promise<string> {
  const voiceId = p.elevenLabsVoiceId || "21m00Tcm4TlvDq8ikWAM"; // default: Rachel

  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
    method: "POST",
    headers: {
      "xi-api-key": p.apiKey,
      "Content-Type": "application/json",
      Accept: "audio/mpeg",
    },
    body: JSON.stringify({
      text: p.text,
      model_id: "eleven_multilingual_v2",
      voice_settings: {
        stability: 0.5,
        similarity_boost: 0.8,
        style: 0.3,
        use_speaker_boost: true,
      },
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err?.detail || `ElevenLabs error ${res.status}`);
  }

  const blob = await res.blob();
  return URL.createObjectURL(blob);
}

/* ------------------------------------------------------------------ */
/*  비용 추정                                                          */
/* ------------------------------------------------------------------ */
export function estimateTTSCost(
  provider: TTSProvider,
  model: OpenAITTSModel,
  texts: string[]
): string {
  const totalChars = texts.reduce((sum, t) => sum + t.length, 0);

  if (provider === "openai") {
    const pricePerChar = model === "tts-1-hd" ? 0.000030 : 0.000015;
    const total = totalChars * pricePerChar;
    return `약 $${total.toFixed(4)} (${totalChars.toLocaleString()}자)`;
  }
  if (provider === "elevenlabs") {
    const pricePerChar = 0.0003;
    const total = totalChars * pricePerChar;
    return `약 $${total.toFixed(4)} (${totalChars.toLocaleString()}자)`;
  }
  return "";
}
