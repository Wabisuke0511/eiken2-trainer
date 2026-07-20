import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS });
  }

  try {
    const { word } = await req.json();
    if (!word) {
      return new Response(JSON.stringify({ error: "word is required" }), {
        status: 400, headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "ANTHROPIC_API_KEY not set" }), {
        status: 500, headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    const prompt = `英検2級レベルの学習者向けに、英単語「${word}」の情報をJSON形式で返してください。
出力はJSON1行のみ。前置きやMarkdownは不要。
{"meaning":"日本語訳（簡潔に）","pos":"品詞（動詞/名詞/形容詞/副詞/前置詞/熟語/その他）","example":"短い英語例文"}`;

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 256,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      return new Response(JSON.stringify({ error: err }), {
        status: 502, headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    const msg = await response.json();
    const raw = msg.content?.[0]?.text || "{}";
    const clean = raw.replace(/```json\s*/gi, "").replace(/```\s*/gi, "").trim();
    const start = clean.indexOf("{");
    const end = clean.lastIndexOf("}");
    const parsed = JSON.parse(start >= 0 ? clean.slice(start, end + 1) : "{}");

    return new Response(JSON.stringify(parsed), {
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
});
