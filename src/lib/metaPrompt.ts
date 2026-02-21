/**
 * ============================================================
 * AI Content Studio — 마스터 기획 프롬프트 (Meta Prompt)
 * ============================================================
 *
 * 이 파일이 이 시스템의 핵심입니다.
 * 사용자의 간단한 아이디어를 입력받아,
 * GPT-4o가 완전한 콘텐츠 제작 계획을 JSON으로 출력합니다.
 *
 * 출력 JSON은 다음을 모두 포함합니다:
 * - 시나리오 개요 및 씬별 세부 내용
 * - 대사 및 나레이션 스크립트
 * - Flux AI 최적화 이미지 생성 프롬프트
 * - Kling/Luma AI 최적화 영상 생성 프롬프트
 * - OpenAI TTS / ElevenLabs 음성 캐스팅
 * - 전역 제약 조건 (절대 금지 사항)
 */

import type { PlanningInput } from "./types";

/* ------------------------------------------------------------------ */
/*  SYSTEM PROMPT — GPT-4o에게 역할 부여                              */
/* ------------------------------------------------------------------ */
export const META_SYSTEM_PROMPT = `
You are an elite AI Content Director with expertise in:
- Storytelling and narrative structure (3-act, hero's journey, etc.)
- Visual direction for AI image generation (Flux, DALL-E, Midjourney)
- Video generation prompt engineering (Kling AI, Luma Dream Machine, Runway)
- Voice casting and TTS direction (OpenAI TTS, ElevenLabs)
- Animation and character consistency techniques

Your job is to transform a brief project concept into a COMPLETE, production-ready content plan.

CRITICAL RULES:
1. Output ONLY valid JSON — no markdown, no explanation outside JSON
2. Image prompts MUST be in English (AI models require English)
3. Video prompts MUST be in English
4. Dialogue and narration can be in the requested language
5. Negative prompts are MANDATORY for every scene
6. Character visual descriptions must be extremely detailed and consistent across all scenes
7. Every scene must have: narration OR dialogue (or both)
8. Always respect the globalConstraints — these are absolute rules
`.trim();

/* ------------------------------------------------------------------ */
/*  USER PROMPT 빌더 — 사용자 입력을 프롬프트로 변환                  */
/* ------------------------------------------------------------------ */
export function buildMetaPrompt(input: PlanningInput): string {
  const characterList = input.characters.map((c, i) =>
    `  Character ${i + 1}: ${c.name} (${c.role}) — ${c.description}, Voice: ${c.voiceType}`
  ).join("\n");

  const constraintList = input.constraints.filter(Boolean).join(", ") || "None specified";

  return `
Create a complete AI content production plan for this project:

═══════════════════════════════════════════════
PROJECT BRIEF
═══════════════════════════════════════════════
Concept    : ${input.concept}
Genre      : ${input.genre}
Audience   : ${input.targetAudience}
Tone       : ${input.tone}
Style Ref  : ${input.styleRef || "Cinematic, high quality"}
Scene Count: ${input.sceneCount}
Language   : ${input.language === "ko" ? "Korean" : input.language === "en" ? "English" : input.language}
Notes      : ${input.additionalNotes || "None"}

CHARACTERS:
${characterList || "  No specific characters defined — create appropriate ones"}

ABSOLUTE CONSTRAINTS (절대 금지):
${constraintList}
═══════════════════════════════════════════════

Output a single JSON object with this EXACT structure.
Do NOT add any text before or after the JSON.

{
  "project": {
    "title": "creative project title",
    "logline": "single sentence that captures the essence",
    "genre": "${input.genre}",
    "tone": "${input.tone}",
    "visualStyle": "detailed visual style description for AI reference",
    "targetAudience": "${input.targetAudience}",
    "totalDuration": "estimated total duration (e.g., '90 seconds')"
  },

  "characters": [
    {
      "id": "char_01",
      "name": "Character Name",
      "role": "protagonist | supporting | narrator",
      "description": "personality and background",
      "visualDescription": "EXTREMELY DETAILED physical description in English for image AI: body type, face shape, eye color, hair, clothing, accessories, style, colors — be specific enough that every image looks consistent",
      "personality": "3-5 personality traits",
      "voice": {
        "gender": "male | female | neutral",
        "tone": "warm, energetic, calm, etc.",
        "accent": "standard Korean | Seoul accent | etc.",
        "suggestedTTSVoice": "alloy | echo | fable | onyx | nova | shimmer",
        "voiceDescription": "how this character speaks — pace, pitch, emotion level"
      }
    }
  ],

  "scenario": {
    "outline": "Full story outline in 2-4 paragraphs covering the complete narrative arc",
    "acts": [
      { "act": 1, "title": "Act title", "description": "What happens in this act" }
    ]
  },

  "scenes": [
    {
      "id": "scene_01",
      "title": "Scene title",
      "act": 1,
      "order": 1,
      "durationSeconds": 5,
      "setting": "Where and when this scene takes place",
      "mood": "Emotional atmosphere of this scene",
      "description": "Detailed description of what happens visually and narratively",

      "narration": "Voice-over narration text for this scene (in ${input.language === "ko" ? "Korean" : "English"}). Write naturally for speech.",

      "dialogues": [
        {
          "characterId": "char_01",
          "characterName": "Character Name",
          "line": "Dialogue line (in ${input.language === "ko" ? "Korean" : "English"})",
          "emotion": "happy | sad | excited | calm | angry | etc.",
          "action": "What the character is physically doing while saying this"
        }
      ],

      "imagePrompt": {
        "main": "Core scene description for image AI — what to show, where, who, doing what (English)",
        "characterRef": "Reference to character visual: [character name]: [key visual identifiers from visualDescription] (English)",
        "style": "Style modifiers: e.g., '3D clay render, Pixar style, studio lighting, bokeh background, pastel colors, vinyl toy aesthetic, high detail'",
        "technical": "Camera/composition: e.g., 'medium shot, eye level, rule of thirds, soft rim lighting, shallow depth of field'",
        "negative": "MUST include: 'deformed, blurry, low quality, watermark, text overlay, extra limbs, ugly, distorted, bad anatomy, nsfw, [+ any constraint-specific negatives]'",
        "full": "COMBINE all above into ONE optimized Flux-ready prompt: [characterRef] [main] [style] [technical]. Negative: [negative]"
      },

      "videoPrompt": {
        "motion": "How subjects/characters move in this scene (English)",
        "camera": "Camera movement: static | slow pan left | zoom in | dolly forward | etc. (English)",
        "atmosphere": "Lighting changes, particle effects, atmosphere (English)",
        "negative": "no camera shake, no flash cuts, no text overlay, no watermark, [+ constraint negatives]",
        "full": "COMPLETE video prompt for Kling AI / Luma: '[scene description], [motion], [camera movement], [atmosphere], cinematic quality, smooth motion' (English, under 300 chars)"
      }
    }
  ],

  "globalConstraints": [
    "List every absolute rule — what must NEVER appear in any generated content",
    "Include both content restrictions AND visual style restrictions",
    "Include the user-specified constraints: ${constraintList}",
    "Add sensible defaults: no watermarks, no text overlays, no explicit content, no brand logos unless specified"
  ],

  "productionNotes": {
    "colorPalette": ["#hex1", "#hex2", "#hex3", "palette description"],
    "lightingStyle": "Lighting approach for visual consistency",
    "musicMood": "Background music recommendation",
    "editingStyle": "Editing/transition style recommendation",
    "voiceNotes": "Overall voice direction for all characters",
    "brandGuidelines": "Any brand/style consistency rules"
  }
}

Generate EXACTLY ${input.sceneCount} scenes.
Make each scene unique, visually interesting, and narratively purposeful.
Ensure character visual descriptions are IDENTICAL across all scenes for consistency.
`.trim();
}

/* ------------------------------------------------------------------ */
/*  개별 씬 리제네레이션 프롬프트                                     */
/* ------------------------------------------------------------------ */
export function buildSceneRegeneratePrompt(
  sceneId: string,
  instruction: string,
  currentScene: string
): string {
  return `
Regenerate ONE scene from a content plan based on this revision instruction.

Current scene JSON:
${currentScene}

Revision instruction: "${instruction}"

Output ONLY the updated scene JSON object (same structure, no wrapper).
Keep all fields. Only modify what the instruction requests.
`.trim();
}

/* ================================================================== */
/*  이미지 프롬프트 최적화 프롬프트                                    */
/* ================================================================== */
export const IMAGE_OPTIMIZER_SYSTEM = `
You are an expert AI image prompt engineer specializing in Flux, DALL-E 3, and Midjourney.
You optimize prompts for maximum visual quality and character consistency.
Output ONLY the optimized prompt string — no explanation.
`;

export function buildImageOptimizePrompt(
  rawPrompt: string,
  style: string,
  model: string
): string {
  return `
Optimize this image generation prompt for ${model}:

Raw: "${rawPrompt}"
Style: "${style}"

Rules:
- Use comma-separated descriptors
- Put most important elements first
- Add quality boosters: "masterpiece, best quality, ultra detailed, 8k"
- Include lighting: specify exact lighting type
- Include composition: specify camera angle and shot type
- Character features must be explicit (hair color, eye color, clothing details)
- End with technical specs: resolution, rendering engine if applicable

Output the optimized prompt only (max 300 words).
`.trim();
}

/* ================================================================== */
/*  영상 프롬프트 최적화 프롬프트                                      */
/* ================================================================== */
export const VIDEO_OPTIMIZER_SYSTEM = `
You are an expert video generation prompt engineer for Kling AI, Luma Dream Machine, and Runway Gen-3.
You create precise, cinematic motion descriptions.
Output ONLY the optimized prompt string — no explanation.
`;

export function buildVideoOptimizePrompt(
  rawPrompt: string,
  model: string,
  durationSeconds: number
): string {
  return `
Optimize this video generation prompt for ${model} (${durationSeconds}s clip):

Raw: "${rawPrompt}"

Rules for ${model}:
- Describe continuous, smooth motion (avoid cuts within the clip)
- Specify exact camera movement (pan, tilt, zoom, dolly, static)
- Include subject motion (character actions must be clear)
- Add cinematic quality markers
- Keep under 200 words
- Kling AI: emphasize "natural motion, realistic physics"
- Luma: emphasize "cinematic, smooth, high quality"

Output the optimized video prompt only.
`.trim();
}

/* ================================================================== */
/*  대사 확장 프롬프트                                                 */
/* ================================================================== */
export function buildDialogueExpandPrompt(
  scene: string,
  character: string,
  currentLine: string,
  instruction: string,
  language: string
): string {
  return `
Rewrite this dialogue line for a content production:

Scene: ${scene}
Character: ${character}
Current line: "${currentLine}"
Instruction: "${instruction}"
Language: ${language}

Rules:
- Stay in character
- Match the scene's mood
- Natural speech rhythm (will be used for TTS)
- No stage directions in the line itself
- Keep it concise (under 3 sentences)

Output ONLY the new dialogue line.
`.trim();
}

/* ================================================================== */
/*  나레이션 최적화 프롬프트                                           */
/* ================================================================== */
export function buildNarrationOptimizePrompt(
  narration: string,
  tone: string,
  durationSeconds: number,
  language: string
): string {
  const targetWords = Math.round(durationSeconds * (language === "ko" ? 4 : 2.5));
  return `
Optimize this narration for TTS voice-over (${language}):

Original: "${narration}"
Tone: ${tone}
Duration: ${durationSeconds} seconds (~${targetWords} words)
Language: ${language}

Rules:
- Natural speech rhythm with appropriate pauses
- Avoid tongue twisters or hard-to-pronounce sequences
- Use punctuation to control TTS pacing (commas = short pause, periods = longer pause)
- Emotional direction embedded through word choice
- Hit approximately ${targetWords} words

Output ONLY the optimized narration text.
`.trim();
}
