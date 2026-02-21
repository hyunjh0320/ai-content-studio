"use client";

import { useState, useCallback, useRef } from "react";
import type {
  TabId, ApiKeys, PlanningInput, CharacterInput,
  ContentPlan, Scene, ImageProvider,
} from "@/lib/types";
import { META_SYSTEM_PROMPT, buildMetaPrompt } from "@/lib/metaPrompt";
import { callGPTStream, parseContentPlan } from "@/lib/textAI";
import { generateSceneImage, type ImageGenParams } from "@/lib/imageAI";
import { generateSceneVideo, VIDEO_MODEL_INFO, type VideoModel } from "@/lib/videoAI";
import { generateVoice, TTS_VOICE_INFO, type TTSParams, type OpenAIVoice } from "@/lib/voiceAI";

/* ================================================================== */
/*  Constants                                                          */
/* ================================================================== */
const TABS: { id: TabId; label: string; icon: string }[] = [
  { id: "plan",     label: "기획",     icon: "✦" },
  { id: "scenario", label: "시나리오", icon: "▤" },
  { id: "image",    label: "이미지",   icon: "◧" },
  { id: "video",    label: "영상",     icon: "▶" },
  { id: "voice",    label: "음성",     icon: "♪" },
  { id: "export",   label: "내보내기", icon: "⬇" },
];

const DEFAULT_KEYS: ApiKeys = { openai: "", replicate: "", fal: "", elevenlabs: "" };
const DEFAULT_CHARACTER: CharacterInput = { name: "", role: "주인공", description: "", voiceType: "" };

/* ================================================================== */
/*  Helpers                                                            */
/* ================================================================== */
function ls(key: string, fallback = "") {
  if (typeof window === "undefined") return fallback;
  return localStorage.getItem(key) ?? fallback;
}
function lsSet(key: string, val: string) {
  if (typeof window !== "undefined") localStorage.setItem(key, val);
}

/* ================================================================== */
/*  Sub-components                                                     */
/* ================================================================== */

/* --- StatusBadge -------------------------------------------------- */
function StatusBadge({ status, error }: { status: string; error?: string }) {
  const map: Record<string, string> = {
    idle: "bg-[var(--surface-2)] text-[var(--text-muted)]",
    pending: "bg-yellow-900/40 text-yellow-300",
    running: "bg-blue-900/40 text-blue-300 animate-pulse",
    completed: "bg-green-900/40 text-[var(--success)]",
    failed: "bg-red-900/40 text-[var(--danger)]",
  };
  const label: Record<string, string> = {
    idle: "대기", pending: "준비", running: "생성중...", completed: "완료", failed: "실패",
  };
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${map[status] ?? map.idle}`}
      title={error}>
      {label[status] ?? status}
    </span>
  );
}

/* --- SectionTitle ------------------------------------------------- */
function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
      <span className="w-1 h-5 bg-[var(--accent)] rounded-full inline-block" />
      {children}
    </h2>
  );
}

/* --- ApiKeyInput -------------------------------------------------- */
function ApiKeyInput({ label, value, onChange, placeholder }:
  { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  const [show, setShow] = useState(false);
  return (
    <div>
      <label className="text-xs text-[var(--text-muted)] mb-1 block">{label}</label>
      <div className="flex gap-1">
        <input
          type={show ? "text" : "password"}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder ?? "sk-..."}
          className="flex-1 text-xs px-2 py-1.5 rounded border border-[var(--border)]
                     bg-[var(--surface-2)] text-[var(--text)] font-mono"
        />
        <button onClick={() => setShow(s => !s)}
          className="px-2 text-xs text-[var(--text-muted)] hover:text-white border
                     border-[var(--border)] rounded bg-[var(--surface-2)]">
          {show ? "숨김" : "보기"}
        </button>
      </div>
    </div>
  );
}

/* ================================================================== */
/*  Main Component                                                     */
/* ================================================================== */
export default function Page() {
  /* --- Global state ----------------------------------------------- */
  const [tab, setTab] = useState<TabId>("plan");
  const [apiKeys, setApiKeys] = useState<ApiKeys>(() => ({
    openai:    ls("acs_openai"),
    replicate: ls("acs_replicate"),
    fal:       ls("acs_fal"),
    elevenlabs:ls("acs_elevenlabs"),
  }));
  const [showKeys, setShowKeys] = useState(true);

  /* --- Plan state -------------------------------------------------- */
  const [planning, setPlanning] = useState<PlanningInput>({
    concept: "",
    genre: "animation",
    targetAudience: "어린이",
    tone: "유쾌하고 따뜻한",
    styleRef: "3D clay render, Pixar style",
    sceneCount: 5,
    language: "ko",
    characters: [{ ...DEFAULT_CHARACTER }],
    constraints: [""],
    additionalNotes: "",
  });
  const [textModel, setTextModel] = useState<"gpt-4o" | "gpt-4o-mini">("gpt-4o");
  const [streaming, setStreaming] = useState(false);
  const [streamText, setStreamText] = useState("");
  const [planError, setPlanError] = useState("");
  const [plan, setPlan] = useState<ContentPlan | null>(null);

  /* --- Image state ------------------------------------------------- */
  const [imgProvider, setImgProvider] = useState<ImageProvider>("replicate");
  const [imgModel, setImgModel] = useState("flux-kontext-pro");
  const [imgStatus, setImgStatus] = useState<Record<string, string>>({});
  const [imgError, setImgError] = useState<Record<string, string>>({});

  /* --- Video state ------------------------------------------------- */
  const [vidModel, setVidModel] = useState<VideoModel>("kling-1.6");
  const [vidDuration, setVidDuration] = useState(5);
  const [vidStatus, setVidStatus] = useState<Record<string, string>>({});
  const [vidError, setVidError] = useState<Record<string, string>>({});

  /* --- Voice state ------------------------------------------------- */
  const [ttsProvider, setTtsProvider] = useState<"openai" | "elevenlabs">("openai");
  const [narStatus, setNarStatus] = useState<Record<string, string>>({});
  const [dlgStatus, setDlgStatus] = useState<Record<string, string>>({});

  /* ---------------------------------------------------------------- */
  const setPlanScenes = useCallback((updater: (scenes: Scene[]) => Scene[]) => {
    setPlan(p => p ? { ...p, scenes: updater(p.scenes) } : p);
  }, []);

  /* --- API Key save ----------------------------------------------- */
  function setKey(field: keyof ApiKeys, val: string) {
    setApiKeys(k => { const n = { ...k, [field]: val }; lsSet(`acs_${field}`, val); return n; });
  }

  /* ================================================================ */
  /*  Tab 1 — Plan                                                    */
  /* ================================================================ */
  async function handleGenerate() {
    if (!apiKeys.openai) { setPlanError("OpenAI API Key를 입력해주세요."); return; }
    if (!planning.concept.trim()) { setPlanError("프로젝트 아이디어를 입력해주세요."); return; }

    setStreaming(true);
    setStreamText("");
    setPlanError("");
    setPlan(null);

    let full = "";
    await callGPTStream(
      apiKeys.openai,
      textModel,
      META_SYSTEM_PROMPT,
      buildMetaPrompt(planning),
      (chunk) => { full += chunk; setStreamText(full); },
      (done) => {
        try {
          const parsed = parseContentPlan(done);
          setPlan(parsed);
          setTab("scenario");
        } catch (e) {
          setPlanError(e instanceof Error ? e.message : "파싱 오류");
        }
        setStreaming(false);
      },
      (err) => { setPlanError(err); setStreaming(false); },
    );
  }

  function addCharacter() {
    setPlanning(p => ({ ...p, characters: [...p.characters, { ...DEFAULT_CHARACTER }] }));
  }
  function removeCharacter(i: number) {
    setPlanning(p => ({ ...p, characters: p.characters.filter((_, idx) => idx !== i) }));
  }
  function updateCharacter(i: number, field: keyof CharacterInput, val: string) {
    setPlanning(p => {
      const chars = [...p.characters];
      chars[i] = { ...chars[i], [field]: val };
      return { ...p, characters: chars };
    });
  }

  /* ================================================================ */
  /*  Tab 3 — Image Generation                                        */
  /* ================================================================ */
  async function generateImage(scene: Scene) {
    const key = imgProvider === "openai" ? apiKeys.openai
              : imgProvider === "replicate" ? apiKeys.replicate : apiKeys.fal;
    if (!key) { alert(`${imgProvider} API Key를 입력해주세요.`); return; }

    setImgStatus(s => ({ ...s, [scene.id]: "running" }));
    setImgError(e => ({ ...e, [scene.id]: "" }));

    const params: ImageGenParams = {
      provider: imgProvider,
      model: imgModel as ImageGenParams["model"],
      apiKey: key,
      prompt: scene.imagePrompt.full || scene.imagePrompt.main,
      negativePrompt: scene.imagePrompt.negative,
    };

    try {
      const url = await generateSceneImage(params);
      setPlanScenes(scenes =>
        scenes.map(s => s.id === scene.id ? { ...s, generatedImageUrl: url } : s)
      );
      setImgStatus(s => ({ ...s, [scene.id]: "completed" }));
    } catch (e) {
      const msg = e instanceof Error ? e.message : "오류";
      setImgStatus(s => ({ ...s, [scene.id]: "failed" }));
      setImgError(er => ({ ...er, [scene.id]: msg }));
    }
  }

  async function generateAllImages() {
    if (!plan) return;
    for (const scene of plan.scenes) {
      await generateImage(scene);
    }
  }

  /* ================================================================ */
  /*  Tab 4 — Video Generation                                        */
  /* ================================================================ */
  async function generateVideo(scene: Scene) {
    if (!apiKeys.fal) { alert("FAL API Key를 입력해주세요."); return; }
    if (!scene.generatedImageUrl) {
      alert("먼저 이미지를 생성해주세요. (이미지가 시작 프레임으로 사용됩니다)");
      return;
    }

    setVidStatus(s => ({ ...s, [scene.id]: "running" }));
    setVidError(e => ({ ...e, [scene.id]: "" }));

    try {
      const url = await generateSceneVideo({
        falApiKey: apiKeys.fal,
        model: vidModel,
        prompt: scene.videoPrompt.full || scene.videoPrompt.motion,
        imageUrl: scene.generatedImageUrl,
        durationSeconds: vidDuration,
      });
      setPlanScenes(scenes =>
        scenes.map(s => s.id === scene.id ? { ...s, generatedVideoUrl: url } : s)
      );
      setVidStatus(s => ({ ...s, [scene.id]: "completed" }));
    } catch (e) {
      const msg = e instanceof Error ? e.message : "오류";
      setVidStatus(st => ({ ...st, [scene.id]: "failed" }));
      setVidError(er => ({ ...er, [scene.id]: msg }));
    }
  }

  /* ================================================================ */
  /*  Tab 5 — Voice Generation                                        */
  /* ================================================================ */
  function getVoiceForChar(scene: Scene, charId: string): OpenAIVoice {
    const char = plan?.characters.find(c => c.id === charId);
    return (char?.voice.suggestedTTSVoice as OpenAIVoice) || "alloy";
  }

  async function generateNarration(scene: Scene) {
    if (!scene.narration.trim()) return;
    const key = ttsProvider === "openai" ? apiKeys.openai : apiKeys.elevenlabs;
    if (!key) { alert(`${ttsProvider} API Key를 입력해주세요.`); return; }

    setNarStatus(s => ({ ...s, [scene.id]: "running" }));
    try {
      const params: TTSParams = {
        provider: ttsProvider,
        apiKey: key,
        text: scene.narration,
        voice: "alloy",
      };
      const url = await generateVoice(params);
      setPlanScenes(scenes =>
        scenes.map(s => s.id === scene.id ? { ...s, generatedNarrationUrl: url } : s)
      );
      setNarStatus(s => ({ ...s, [scene.id]: "completed" }));
    } catch (e) {
      setNarStatus(s => ({ ...s, [scene.id]: "failed" }));
    }
  }

  async function generateDialogue(scene: Scene, dlgIdx: number) {
    const dlg = scene.dialogues[dlgIdx];
    if (!dlg?.line.trim()) return;
    const key = ttsProvider === "openai" ? apiKeys.openai : apiKeys.elevenlabs;
    if (!key) { alert(`${ttsProvider} API Key를 입력해주세요.`); return; }

    const taskKey = `${scene.id}_${dlgIdx}`;
    setDlgStatus(s => ({ ...s, [taskKey]: "running" }));
    try {
      const params: TTSParams = {
        provider: ttsProvider,
        apiKey: key,
        text: dlg.line,
        voice: getVoiceForChar(scene, dlg.characterId),
      };
      const url = await generateVoice(params);
      setPlanScenes(scenes =>
        scenes.map(s => {
          if (s.id !== scene.id) return s;
          const newDlgs = s.dialogues.map((d, i) => i === dlgIdx ? { ...d, audioUrl: url } : d);
          return { ...s, dialogues: newDlgs };
        })
      );
      setDlgStatus(s => ({ ...s, [taskKey]: "completed" }));
    } catch {
      setDlgStatus(s => ({ ...s, [taskKey]: "failed" }));
    }
  }

  /* ================================================================ */
  /*  Render helpers                                                   */
  /* ================================================================ */
  const scenesDone = plan?.scenes.filter(s => s.generatedImageUrl).length ?? 0;
  const videoDone  = plan?.scenes.filter(s => s.generatedVideoUrl).length ?? 0;

  /* ================================================================ */
  /*  RENDER                                                           */
  /* ================================================================ */
  return (
    <div className="min-h-screen flex flex-col" style={{ background: "var(--bg)" }}>
      {/* ── Header ─────────────────────────────────────────────────── */}
      <header className="flex items-center justify-between px-6 py-3 border-b border-[var(--border)]"
        style={{ background: "var(--surface)" }}>
        <div className="flex items-center gap-3">
          <span className="text-2xl">✦</span>
          <div>
            <h1 className="text-base font-bold text-white">AI Content Studio</h1>
            <p className="text-xs text-[var(--text-muted)]">시나리오 · 이미지 · 영상 · 음성 통합 제작</p>
          </div>
        </div>
        <button onClick={() => setShowKeys(v => !v)}
          className="text-xs px-3 py-1.5 rounded border border-[var(--border)]
                     text-[var(--text-muted)] hover:text-white hover:border-[var(--accent)]
                     transition-colors">
          {showKeys ? "▲ API Keys 숨기기" : "▼ API Keys 설정"}
        </button>
      </header>

      {/* ── API Keys Panel ─────────────────────────────────────────── */}
      {showKeys && (
        <div className="px-6 py-4 border-b border-[var(--border)]"
          style={{ background: "var(--surface-2)" }}>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 max-w-4xl">
            <ApiKeyInput label="OpenAI (기획·이미지·음성)" value={apiKeys.openai}
              onChange={v => setKey("openai", v)} />
            <ApiKeyInput label="Replicate (이미지)" value={apiKeys.replicate}
              onChange={v => setKey("replicate", v)} placeholder="r8_..." />
            <ApiKeyInput label="FAL AI (이미지·영상)" value={apiKeys.fal}
              onChange={v => setKey("fal", v)} placeholder="fal-..." />
            <ApiKeyInput label="ElevenLabs (음성)" value={apiKeys.elevenlabs}
              onChange={v => setKey("elevenlabs", v)} placeholder="el_..." />
          </div>
          <p className="text-xs text-[var(--text-muted)] mt-2">
            🔐 키는 브라우저 로컬 스토리지에만 저장됩니다. 서버로 전송되지 않습니다.
          </p>
        </div>
      )}

      {/* ── Tab Bar ────────────────────────────────────────────────── */}
      <nav className="flex border-b border-[var(--border)]" style={{ background: "var(--surface)" }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex items-center gap-1.5 px-5 py-3 text-sm font-medium transition-colors
              border-b-2 ${tab === t.id
                ? "border-[var(--accent)] text-white"
                : "border-transparent text-[var(--text-muted)] hover:text-white"}`}>
            <span>{t.icon}</span>
            <span>{t.label}</span>
            {t.id === "scenario" && plan && (
              <span className="ml-1 text-xs bg-[var(--accent)]/20 text-[var(--accent)] px-1.5 rounded-full">
                {plan.scenes.length}
              </span>
            )}
          </button>
        ))}
      </nav>

      {/* ── Tab Content ────────────────────────────────────────────── */}
      <main className="flex-1 overflow-y-auto p-6">

        {/* ========================================================== */}
        {/* TAB 1: PLAN                                                */}
        {/* ========================================================== */}
        {tab === "plan" && (
          <div className="max-w-3xl mx-auto space-y-6">
            <SectionTitle>프로젝트 기획</SectionTitle>

            {/* Basic Info */}
            <div className="p-5 rounded-xl border border-[var(--border)]"
              style={{ background: "var(--surface)" }}>
              <h3 className="text-sm font-semibold text-white mb-4">기본 정보</h3>
              <div className="space-y-3">
                <div>
                  <label className="text-xs text-[var(--text-muted)] mb-1 block">프로젝트 아이디어 *</label>
                  <textarea
                    rows={3}
                    value={planning.concept}
                    onChange={e => setPlanning(p => ({ ...p, concept: e.target.value }))}
                    placeholder="예: 치아 캐릭터 '치치'가 양치질의 중요성을 알려주는 3D 클레이 애니메이션"
                    className="w-full px-3 py-2 rounded border border-[var(--border)] text-sm resize-none"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-[var(--text-muted)] mb-1 block">장르</label>
                    <input value={planning.genre}
                      onChange={e => setPlanning(p => ({ ...p, genre: e.target.value }))}
                      placeholder="animation, documentary, ad..." className="w-full px-3 py-2 rounded border border-[var(--border)] text-sm" />
                  </div>
                  <div>
                    <label className="text-xs text-[var(--text-muted)] mb-1 block">대상</label>
                    <input value={planning.targetAudience}
                      onChange={e => setPlanning(p => ({ ...p, targetAudience: e.target.value }))}
                      placeholder="어린이, 직장인..." className="w-full px-3 py-2 rounded border border-[var(--border)] text-sm" />
                  </div>
                  <div>
                    <label className="text-xs text-[var(--text-muted)] mb-1 block">톤/분위기</label>
                    <input value={planning.tone}
                      onChange={e => setPlanning(p => ({ ...p, tone: e.target.value }))}
                      placeholder="유쾌하고 따뜻한" className="w-full px-3 py-2 rounded border border-[var(--border)] text-sm" />
                  </div>
                  <div>
                    <label className="text-xs text-[var(--text-muted)] mb-1 block">비주얼 스타일</label>
                    <input value={planning.styleRef}
                      onChange={e => setPlanning(p => ({ ...p, styleRef: e.target.value }))}
                      placeholder="3D clay render, Pixar style..." className="w-full px-3 py-2 rounded border border-[var(--border)] text-sm" />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="text-xs text-[var(--text-muted)] mb-1 block">씬 수</label>
                    <input type="number" min={1} max={20} value={planning.sceneCount}
                      onChange={e => setPlanning(p => ({ ...p, sceneCount: parseInt(e.target.value) || 5 }))}
                      className="w-full px-3 py-2 rounded border border-[var(--border)] text-sm" />
                  </div>
                  <div>
                    <label className="text-xs text-[var(--text-muted)] mb-1 block">대사 언어</label>
                    <select value={planning.language}
                      onChange={e => setPlanning(p => ({ ...p, language: e.target.value }))}
                      className="w-full px-3 py-2 rounded border border-[var(--border)] text-sm">
                      <option value="ko">한국어</option>
                      <option value="en">English</option>
                      <option value="ja">日本語</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-[var(--text-muted)] mb-1 block">AI 모델</label>
                    <select value={textModel} onChange={e => setTextModel(e.target.value as typeof textModel)}
                      className="w-full px-3 py-2 rounded border border-[var(--border)] text-sm">
                      <option value="gpt-4o">GPT-4o (고품질)</option>
                      <option value="gpt-4o-mini">GPT-4o mini (빠름)</option>
                    </select>
                  </div>
                </div>
              </div>
            </div>

            {/* Characters */}
            <div className="p-5 rounded-xl border border-[var(--border)]"
              style={{ background: "var(--surface)" }}>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-white">캐릭터</h3>
                <button onClick={addCharacter}
                  className="text-xs px-3 py-1 rounded border border-[var(--accent)] text-[var(--accent)] hover:bg-[var(--accent)]/10">
                  + 캐릭터 추가
                </button>
              </div>
              <div className="space-y-3">
                {planning.characters.map((c, i) => (
                  <div key={i} className="p-3 rounded-lg border border-[var(--border)]"
                    style={{ background: "var(--surface-2)" }}>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-medium text-[var(--accent)]">캐릭터 {i + 1}</span>
                      {i > 0 && (
                        <button onClick={() => removeCharacter(i)}
                          className="text-xs text-[var(--danger)] hover:underline">삭제</button>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <input value={c.name} placeholder="이름"
                        onChange={e => updateCharacter(i, "name", e.target.value)}
                        className="px-2 py-1.5 rounded border border-[var(--border)] text-sm" />
                      <select value={c.role} onChange={e => updateCharacter(i, "role", e.target.value)}
                        className="px-2 py-1.5 rounded border border-[var(--border)] text-sm">
                        <option value="주인공">주인공</option>
                        <option value="조연">조연</option>
                        <option value="나레이터">나레이터</option>
                      </select>
                      <input value={c.description} placeholder="외형 및 성격 설명"
                        onChange={e => updateCharacter(i, "description", e.target.value)}
                        className="col-span-2 px-2 py-1.5 rounded border border-[var(--border)] text-sm" />
                      <input value={c.voiceType} placeholder="목소리 유형 (밝고 활기찬, 차분한...)"
                        onChange={e => updateCharacter(i, "voiceType", e.target.value)}
                        className="col-span-2 px-2 py-1.5 rounded border border-[var(--border)] text-sm" />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Constraints */}
            <div className="p-5 rounded-xl border border-[var(--border)]"
              style={{ background: "var(--surface)" }}>
              <h3 className="text-sm font-semibold text-white mb-3">절대 금지 사항</h3>
              <div className="space-y-2">
                {planning.constraints.map((c, i) => (
                  <div key={i} className="flex gap-2">
                    <input value={c} placeholder="예: 폭력적인 장면, 특정 브랜드 로고..."
                      onChange={e => {
                        const arr = [...planning.constraints];
                        arr[i] = e.target.value;
                        setPlanning(p => ({ ...p, constraints: arr }));
                      }}
                      className="flex-1 px-2 py-1.5 rounded border border-[var(--border)] text-sm" />
                    <button onClick={() => setPlanning(p => ({
                      ...p, constraints: p.constraints.filter((_, idx) => idx !== i)
                    }))} className="text-[var(--danger)] px-2 text-lg">×</button>
                  </div>
                ))}
                <button onClick={() => setPlanning(p => ({ ...p, constraints: [...p.constraints, ""] }))}
                  className="text-xs text-[var(--text-muted)] hover:text-white">+ 금지 사항 추가</button>
              </div>
            </div>

            {/* Additional Notes */}
            <div className="p-5 rounded-xl border border-[var(--border)]"
              style={{ background: "var(--surface)" }}>
              <label className="text-sm font-semibold text-white mb-2 block">추가 지시사항</label>
              <textarea rows={2} value={planning.additionalNotes}
                onChange={e => setPlanning(p => ({ ...p, additionalNotes: e.target.value }))}
                placeholder="기타 특별한 요청사항을 자유롭게 입력해주세요."
                className="w-full px-3 py-2 rounded border border-[var(--border)] text-sm resize-none" />
            </div>

            {/* Generate Button */}
            <button onClick={handleGenerate} disabled={streaming}
              className="w-full py-3.5 rounded-xl font-bold text-white text-sm transition-all
                         disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ background: streaming ? "var(--surface-2)" : "var(--accent)" }}>
              {streaming ? "✦ AI가 기획 중... (스트리밍)" : "✦ AI로 전체 기획 생성하기"}
            </button>

            {planError && (
              <div className="p-3 rounded-lg text-sm text-[var(--danger)] border border-[var(--danger)]/30"
                style={{ background: "var(--surface)" }}>
                {planError}
              </div>
            )}

            {/* Streaming Preview */}
            {streaming && streamText && (
              <div className="p-4 rounded-xl border border-[var(--border)] font-mono text-xs
                             text-[var(--text-muted)] max-h-64 overflow-y-auto"
                style={{ background: "var(--surface)" }}>
                <div className="text-[var(--accent)] mb-2 text-xs font-sans font-semibold">
                  AI 응답 스트리밍 중...
                </div>
                <pre className="whitespace-pre-wrap break-all streaming-cursor">{streamText}</pre>
              </div>
            )}

            {plan && !streaming && (
              <div className="p-4 rounded-xl border border-[var(--success)]/30"
                style={{ background: "var(--surface)" }}>
                <p className="text-[var(--success)] text-sm font-semibold">
                  ✓ 기획 완성! — {plan.project.title}
                </p>
                <p className="text-xs text-[var(--text-muted)] mt-1">{plan.project.logline}</p>
                <p className="text-xs text-[var(--text-muted)] mt-1">
                  씬 {plan.scenes.length}개 · 캐릭터 {plan.characters.length}명
                </p>
                <button onClick={() => setTab("scenario")}
                  className="mt-2 text-xs text-[var(--accent)] hover:underline">
                  시나리오 탭으로 이동 →
                </button>
              </div>
            )}
          </div>
        )}

        {/* ========================================================== */}
        {/* TAB 2: SCENARIO                                            */}
        {/* ========================================================== */}
        {tab === "scenario" && (
          <div className="max-w-3xl mx-auto space-y-6">
            {!plan ? (
              <div className="text-center py-20 text-[var(--text-muted)]">
                기획 탭에서 먼저 AI 기획을 생성해주세요.
              </div>
            ) : (
              <>
                {/* Project Overview */}
                <div className="p-5 rounded-xl border border-[var(--border)]"
                  style={{ background: "var(--surface)" }}>
                  <div className="flex items-start justify-between">
                    <div>
                      <h2 className="text-lg font-bold text-white">{plan.project.title}</h2>
                      <p className="text-sm text-[var(--text-muted)] mt-1">{plan.project.logline}</p>
                    </div>
                    <span className="text-xs px-2 py-1 rounded bg-[var(--accent)]/20 text-[var(--accent)]">
                      {plan.project.genre}
                    </span>
                  </div>
                  <div className="mt-3 grid grid-cols-3 gap-3 text-xs">
                    <div><span className="text-[var(--text-muted)]">대상: </span>{plan.project.targetAudience}</div>
                    <div><span className="text-[var(--text-muted)]">분위기: </span>{plan.project.tone}</div>
                    <div><span className="text-[var(--text-muted)]">길이: </span>{plan.project.totalDuration}</div>
                  </div>
                </div>

                {/* Characters */}
                <div>
                  <SectionTitle>캐릭터</SectionTitle>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {plan.characters.map(c => (
                      <div key={c.id} className="p-4 rounded-xl border border-[var(--border)]"
                        style={{ background: "var(--surface)" }}>
                        <div className="flex items-center justify-between mb-2">
                          <span className="font-semibold text-white text-sm">{c.name}</span>
                          <span className="text-xs text-[var(--text-muted)]">{c.role}</span>
                        </div>
                        <p className="text-xs text-[var(--text-muted)] mb-2">{c.personality}</p>
                        <div className="flex items-center gap-2 text-xs">
                          <span className="px-2 py-0.5 rounded-full bg-[var(--surface-2)] border border-[var(--border)]">
                            🎙 {TTS_VOICE_INFO[c.voice.suggestedTTSVoice]?.label ?? c.voice.suggestedTTSVoice}
                          </span>
                          <span className="text-[var(--text-muted)]">{c.voice.tone}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Scenario Outline */}
                <div className="p-5 rounded-xl border border-[var(--border)]"
                  style={{ background: "var(--surface)" }}>
                  <SectionTitle>스토리 개요</SectionTitle>
                  <p className="text-sm text-[var(--text-muted)] leading-relaxed">{plan.scenario.outline}</p>
                </div>

                {/* Scenes */}
                <div>
                  <SectionTitle>씬 목록</SectionTitle>
                  <div className="space-y-4">
                    {plan.scenes.map((scene, idx) => (
                      <div key={scene.id} className="p-5 rounded-xl border border-[var(--border)]"
                        style={{ background: "var(--surface)" }}>
                        <div className="flex items-start justify-between mb-3">
                          <div>
                            <span className="text-xs text-[var(--accent)] font-mono">
                              ACT {scene.act} · SCENE {scene.order}
                            </span>
                            <h3 className="font-semibold text-white text-sm mt-0.5">{scene.title}</h3>
                            <p className="text-xs text-[var(--text-muted)]">{scene.setting} · {scene.durationSeconds}초 · {scene.mood}</p>
                          </div>
                          <div className="flex gap-1">
                            {scene.generatedImageUrl && <StatusBadge status="completed" />}
                          </div>
                        </div>

                        <p className="text-sm text-[var(--text-muted)] mb-3">{scene.description}</p>

                        {/* Narration */}
                        {scene.narration && (
                          <div className="mb-3 p-3 rounded-lg border border-[var(--border)]"
                            style={{ background: "var(--surface-2)" }}>
                            <span className="text-xs font-semibold text-[var(--accent-2)]">나레이션</span>
                            <textarea rows={2}
                              value={scene.narration}
                              onChange={e => {
                                const val = e.target.value;
                                setPlanScenes(s => s.map(sc =>
                                  sc.id === scene.id ? { ...sc, narration: val } : sc
                                ));
                              }}
                              className="w-full mt-1 px-2 py-1 text-xs rounded border border-[var(--border)] resize-none"
                            />
                          </div>
                        )}

                        {/* Dialogues */}
                        {scene.dialogues.length > 0 && (
                          <div className="space-y-2">
                            {scene.dialogues.map((d, di) => (
                              <div key={di} className="flex gap-2 items-start p-2 rounded-lg"
                                style={{ background: "var(--surface-2)" }}>
                                <span className="text-xs font-medium text-[var(--accent)] whitespace-nowrap mt-1">
                                  {d.characterName}
                                </span>
                                <textarea rows={1}
                                  value={d.line}
                                  onChange={e => {
                                    const val = e.target.value;
                                    setPlanScenes(s => s.map(sc => {
                                      if (sc.id !== scene.id) return sc;
                                      const dlgs = sc.dialogues.map((dd, ddi) =>
                                        ddi === di ? { ...dd, line: val } : dd
                                      );
                                      return { ...sc, dialogues: dlgs };
                                    }));
                                  }}
                                  className="flex-1 px-2 py-1 text-xs rounded border border-[var(--border)] resize-none"
                                />
                                <span className="text-xs text-[var(--text-muted)] whitespace-nowrap mt-1">
                                  {d.emotion}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {/* ========================================================== */}
        {/* TAB 3: IMAGE                                               */}
        {/* ========================================================== */}
        {tab === "image" && (
          <div className="max-w-4xl mx-auto space-y-6">
            {!plan ? (
              <div className="text-center py-20 text-[var(--text-muted)]">
                기획 탭에서 먼저 AI 기획을 생성해주세요.
              </div>
            ) : (
              <>
                {/* Provider Settings */}
                <div className="p-5 rounded-xl border border-[var(--border)]"
                  style={{ background: "var(--surface)" }}>
                  <SectionTitle>이미지 생성 설정</SectionTitle>
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <label className="text-xs text-[var(--text-muted)] mb-1 block">공급자</label>
                      <select value={imgProvider}
                        onChange={e => setImgProvider(e.target.value as ImageProvider)}
                        className="w-full px-3 py-2 rounded border border-[var(--border)] text-sm">
                        <option value="replicate">Replicate (Flux)</option>
                        <option value="fal">FAL AI</option>
                        <option value="openai">OpenAI</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-xs text-[var(--text-muted)] mb-1 block">모델</label>
                      <select value={imgModel} onChange={e => setImgModel(e.target.value)}
                        className="w-full px-3 py-2 rounded border border-[var(--border)] text-sm">
                        {imgProvider === "replicate" && <>
                          <option value="flux-kontext-pro">Flux Kontext Pro (~$0.04)</option>
                          <option value="flux-1.1-pro">Flux 1.1 Pro (~$0.04)</option>
                          <option value="flux-dev">Flux Dev (~$0.003)</option>
                        </>}
                        {imgProvider === "fal" && <>
                          <option value="fal-flux-kontext">FAL Flux Kontext (~$0.05)</option>
                          <option value="fal-flux-pro">FAL Flux Pro</option>
                        </>}
                        {imgProvider === "openai" && <>
                          <option value="gpt-image-1">GPT Image-1 (~$0.17)</option>
                        </>}
                      </select>
                    </div>
                    <div className="flex items-end">
                      <button onClick={generateAllImages}
                        className="w-full py-2 rounded border border-[var(--accent)] text-[var(--accent)]
                                   text-sm hover:bg-[var(--accent)]/10 transition-colors">
                        전체 씬 이미지 생성
                      </button>
                    </div>
                  </div>
                  <p className="text-xs text-[var(--text-muted)] mt-2">
                    완료: {scenesDone}/{plan.scenes.length} 씬
                  </p>
                </div>

                {/* Scene Cards */}
                <div className="space-y-4">
                  {plan.scenes.map(scene => (
                    <div key={scene.id} className="p-5 rounded-xl border border-[var(--border)]"
                      style={{ background: "var(--surface)" }}>
                      <div className="flex items-start gap-4">
                        {/* Image Preview */}
                        <div className="w-40 h-28 rounded-lg border border-[var(--border)] flex-shrink-0
                                        overflow-hidden flex items-center justify-center"
                          style={{ background: "var(--surface-2)" }}>
                          {scene.generatedImageUrl ? (
                            <img src={scene.generatedImageUrl} alt={scene.title}
                              className="w-full h-full object-cover" />
                          ) : (
                            <span className="text-3xl opacity-20">◧</span>
                          )}
                        </div>

                        {/* Scene Info */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between mb-2">
                            <h3 className="text-sm font-semibold text-white">
                              Scene {scene.order}: {scene.title}
                            </h3>
                            <StatusBadge status={imgStatus[scene.id] ?? "idle"}
                              error={imgError[scene.id]} />
                          </div>

                          {/* Prompt */}
                          <div className="mb-2">
                            <label className="text-xs text-[var(--text-muted)]">이미지 프롬프트</label>
                            <textarea rows={3} value={scene.imagePrompt.full || scene.imagePrompt.main}
                              onChange={e => {
                                const val = e.target.value;
                                setPlanScenes(s => s.map(sc =>
                                  sc.id === scene.id
                                    ? { ...sc, imagePrompt: { ...sc.imagePrompt, full: val } }
                                    : sc
                                ));
                              }}
                              className="w-full mt-1 px-2 py-1.5 text-xs rounded border border-[var(--border)] resize-none font-mono"
                            />
                          </div>
                          <div className="mb-3">
                            <label className="text-xs text-[var(--text-muted)]">네거티브</label>
                            <input value={scene.imagePrompt.negative}
                              onChange={e => {
                                const val = e.target.value;
                                setPlanScenes(s => s.map(sc =>
                                  sc.id === scene.id
                                    ? { ...sc, imagePrompt: { ...sc.imagePrompt, negative: val } }
                                    : sc
                                ));
                              }}
                              className="w-full mt-1 px-2 py-1.5 text-xs rounded border border-[var(--border)] font-mono"
                            />
                          </div>

                          <div className="flex gap-2">
                            <button onClick={() => generateImage(scene)}
                              disabled={imgStatus[scene.id] === "running"}
                              className="px-4 py-1.5 rounded text-xs font-medium text-white
                                         disabled:opacity-50 transition-colors"
                              style={{ background: "var(--accent)" }}>
                              {imgStatus[scene.id] === "running" ? "생성 중..." : "이미지 생성"}
                            </button>
                            {scene.generatedImageUrl && (
                              <a href={scene.generatedImageUrl} target="_blank" rel="noreferrer"
                                className="px-3 py-1.5 rounded text-xs border border-[var(--border)]
                                           text-[var(--text-muted)] hover:text-white">
                                원본 보기
                              </a>
                            )}
                          </div>

                          {imgError[scene.id] && (
                            <p className="text-xs text-[var(--danger)] mt-1">{imgError[scene.id]}</p>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {/* ========================================================== */}
        {/* TAB 4: VIDEO                                               */}
        {/* ========================================================== */}
        {tab === "video" && (
          <div className="max-w-4xl mx-auto space-y-6">
            {!plan ? (
              <div className="text-center py-20 text-[var(--text-muted)]">
                기획 탭에서 먼저 AI 기획을 생성해주세요.
              </div>
            ) : (
              <>
                {/* Settings */}
                <div className="p-5 rounded-xl border border-[var(--border)]"
                  style={{ background: "var(--surface)" }}>
                  <SectionTitle>영상 생성 설정 (FAL AI)</SectionTitle>
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <label className="text-xs text-[var(--text-muted)] mb-1 block">모델</label>
                      <select value={vidModel}
                        onChange={e => setVidModel(e.target.value as VideoModel)}
                        className="w-full px-3 py-2 rounded border border-[var(--border)] text-sm">
                        {Object.entries(VIDEO_MODEL_INFO).map(([k, v]) => (
                          <option key={k} value={k}>
                            {v.label} · {v.price} {v.note ? `· ${v.note}` : ""}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="text-xs text-[var(--text-muted)] mb-1 block">길이 (초)</label>
                      <select value={vidDuration} onChange={e => setVidDuration(Number(e.target.value))}
                        className="w-full px-3 py-2 rounded border border-[var(--border)] text-sm">
                        <option value={5}>5초</option>
                        <option value={6}>6초</option>
                        <option value={8}>8초</option>
                        <option value={10}>10초</option>
                      </select>
                    </div>
                    <div className="flex items-end">
                      <p className="text-xs text-[var(--text-muted)]">
                        완료: {videoDone}/{plan.scenes.length} · 이미지 먼저 생성 필요
                      </p>
                    </div>
                  </div>
                </div>

                {/* Scene Cards */}
                <div className="space-y-4">
                  {plan.scenes.map(scene => (
                    <div key={scene.id} className="p-5 rounded-xl border border-[var(--border)]"
                      style={{ background: "var(--surface)" }}>
                      <div className="flex gap-4">
                        {/* Thumbnail */}
                        <div className="w-32 flex-shrink-0">
                          {scene.generatedVideoUrl ? (
                            <video src={scene.generatedVideoUrl} controls
                              className="w-full rounded-lg border border-[var(--border)]" />
                          ) : scene.generatedImageUrl ? (
                            <img src={scene.generatedImageUrl} alt=""
                              className="w-full h-20 object-cover rounded-lg border border-[var(--border)] opacity-60" />
                          ) : (
                            <div className="w-full h-20 rounded-lg border border-[var(--border)] flex items-center justify-center"
                              style={{ background: "var(--surface-2)" }}>
                              <span className="text-2xl opacity-20">▶</span>
                            </div>
                          )}
                        </div>

                        <div className="flex-1">
                          <div className="flex items-center justify-between mb-2">
                            <h3 className="text-sm font-semibold text-white">
                              Scene {scene.order}: {scene.title}
                            </h3>
                            <StatusBadge status={vidStatus[scene.id] ?? "idle"}
                              error={vidError[scene.id]} />
                          </div>

                          <div className="mb-3">
                            <label className="text-xs text-[var(--text-muted)]">영상 프롬프트</label>
                            <textarea rows={3} value={scene.videoPrompt.full || scene.videoPrompt.motion}
                              onChange={e => {
                                const val = e.target.value;
                                setPlanScenes(s => s.map(sc =>
                                  sc.id === scene.id
                                    ? { ...sc, videoPrompt: { ...sc.videoPrompt, full: val } }
                                    : sc
                                ));
                              }}
                              className="w-full mt-1 px-2 py-1.5 text-xs rounded border border-[var(--border)] resize-none font-mono"
                            />
                          </div>

                          <div className="flex gap-2 items-center">
                            <button onClick={() => generateVideo(scene)}
                              disabled={vidStatus[scene.id] === "running" || !scene.generatedImageUrl}
                              className="px-4 py-1.5 rounded text-xs font-medium text-white
                                         disabled:opacity-40 transition-colors"
                              style={{ background: "var(--accent-2)" }}>
                              {vidStatus[scene.id] === "running" ? "생성 중... (최대 7분)" : "영상 생성"}
                            </button>
                            {!scene.generatedImageUrl && (
                              <span className="text-xs text-[var(--warning)]">⚠ 이미지 필요</span>
                            )}
                            {vidError[scene.id] && (
                              <span className="text-xs text-[var(--danger)]">{vidError[scene.id]}</span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {/* ========================================================== */}
        {/* TAB 5: VOICE                                               */}
        {/* ========================================================== */}
        {tab === "voice" && (
          <div className="max-w-3xl mx-auto space-y-6">
            {!plan ? (
              <div className="text-center py-20 text-[var(--text-muted)]">
                기획 탭에서 먼저 AI 기획을 생성해주세요.
              </div>
            ) : (
              <>
                {/* TTS Provider Settings */}
                <div className="p-5 rounded-xl border border-[var(--border)]"
                  style={{ background: "var(--surface)" }}>
                  <SectionTitle>음성 생성 설정</SectionTitle>
                  <div className="flex gap-3">
                    {(["openai", "elevenlabs"] as const).map(p => (
                      <button key={p} onClick={() => setTtsProvider(p)}
                        className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors
                          ${ttsProvider === p
                            ? "border-[var(--accent)] text-white bg-[var(--accent)]/20"
                            : "border-[var(--border)] text-[var(--text-muted)] hover:text-white"}`}>
                        {p === "openai" ? "OpenAI TTS" : "ElevenLabs"}
                      </button>
                    ))}
                  </div>

                  {/* Character voice mapping */}
                  <div className="mt-4">
                    <p className="text-xs text-[var(--text-muted)] mb-2">캐릭터 음성 배정</p>
                    <div className="space-y-2">
                      {plan.characters.map(c => (
                        <div key={c.id} className="flex items-center gap-3 text-xs">
                          <span className="w-24 text-white truncate">{c.name}</span>
                          <span className="px-2 py-0.5 rounded bg-[var(--surface-2)] border border-[var(--border)]">
                            {TTS_VOICE_INFO[c.voice.suggestedTTSVoice]?.label ?? c.voice.suggestedTTSVoice}
                          </span>
                          <span className="text-[var(--text-muted)]">{c.voice.tone}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Per-scene voice generation */}
                <div className="space-y-4">
                  {plan.scenes.map(scene => (
                    <div key={scene.id} className="p-5 rounded-xl border border-[var(--border)]"
                      style={{ background: "var(--surface)" }}>
                      <h3 className="text-sm font-semibold text-white mb-3">
                        Scene {scene.order}: {scene.title}
                      </h3>

                      {/* Narration */}
                      {scene.narration && (
                        <div className="mb-4 p-3 rounded-lg border border-[var(--border)]"
                          style={{ background: "var(--surface-2)" }}>
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-xs font-semibold text-[var(--accent-2)]">나레이션</span>
                            <StatusBadge status={narStatus[scene.id] ?? "idle"} />
                          </div>
                          <p className="text-xs text-[var(--text-muted)] mb-2">{scene.narration}</p>
                          {scene.generatedNarrationUrl && (
                            <audio src={scene.generatedNarrationUrl} controls className="w-full h-8 mb-2" />
                          )}
                          <button onClick={() => generateNarration(scene)}
                            disabled={narStatus[scene.id] === "running"}
                            className="px-3 py-1 rounded text-xs border border-[var(--accent-2)]
                                       text-[var(--accent-2)] hover:bg-[var(--accent-2)]/10
                                       disabled:opacity-50">
                            {narStatus[scene.id] === "running" ? "생성 중..." : "나레이션 생성"}
                          </button>
                        </div>
                      )}

                      {/* Dialogues */}
                      {scene.dialogues.map((d, di) => {
                        const key = `${scene.id}_${di}`;
                        return (
                          <div key={di} className="mb-3 p-3 rounded-lg border border-[var(--border)]"
                            style={{ background: "var(--surface-2)" }}>
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-xs font-semibold text-[var(--accent)]">
                                {d.characterName}
                              </span>
                              <StatusBadge status={dlgStatus[key] ?? "idle"} />
                            </div>
                            <p className="text-xs text-[var(--text-muted)] mb-2">
                              "{d.line}" <em className="opacity-60">({d.emotion})</em>
                            </p>
                            {d.audioUrl && (
                              <audio src={d.audioUrl} controls className="w-full h-8 mb-2" />
                            )}
                            <button onClick={() => generateDialogue(scene, di)}
                              disabled={dlgStatus[key] === "running"}
                              className="px-3 py-1 rounded text-xs border border-[var(--border)]
                                         text-[var(--text-muted)] hover:text-white hover:border-[var(--accent)]
                                         disabled:opacity-50">
                              {dlgStatus[key] === "running" ? "생성 중..." : "대사 음성 생성"}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {/* ========================================================== */}
        {/* TAB 6: EXPORT                                              */}
        {/* ========================================================== */}
        {tab === "export" && (
          <div className="max-w-3xl mx-auto space-y-6">
            {!plan ? (
              <div className="text-center py-20 text-[var(--text-muted)]">
                기획 탭에서 먼저 AI 기획을 생성해주세요.
              </div>
            ) : (
              <>
                <SectionTitle>내보내기</SectionTitle>

                {/* Summary */}
                <div className="p-5 rounded-xl border border-[var(--border)]"
                  style={{ background: "var(--surface)" }}>
                  <h3 className="text-sm font-bold text-white mb-4">{plan.project.title}</h3>
                  <div className="grid grid-cols-4 gap-4 text-center mb-4">
                    {[
                      { label: "총 씬", value: plan.scenes.length },
                      { label: "이미지 완료", value: scenesDone },
                      { label: "영상 완료", value: videoDone },
                      { label: "캐릭터", value: plan.characters.length },
                    ].map(({ label, value }) => (
                      <div key={label} className="p-3 rounded-lg border border-[var(--border)]"
                        style={{ background: "var(--surface-2)" }}>
                        <div className="text-xl font-bold text-white">{value}</div>
                        <div className="text-xs text-[var(--text-muted)] mt-1">{label}</div>
                      </div>
                    ))}
                  </div>

                  {/* Production Notes */}
                  <div className="text-xs space-y-1">
                    <div><span className="text-[var(--text-muted)]">색상 팔레트: </span>
                      {plan.productionNotes.colorPalette.join(" · ")}
                    </div>
                    <div><span className="text-[var(--text-muted)]">조명: </span>
                      {plan.productionNotes.lightingStyle}
                    </div>
                    <div><span className="text-[var(--text-muted)]">음악: </span>
                      {plan.productionNotes.musicMood}
                    </div>
                    <div><span className="text-[var(--text-muted)]">편집: </span>
                      {plan.productionNotes.editingStyle}
                    </div>
                  </div>
                </div>

                {/* Scene asset list */}
                <div className="p-5 rounded-xl border border-[var(--border)]"
                  style={{ background: "var(--surface)" }}>
                  <h3 className="text-sm font-semibold text-white mb-4">씬별 에셋</h3>
                  <div className="space-y-3">
                    {plan.scenes.map(scene => (
                      <div key={scene.id}
                        className="flex items-center gap-3 py-2 border-b border-[var(--border)] last:border-0">
                        {scene.generatedImageUrl ? (
                          <img src={scene.generatedImageUrl} alt=""
                            className="w-12 h-8 object-cover rounded border border-[var(--border)]" />
                        ) : (
                          <div className="w-12 h-8 rounded border border-[var(--border)] flex items-center justify-center"
                            style={{ background: "var(--surface-2)" }}>
                            <span className="text-xs opacity-30">-</span>
                          </div>
                        )}
                        <div className="flex-1">
                          <p className="text-xs font-medium text-white">Scene {scene.order}: {scene.title}</p>
                          <p className="text-xs text-[var(--text-muted)]">{scene.setting}</p>
                        </div>
                        <div className="flex gap-1.5">
                          {scene.generatedImageUrl ? (
                            <a href={scene.generatedImageUrl} download={`scene_${scene.order}_image.png`}
                              target="_blank" rel="noreferrer"
                              className="text-xs px-2 py-0.5 rounded border border-[var(--success)]/40
                                         text-[var(--success)] hover:bg-[var(--success)]/10">
                              이미지
                            </a>
                          ) : <span className="text-xs text-[var(--text-muted)] px-2">이미지 없음</span>}
                          {scene.generatedVideoUrl ? (
                            <a href={scene.generatedVideoUrl} download={`scene_${scene.order}_video.mp4`}
                              target="_blank" rel="noreferrer"
                              className="text-xs px-2 py-0.5 rounded border border-[var(--accent-2)]/40
                                         text-[var(--accent-2)] hover:bg-[var(--accent-2)]/10">
                              영상
                            </a>
                          ) : <span className="text-xs text-[var(--text-muted)] px-2">영상 없음</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Export JSON */}
                <div className="p-5 rounded-xl border border-[var(--border)]"
                  style={{ background: "var(--surface)" }}>
                  <h3 className="text-sm font-semibold text-white mb-3">전체 기획 JSON 내보내기</h3>
                  <p className="text-xs text-[var(--text-muted)] mb-3">
                    생성된 전체 기획 데이터를 JSON 파일로 저장합니다. 나중에 다시 불러올 수 있습니다.
                  </p>
                  <div className="flex gap-2">
                    <button onClick={() => {
                      const blob = new Blob([JSON.stringify(plan, null, 2)], { type: "application/json" });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement("a");
                      a.href = url;
                      a.download = `${plan.project.title.replace(/\s+/g, "_")}_plan.json`;
                      a.click();
                      URL.revokeObjectURL(url);
                    }}
                      className="px-4 py-2 rounded text-sm font-medium text-white transition-colors"
                      style={{ background: "var(--accent)" }}>
                      JSON 다운로드
                    </button>
                    <button onClick={() => {
                      // Build script text
                      const lines: string[] = [
                        `# ${plan.project.title}`,
                        `## ${plan.project.logline}`,
                        "",
                        `**장르:** ${plan.project.genre} | **대상:** ${plan.project.targetAudience} | **길이:** ${plan.project.totalDuration}`,
                        "",
                        "---",
                        "",
                        "## 시나리오 개요",
                        plan.scenario.outline,
                        "",
                        "---",
                        "",
                        "## 씬 스크립트",
                        "",
                      ];
                      plan.scenes.forEach(scene => {
                        lines.push(`### Scene ${scene.order}: ${scene.title}`);
                        lines.push(`**배경:** ${scene.setting} | **분위기:** ${scene.mood} | **${scene.durationSeconds}초**`);
                        lines.push("");
                        lines.push(scene.description);
                        lines.push("");
                        if (scene.narration) {
                          lines.push(`> **나레이션:** ${scene.narration}`);
                          lines.push("");
                        }
                        scene.dialogues.forEach(d => {
                          lines.push(`**${d.characterName}** _(${d.emotion})_: "${d.line}"`);
                        });
                        lines.push("");
                      });

                      const blob = new Blob([lines.join("\n")], { type: "text/markdown" });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement("a");
                      a.href = url;
                      a.download = `${plan.project.title.replace(/\s+/g, "_")}_script.md`;
                      a.click();
                      URL.revokeObjectURL(url);
                    }}
                      className="px-4 py-2 rounded text-sm font-medium border border-[var(--border)]
                                 text-[var(--text-muted)] hover:text-white hover:border-[var(--accent-2)] transition-colors">
                      스크립트 MD 다운로드
                    </button>
                  </div>
                </div>

                {/* Global Constraints */}
                <div className="p-5 rounded-xl border border-[var(--border)]"
                  style={{ background: "var(--surface)" }}>
                  <h3 className="text-sm font-semibold text-white mb-3">전역 제약 조건</h3>
                  <ul className="space-y-1">
                    {plan.globalConstraints.map((c, i) => (
                      <li key={i} className="text-xs text-[var(--text-muted)] flex gap-2">
                        <span className="text-[var(--danger)]">✕</span>
                        {c}
                      </li>
                    ))}
                  </ul>
                </div>
              </>
            )}
          </div>
        )}

      </main>
    </div>
  );
}
