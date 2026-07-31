import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

  try {
    const { answerBase64, answerMediaType, questionBase64, questionMediaType, writingType } = await req.json();
    if (!answerBase64) {
      return new Response(JSON.stringify({ error: "answerBase64 is required" }),
        { status: 400, headers: { ...CORS, "Content-Type": "application/json" } });
    }

    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "ANTHROPIC_API_KEY not set" }),
        { status: 500, headers: { ...CORS, "Content-Type": "application/json" } });
    }

    const isSummary = writingType === "w4a";
    const taskName = isSummary ? "英文要約（Eiken Grade 2 Summary Writing）" : "意見論述（Eiken Grade 2 Opinion Essay）";

    const wordLimit = isSummary ? "45〜55語" : "80〜100語";

    const rubric = isSummary ? `
【英文要約 採点基準（各観点0〜4点）】
■内容（Content）: 元の文章の要点を漏れなく捉え、自分の意見や元文にない内容を加えていないか。
  4点=要点をすべて押さえ、余計な情報・自分の意見が一切ない。
  3点=要点をほぼ押さえているが1点欠落、または不要な細部が混じる。
  2点=要点の欠落が複数ある、または元文の表現をほぼ写しており言い換えができていない。
  1点=要点を捉えられていない、または自分の意見が混入している。
  0点=無解答、または元文と無関係。
■構成（Organization）: 論理的な流れとつなぎ言葉。
  4点=元文の論理構造を保ち、つなぎ言葉が適切かつ多様。
  3点=流れは追えるが、つなぎ言葉が単調または1箇所不自然。
  2点=文が並列されているだけで論理関係が示されていない。
  1点=流れが破綻し読み取りにくい。
  0点=判断不能。
■語彙（Vocabulary）: 課題に相応しい語句を正しく使えているか。
  4点=適切な言い換え表現を正確かつ多様に使えている。
  3点=概ね適切だが平易・反復が目立つ。
  2点=基本語彙のみ、または語法の誤りが複数ある。
  1点=語彙が不足し意味が伝わりにくい。
  0点=判断不能。
■文法（Grammar）: 文法・語法・スペルの正確さ。
  4点=誤りがほぼなく、複文など多様な構文を使えている。
  3点=軽微な誤りが1〜2箇所、単文中心。
  2点=誤りが3箇所以上、または同じ誤りの繰り返し。
  1点=誤りが多く読解に支障がある。
  0点=判断不能。` : `
【意見論述 採点基準（各観点0〜4点）】
■内容（Content）: 自分の意見と理由の明確さ、具体的なサポート。
  4点=意見が明確で、2つの理由がそれぞれ具体例や詳細で十分に展開されている。
  3点=意見と2つの理由はあるが、一方の展開が浅い、または一般的な記述に留まる。
  2点=理由を挙げただけで具体的な展開がない、または理由が1つしかない。
  1点=意見が不明確、または理由がトピックと噛み合っていない。
  0点=無解答、またはトピックと無関係。
■構成（Organization）: 序論・本論・結論の明確さとつなぎ言葉。
  4点=意見の提示→理由2つ→結論の再述が揃い、つなぎ言葉が適切かつ多様。
  3点=構成は追えるが結論が弱い、またはつなぎ言葉が単調。
  2点=結論がない、または論理の流れが不明瞭。
  1点=文が羅列されているだけ。
  0点=判断不能。
■語彙（Vocabulary）: 課題に相応しい語句を正しく使えているか。
  4点=課題に適した語彙を正確かつ多様に使えている。
  3点=概ね適切だが平易・反復が目立つ。
  2点=基本語彙のみ、または語法の誤りが複数ある。
  1点=語彙が不足し意味が伝わりにくい。
  0点=判断不能。
■文法（Grammar）: 文法・語法・スペルの正確さ。
  4点=誤りがほぼなく、複文など多様な構文を使えている。
  3点=軽微な誤りが1〜2箇所、単文中心。
  2点=誤りが3箇所以上、または同じ誤りの繰り返し。
  1点=誤りが多く読解に支障がある。
  0点=判断不能。`;

    const questionNote = questionBase64
      ? "1枚目の画像が問題文、2枚目の画像が受験者の解答です。"
      : "画像は受験者の解答です。問題文の画像はありません。";

    const prompt = `あなたは英検2級の採点官です。${questionNote}
これは${taskName}の採点です。以下のルーブリックに基づいて各観点を0〜4点で採点してください。

${rubric}

【採点の方針】実際の英検2級の採点は厳格です。以下を必ず守ってください。
・4点は明確な弱点が一つもない優秀な解答にのみ与える。3点も安易に付けない。
・どの点数帯か迷った場合は必ず低い方を選ぶ。
・スペルミス・冠詞の欠落・三単現・時制・単複の誤りを一つずつ数え上げ、その件数を文法の判定に反映させる。
・語数の目安は${wordLimit}。大きく下回る場合は内容と構成を減点する。
・「概ね書けている」ことを理由に加点してはならない。減点要素を具体的に特定できるかどうかで判断する。

採点結果を必ず以下のJSON形式のみで返してください。前置きやMarkdownは不要です。
{"content":<0〜4の整数>,"structure":<0〜4の整数>,"vocab":<0〜4の整数>,"grammar":<0〜4の整数>,"feedback":"減点の根拠を具体的に（誤っている箇所や不足している要素を引用して）日本語で3〜4文"}`;

    // 画像コンテンツを組み立て（問題文があれば先に）
    const imageContent: unknown[] = [];
    if (questionBase64) {
      imageContent.push({ type: "image", source: { type: "base64", media_type: questionMediaType || "image/jpeg", data: questionBase64 } });
    }
    imageContent.push({ type: "image", source: { type: "base64", media_type: answerMediaType || "image/jpeg", data: answerBase64 } });
    imageContent.push({ type: "text", text: prompt });

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-sonnet-5",
        // thinkingブロックも出力トークンを消費するので余裕を持たせる
        max_tokens: 4096,
        thinking: { type: "adaptive" },
        messages: [{ role: "user", content: imageContent }],
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      return new Response(JSON.stringify({ error: `API error: ${response.status} ${err}` }),
        { status: 502, headers: { ...CORS, "Content-Type": "application/json" } });
    }

    const msg = await response.json();
    // thinkingブロック等が先頭に来る場合があるので type=text のブロックを探す
    const textBlock = (msg.content || []).find((c: { type?: string }) => c?.type === "text");
    const raw = textBlock?.text ?? "";
    const clean = raw.replace(/```json\s*/gi, "").replace(/```\s*/gi, "").trim();
    const start = clean.indexOf("{"), end = clean.lastIndexOf("}");
    if (start < 0 || end <= start) {
      // 静かに {} を返すと採点0点と区別できないので失敗として扱う
      return new Response(JSON.stringify({
        error: "採点結果の解析に失敗しました",
        stop_reason: msg.stop_reason,
        raw: raw.slice(0, 500),
      }), { status: 502, headers: { ...CORS, "Content-Type": "application/json" } });
    }
    const parsed = JSON.parse(clean.slice(start, end + 1));

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
