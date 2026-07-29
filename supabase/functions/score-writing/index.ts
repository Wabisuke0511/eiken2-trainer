import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

  try {
    const { imageBase64, mediaType, writingType } = await req.json();
    if (!imageBase64) {
      return new Response(JSON.stringify({ error: "imageBase64 is required" }),
        { status: 400, headers: { ...CORS, "Content-Type": "application/json" } });
    }

    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "ANTHROPIC_API_KEY not set" }),
        { status: 500, headers: { ...CORS, "Content-Type": "application/json" } });
    }

    const isSummary = writingType === "w4a";
    const taskName = isSummary ? "英文要約（Eiken Grade 2 Summary Writing）" : "意見論述（Eiken Grade 2 Opinion Essay）";

    const rubric = isSummary ? `
【英文要約 採点基準】
・内容（Content）0〜4点: 元の文章の要点を適切に捉えているか。自分の意見や元文にない内容を含んでいないか。
・構成（Organization）0〜4点: 論理的な流れで書かれているか。適切につなぎ言葉が使われているか。
・語彙（Vocabulary）0〜4点: 課題に相応しい語句を正しく使えているか。
・文法（Grammar）0〜4点: 文法・語法が正確か。スペルミスがないか。
` : `
【意見論述 採点基準】
・内容（Content）0〜4点: 自分の意見とその理由が明確か。トピックに関連した具体的なサポートがあるか。
・構成（Organization）0〜4点: 序論・本論・結論の構成が明確か。つなぎ言葉が適切に使われているか。
・語彙（Vocabulary）0〜4点: 課題に相応しい語句を正しく使えているか。
・文法（Grammar）0〜4点: 文法・語法が正確か。スペルミスがないか。
`;

    const prompt = `あなたは英検2級の採点官です。添付の画像は受験者が書いた${taskName}の答案です。
以下のルーブリックに基づいて、各観点を0〜4点で採点してください。

${rubric}

採点結果を必ず以下のJSON形式のみで返してください。前置きやMarkdownは不要です。
{
  "content": <0〜4の整数>,
  "structure": <0〜4の整数>,
  "vocab": <0〜4の整数>,
  "grammar": <0〜4の整数>,
  "feedback": "<採点の根拠を日本語で2〜3文で説明>"
}`;

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-sonnet-5-20251001",
        max_tokens: 512,
        messages: [{
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: mediaType || "image/jpeg", data: imageBase64 } },
            { type: "text", text: prompt },
          ],
        }],
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      return new Response(JSON.stringify({ error: `API error: ${response.status} ${err}` }),
        { status: 502, headers: { ...CORS, "Content-Type": "application/json" } });
    }

    const msg = await response.json();
    const raw = msg.content?.[0]?.text || "{}";
    const clean = raw.replace(/```json\s*/gi, "").replace(/```\s*/gi, "").trim();
    const start = clean.indexOf("{"), end = clean.lastIndexOf("}");
    const parsed = JSON.parse(start >= 0 ? clean.slice(start, end + 1) : "{}");

    // 値を 0〜4 にクランプ
    ["content", "structure", "vocab", "grammar"].forEach(k => {
      if (typeof parsed[k] === "number") {
        parsed[k] = Math.max(0, Math.min(4, Math.round(parsed[k])));
      }
    });

    return new Response(JSON.stringify(parsed),
      { headers: { ...CORS, "Content-Type": "application/json" } });

  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }),
      { status: 500, headers: { ...CORS, "Content-Type": "application/json" } });
  }
});
