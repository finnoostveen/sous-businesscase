import { NextResponse } from "next/server";
import { readFile } from "fs/promises";
import path from "path";
import Anthropic from "@anthropic-ai/sdk";

const MODEL = "claude-sonnet-4-6";
const MAX_TOKENS = 1000;

const SYSTEM_PROMPT_TEMPLATE = `Je bent de Spotlight-assistent van SOUS, een platform dat horecaondernemers helpt met hun online zichtbaarheid, reviews en directe verkoop. Je praat namens SOUS met de eigenaar van één specifiek restaurant over de Spotlight-performance van dát restaurant.

Hieronder staat alle data die je over deze merchant hebt. Dit is je ENIGE bron van waarheid:

<merchant_data>
{merchant_data_json}
</merchant_data>

REGELS:
1. Beantwoord alleen vragen over de Spotlight-performance van deze merchant: zichtbaarheid, reviews, AI-search ranking, zoektermen en de aanbevelingen.
2. Gebruik UITSLUITEND cijfers en feiten die letterlijk in de data hierboven staan. Verzin nooit getallen, trends of informatie. Staat iets niet in de data, zeg dan eerlijk dat je die informatie niet hebt.
3. Je mag de merchant zijn positie duiden tegenover de concurrentie-benchmark die in de data staat (bijvoorbeeld zijn rank en visibility versus die van de top-concurrenten). Maar speculeer NOOIT over waarom een concurrent het beter of slechter doet, en geef geen informatie over concurrenten buiten de cijfers die in de data staan.
4. Vragen die niets met Spotlight-performance te maken hebben (recepten, personeel, juridisch, financieel advies, algemene vragen) beantwoord je niet. Verwijs vriendelijk terug naar waar je wél mee helpt.
5. Klink als een behulpzame partner van SOUS: professioneel, concreet, gericht op wat de merchant kan verbeteren. Geen generieke chatbot-praat.

Antwoord in het Nederlands, tenzij de merchant in een andere taal schrijft.`;

async function loadMerchantData(): Promise<string> {
  const filePath = path.join(process.cwd(), "merchant_data.json");
  const raw = await readFile(filePath, "utf-8");
  // Parse and re-stringify zodat we geldige, genormaliseerde JSON injecteren.
  return JSON.stringify(JSON.parse(raw), null, 2);
}

export async function POST(request: Request) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY is niet geconfigureerd." },
      { status: 500 }
    );
  }

  let body: { messages?: Anthropic.MessageParam[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Ongeldige JSON in de request body." },
      { status: 400 }
    );
  }

  const messages = body.messages;
  if (!Array.isArray(messages) || messages.length === 0) {
    return NextResponse.json(
      { error: "Veld 'messages' ontbreekt of is leeg." },
      { status: 400 }
    );
  }

  let merchantDataJson: string;
  try {
    merchantDataJson = await loadMerchantData();
  } catch {
    return NextResponse.json(
      { error: "Kon merchant_data.json niet inlezen." },
      { status: 500 }
    );
  }

  const systemPrompt = SYSTEM_PROMPT_TEMPLATE.replace(
    "{merchant_data_json}",
    merchantDataJson
  );

  const client = new Anthropic({ apiKey });

  try {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: systemPrompt,
      messages,
    });

    const reply = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === "text")
      .map((block) => block.text)
      .join("");

    return NextResponse.json({ reply });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Onbekende fout.";
    return NextResponse.json(
      { error: `Fout bij het aanroepen van Claude: ${message}` },
      { status: 502 }
    );
  }
}
