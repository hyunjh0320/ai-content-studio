/* ================================================================== */
/*  AI Content Studio — Core Type Definitions                         */
/* ================================================================== */

/* ---- 프로젝트 기획 입력 ------------------------------------------- */
export interface PlanningInput {
  concept: string;           // 프로젝트 핵심 아이디어
  genre: string;             // 장르 (예: animation, documentary)
  targetAudience: string;    // 대상 (예: 어린이, 직장인)
  tone: string;              // 톤 (예: 유쾌함, 감동적, 교육적)
  styleRef: string;          // 비주얼 스타일 레퍼런스
  sceneCount: number;        // 총 씬/컷 수
  language: string;          // 대사 언어 (ko / en / ja)
  characters: CharacterInput[];
  constraints: string[];     // 절대 하지 말아야 할 것들
  additionalNotes: string;   // 추가 지시사항
}

export interface CharacterInput {
  name: string;
  role: string;              // 주인공 / 조연 / 나레이터
  description: string;       // 외형 및 성격
  voiceType: string;         // 목소리 유형 (밝고 활기참 / 차분함 등)
}

/* ---- AI가 생성하는 구조화 기획 결과 --------------------------------- */
export interface ContentPlan {
  project: {
    title: string;
    logline: string;
    genre: string;
    tone: string;
    visualStyle: string;
    targetAudience: string;
    totalDuration: string;
  };
  characters: Character[];
  scenario: {
    outline: string;
    acts: Act[];
  };
  scenes: Scene[];
  globalConstraints: string[];
  productionNotes: ProductionNotes;
}

export interface Character {
  id: string;
  name: string;
  role: string;
  description: string;
  visualDescription: string;   // 이미지 AI용 상세 외형 묘사 (English)
  personality: string;
  voice: VoiceCasting;
}

export interface VoiceCasting {
  gender: "male" | "female" | "neutral";
  tone: string;
  accent: string;
  suggestedTTSVoice: TTSVoice;  // OpenAI TTS voice name
  elevenLabsVoiceId?: string;
}

export type TTSVoice = "alloy" | "echo" | "fable" | "onyx" | "nova" | "shimmer";

export interface Act {
  act: number;
  title: string;
  description: string;
}

export interface Scene {
  id: string;
  title: string;
  act: number;
  order: number;
  durationSeconds: number;
  setting: string;
  mood: string;
  description: string;
  narration: string;           // 나레이션 텍스트 (TTS용)
  dialogues: Dialogue[];
  imagePrompt: ImagePromptSet;
  videoPrompt: VideoPromptSet;
  // 생성 결과
  generatedImageUrl?: string;
  generatedVideoUrl?: string;
  generatedNarrationUrl?: string;
}

export interface Dialogue {
  characterId: string;
  characterName: string;
  line: string;                // 대사 원문
  emotion: string;             // 감정 상태
  action: string;              // 대사 중 행동 묘사
  audioUrl?: string;           // 생성된 TTS 오디오
}

export interface ImagePromptSet {
  main: string;                // 메인 이미지 프롬프트 (English, Flux 최적화)
  characterRef: string;        // 캐릭터 일관성 명령어
  style: string;               // 스타일 수식어
  technical: string;           // 카메라/조명/구도
  negative: string;            // 절대 넣으면 안 되는 것 (negative prompt)
  full: string;                // 위를 합친 완성 프롬프트
}

export interface VideoPromptSet {
  motion: string;              // 움직임 묘사
  camera: string;              // 카메라 무브먼트
  atmosphere: string;          // 분위기/조명
  negative: string;            // 영상에 넣으면 안 되는 것
  full: string;                // 완성 영상 프롬프트
}

export interface ProductionNotes {
  colorPalette: string[];
  lightingStyle: string;
  musicMood: string;
  editingStyle: string;
  voiceNotes: string;
  brandGuidelines: string;
}

/* ---- 생성 상태 ------------------------------------------------------ */
export type GenerationStatus = "idle" | "pending" | "running" | "completed" | "failed";

export interface GenerationTask {
  sceneId: string;
  type: "image" | "video" | "narration" | "dialogue";
  status: GenerationStatus;
  error?: string;
}

/* ---- API 프로바이더 ------------------------------------------------- */
export type TextProvider = "openai";
export type TextModel = "gpt-4o" | "gpt-4o-mini" | "gpt-4-turbo";
export type ImageProvider = "replicate" | "fal" | "openai";
export type VideoProvider = "fal";
export type VoiceProvider = "openai" | "elevenlabs";

/* ---- API 키 저장 ---------------------------------------------------- */
export interface ApiKeys {
  openai: string;
  replicate: string;
  fal: string;
  elevenlabs: string;
}

/* ---- 탭 타입 -------------------------------------------------------- */
export type TabId = "plan" | "scenario" | "image" | "video" | "voice" | "export";
