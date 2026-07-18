import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function repairJson(raw: string): string {
  // Remove markdown code fences
  let s = raw.replace(/```json\s*/gi, "").replace(/```\s*/gi, "").trim();
  // Find array start
  const start = s.indexOf("[");
  if (start === -1) return "[]";
  s = s.slice(start);
  // Count brackets to find or fix the end
  let depth = 0;
  let end = -1;
  for (let i = 0; i < s.length; i++) {
    if (s[i] === "[" || s[i] === "{") depth++;
    else if (s[i] === "]" || s[i] === "}") {
      depth--;
      if (depth === 0) { end = i; break; }
    }
  }
  if (end !== -1) return s.slice(0, end + 1);
  // Repair: close unclosed braces/brackets
  const opens: string[] = [];
  for (const c of s) {
    if (c === "[" || c === "{") opens.push(c);
    else if (c === "]") opens.pop();
    else if (c === "}") opens.pop();
  }
  let repaired = s;
  for (let i = opens.length - 1; i >= 0; i--) {
    repaired += opens[i] === "[" ? "]" : "}";
  }
  return repaired;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS });
  }

  try {
    const { imageBase64, mediaType } = await req.json();
    if (!imageBase64) {
      return new Response(JSON.stringify({ error: "imageBase64 is required" }), {
        status: 400, headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "ANTHROPIC_API_KEY not set" }), {
        status: 500, headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    const prompt = `この画像は英単語帳または英語教材のページです。蛍光ペン・マーカーで色が塗られている英単語または熟語だけを抽出してください。マーカーが引かれていない語は絶対に含めないこと。
各語について、英検2級レベルの学習者向けに日本語訳・品詞・短い例文（英語）を付けてください。
出力は次のJSON配列のみ。前置きやMarkdownのコードフェンスは一切書かないこと。
[{"word":"","meaning":"","pos":"","example":"","markerColor":""}]
markerColor は yellow / pink / green / blue / orange のいずれか。判別できなければ空文字。`;

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 8192,
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
      const errText = await response.text();
      return new Response(JSON.stringify({ error: `Anthropic API error: ${response.status} ${errText}` }), {
        status: 502, headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    const msg = await response.json();
    const rawText = msg.content?.[0]?.text || "[]";
    const repaired = repairJson(rawText);

    let parsed: unknown[];
    try {
      parsed = JSON.parse(repaired);
    } catch {
      return new Response(JSON.stringify({ error: "JSONの解析に失敗しました: " + rawText.slice(0, 200) }), {
        status: 200, headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify(parsed), {
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
});
