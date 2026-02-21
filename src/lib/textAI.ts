/**
 * Text AI — GPT-4o 스트리밍 호출
 * 기획 생성, 프롬프트 최적화, 대사 생성 등에 사용
 */

import type { TextModel, ContentPlan } from "./types";

/* ------------------------------------------------------------------ */
/*  핵심: GPT-4o 스트리밍 호출 (onChunk 콜백으로 실시간 스트리밍)      */
/* ------------------------------------------------------------------ */
export async function callGPTStream(
  apiKey: string,
  model: TextModel,
  systemPrompt: string,
  userPrompt: string,
  onChunk: (text: string) => void,
  onDone: (fullText: string) => void,
  onError: (err: string) => void,
): Promise<void> {
  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        stream: true,
        temperature: 0.7,
        max_tokens: 8000,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: { message: res.statusText } }));
      onError(err?.error?.message || `GPT API error ${res.status}`);
      return;
    }

    const reader = res.body?.getReader();
    if (!reader) { onError("No response body"); return; }

    const decoder = new TextDecoder();
    let fullText = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split("\n").filter((l) => l.startsWith("data: "));

      for (const line of lines) {
        const data = line.slice(6).trim();
        if (data === "[DONE]") continue;
        try {
          const parsed = JSON.parse(data);
          const content = parsed.choices?.[0]?.delta?.content || "";
          if (content) {
            fullText += content;
            onChunk(content);
          }
        } catch { /* ignore parse errors on stream chunks */ }
      }
    }

    onDone(fullText);
  } catch (err) {
    onError(err instanceof Error ? err.message : "Network error");
  }
}

/* ------------------------------------------------------------------ */
/*  비스트리밍 단순 호출 (프롬프트 최적화, 대사 수정 등 짧은 텍스트)  */
/* ------------------------------------------------------------------ */
export async function callGPT(
  apiKey: string,
  model: TextModel,
  systemPrompt: string,
  userPrompt: string,
): Promise<string> {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: 0.6,
      max_tokens: 2000,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: { message: res.statusText } }));
    throw new Error(err?.error?.message || `GPT API error ${res.status}`);
  }

  const data = await res.json();
  return data.choices?.[0]?.message?.content?.trim() || "";
}

/* ------------------------------------------------------------------ */
/*  JSON 파싱 — GPT 출력에서 ContentPlan 추출                         */
/* ------------------------------------------------------------------ */
export function parseContentPlan(rawText: string): ContentPlan {
  // GPT가 가끔 ```json ... ``` 코드 블록으로 감쌀 수 있음
  const cleaned = rawText
    .replace(/^```json\s*/im, "")
    .replace(/^```\s*/im, "")
    .replace(/```\s*$/im, "")
    .trim();

  try {
    const parsed = JSON.parse(cleaned);

    // scenes 배열에 order 필드 자동 추가 (없으면)
    if (Array.isArray(parsed.scenes)) {
      parsed.scenes = parsed.scenes.map((s: Record<string, unknown>, i: number) => ({
        ...s,
        order: typeof s.order === "number" ? s.order : i + 1,
        generatedImageUrl: undefined,
        generatedVideoUrl: undefined,
        generatedNarrationUrl: undefined,
      }));
    }

    return parsed as ContentPlan;
  } catch {
    throw new Error("AI 응답을 JSON으로 파싱할 수 없습니다. 다시 시도해주세요.");
  }
}
