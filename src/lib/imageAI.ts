/**
 * Image AI — 이미지 생성 (Replicate Flux / FAL AI / OpenAI)
 * 씬별 스틸컷 생성에 사용
 */

export type ImageModel =
  | "flux-kontext-pro"    // Replicate — 캐릭터 레퍼런스 지원 (추천)
  | "flux-1.1-pro"        // Replicate — 고품질
  | "flux-dev"            // Replicate — 저렴
  | "fal-flux-kontext"    // FAL AI — 레퍼런스 지원
  | "fal-flux-pro"        // FAL AI — 빠름
  | "gpt-image-1";        // OpenAI — 최고 품질, 비쌈

export interface ImageGenParams {
  provider: "replicate" | "fal" | "openai";
  model: ImageModel;
  apiKey: string;
  prompt: string;
  negativePrompt?: string;
  referenceImageUrl?: string;    // 캐릭터 레퍼런스 (data URL 또는 http URL)
  width?: number;
  height?: number;
  outputFormat?: "png" | "webp" | "jpeg";
}

const REPLICATE_MODELS: Record<string, string> = {
  "flux-kontext-pro": "black-forest-labs/flux-kontext-pro",
  "flux-1.1-pro":     "black-forest-labs/flux-1.1-pro",
  "flux-dev":         "black-forest-labs/flux-dev",
};

const FAL_ENDPOINTS: Record<string, string> = {
  "fal-flux-kontext": "fal-ai/flux-pro/kontext",
  "fal-flux-pro":     "fal-ai/flux-pro/v1.1",
};

function sleep(ms: number) { return new Promise((r) => setTimeout(r, ms)); }

/* ------------------------------------------------------------------ */
/*  통합 생성 함수                                                     */
/* ------------------------------------------------------------------ */
export async function generateSceneImage(params: ImageGenParams): Promise<string> {
  if (params.provider === "replicate") return callReplicate(params);
  if (params.provider === "fal")       return callFal(params);
  if (params.provider === "openai")    return callOpenAI(params);
  throw new Error("Unknown provider");
}

/* --- Replicate ---------------------------------------------------- */
async function callReplicate(p: ImageGenParams): Promise<string> {
  const replicateModel = REPLICATE_MODELS[p.model] || "black-forest-labs/flux-kontext-pro";
  const isKontext = p.model.includes("kontext");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const input: any = {
    prompt: p.prompt,
    output_format: p.outputFormat || "png",
    width: p.width || 1024,
    height: p.height || 1024,
  };

  if (p.referenceImageUrl) {
    input[isKontext ? "image_url" : "image_prompt"] = p.referenceImageUrl;
  }

  const res = await fetch("https://api.replicate.com/v1/predictions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${p.apiKey}`,
      "Content-Type": "application/json",
      Prefer: "wait",
    },
    body: JSON.stringify({ model: replicateModel, input }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.detail || `Replicate error ${res.status}`);
  }

  let pred = await res.json();

  // Poll if not done
  if (pred.status !== "succeeded") {
    const pollUrl = pred.urls?.get;
    for (let i = 0; i < 60; i++) {
      await sleep(2000);
      const pr = await fetch(pollUrl!, { headers: { Authorization: `Bearer ${p.apiKey}` } });
      pred = await pr.json();
      if (pred.status === "succeeded") break;
      if (pred.status === "failed") throw new Error(pred.error || "Replicate failed");
    }
  }

  const outputUrl = Array.isArray(pred.output) ? pred.output[0] : pred.output;
  if (!outputUrl) throw new Error("No output URL from Replicate");
  return outputUrl;
}

/* --- FAL AI ------------------------------------------------------- */
async function callFal(p: ImageGenParams): Promise<string> {
  const endpoint = FAL_ENDPOINTS[p.model] || "fal-ai/flux-pro/kontext";
  const isKontext = endpoint.includes("kontext");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const body: any = {
    prompt: p.prompt,
    num_images: 1,
    image_size: "square_hd",
    output_format: p.outputFormat || "png",
  };
  if (p.referenceImageUrl && isKontext) body.image_url = p.referenceImageUrl;

  const submitRes = await fetch(`https://queue.fal.run/${endpoint}`, {
    method: "POST",
    headers: { Authorization: `Key ${p.apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!submitRes.ok) {
    const err = await submitRes.json().catch(() => ({}));
    throw new Error(err?.detail || `FAL error ${submitRes.status}`);
  }

  const submission = await submitRes.json();
  if (!submission.request_id) return extractFalUrl(submission);

  for (let i = 0; i < 60; i++) {
    await sleep(2000);
    const sr = await fetch(`https://queue.fal.run/${endpoint}/requests/${submission.request_id}/status`,
      { headers: { Authorization: `Key ${p.apiKey}` } });
    const sd = await sr.json();
    if (sd.status === "COMPLETED") {
      const rr = await fetch(`https://queue.fal.run/${endpoint}/requests/${submission.request_id}`,
        { headers: { Authorization: `Key ${p.apiKey}` } });
      return extractFalUrl(await rr.json());
    }
    if (sd.status === "FAILED") throw new Error(sd.error || "FAL failed");
  }
  throw new Error("FAL timeout");
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractFalUrl(result: any): string {
  const url = result?.images?.[0]?.url || result?.image?.url;
  if (!url) throw new Error("No image URL in FAL response");
  return url;
}

/* --- OpenAI ------------------------------------------------------- */
async function callOpenAI(p: ImageGenParams): Promise<string> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const body: any = {
    model: "gpt-image-1",
    prompt: p.prompt,
    n: 1,
    size: "1024x1024",
    quality: "high",
  };

  const res = await fetch("https://api.openai.com/v1/images/generate", {
    method: "POST",
    headers: { Authorization: `Bearer ${p.apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || `OpenAI error ${res.status}`);
  }

  const data = await res.json();
  const img = data?.data?.[0];
  if (img?.url) return img.url;
  if (img?.b64_json) return `data:image/png;base64,${img.b64_json}`;
  throw new Error("No image in OpenAI response");
}
