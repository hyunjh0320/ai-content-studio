/**
 * Video AI — 영상 생성 (FAL AI: Kling / Luma / WAN)
 * 씬별 영상 클립 생성에 사용
 */

export type VideoModel =
  | "kling-1.6"          // FAL — Kling AI 1.6 (품질 최상)
  | "kling-1.6-pro"      // FAL — Kling AI 1.6 Pro
  | "luma"               // FAL — Luma Dream Machine
  | "wan-480p"           // FAL — WAN 2.1 (가장 저렴)
  | "minimax";           // FAL — Minimax Hailuo

export const VIDEO_MODEL_INFO: Record<VideoModel, {
  label: string;
  price: string;
  endpoint: string;
  maxDuration: number;
  note?: string;
}> = {
  "kling-1.6":      { label: "Kling AI 1.6",       price: "~$0.18/5s",  endpoint: "fal-ai/kling-video/v1.6/standard/image-to-video",    maxDuration: 10 },
  "kling-1.6-pro":  { label: "Kling AI 1.6 Pro",    price: "~$0.36/5s",  endpoint: "fal-ai/kling-video/v1.6/pro/image-to-video",         maxDuration: 10, note: "최고 품질" },
  "luma":           { label: "Luma Dream Machine",  price: "~$0.30/5s",  endpoint: "fal-ai/luma-dream-machine/image-to-video",           maxDuration: 5, note: "빠름" },
  "wan-480p":       { label: "WAN 2.1 (480p)",      price: "~$0.05/5s",  endpoint: "fal-ai/wan/i2v/480p",                               maxDuration: 5, note: "가장 저렴" },
  "minimax":        { label: "Minimax Hailuo",      price: "~$0.10/5s",  endpoint: "fal-ai/minimax/video-01",                           maxDuration: 6 },
};

export interface VideoGenParams {
  falApiKey: string;
  model: VideoModel;
  prompt: string;
  imageUrl: string;          // 시작 프레임 (스틸컷 URL)
  durationSeconds?: number;  // 5~10
  aspectRatio?: "16:9" | "9:16" | "1:1";
}

function sleep(ms: number) { return new Promise((r) => setTimeout(r, ms)); }

/* ------------------------------------------------------------------ */
/*  통합 영상 생성 함수 — FAL AI Queue 방식                            */
/* ------------------------------------------------------------------ */
export async function generateSceneVideo(params: VideoGenParams): Promise<string> {
  const info = VIDEO_MODEL_INFO[params.model];
  const endpoint = info.endpoint;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const body: any = {
    prompt: params.prompt,
    image_url: params.imageUrl,
    duration: String(Math.min(params.durationSeconds || 5, info.maxDuration)),
  };

  if (params.aspectRatio) {
    body.aspect_ratio = params.aspectRatio;
  }

  // Step 1: Submit to FAL queue
  const submitRes = await fetch(`https://queue.fal.run/${endpoint}`, {
    method: "POST",
    headers: {
      Authorization: `Key ${params.falApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!submitRes.ok) {
    const err = await submitRes.json().catch(() => ({}));
    throw new Error(err?.detail || err?.message || `FAL Video error ${submitRes.status}`);
  }

  const submission = await submitRes.json();
  const requestId = submission.request_id;

  if (!requestId) {
    return extractVideoUrl(submission);
  }

  // Step 2: Poll for result (video gen takes longer — up to 5 min)
  for (let i = 0; i < 150; i++) {
    await sleep(3000);

    const statusRes = await fetch(
      `https://queue.fal.run/${endpoint}/requests/${requestId}/status`,
      { headers: { Authorization: `Key ${params.falApiKey}` } }
    );
    const status = await statusRes.json();

    if (status.status === "COMPLETED") {
      const resultRes = await fetch(
        `https://queue.fal.run/${endpoint}/requests/${requestId}`,
        { headers: { Authorization: `Key ${params.falApiKey}` } }
      );
      return extractVideoUrl(await resultRes.json());
    }

    if (status.status === "FAILED") {
      throw new Error(status.error || "FAL Video generation failed");
    }
  }

  throw new Error("FAL Video timeout (7.5 minutes)");
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractVideoUrl(result: any): string {
  const url =
    result?.video?.url ||
    result?.videos?.[0]?.url ||
    result?.output?.video?.url ||
    result?.url;
  if (!url) throw new Error("No video URL in FAL response");
  return url;
}
