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

Antwoord in het Nederlands, tenzij de merchant in een andere taal schrijft.

GESPREKSSTIJL:
- Beantwoord in eerste instantie ALLEEN wat de merchant vraagt. Dump niet alle data in één keer.
- Houd antwoorden kort en natuurlijk — als een mens die meedenkt, niet als een rapport. Een paar zinnen, geen lange opsommingen tenzij de merchant daar expliciet om vraagt.
- Gebruik alleen de cijfers die relevant zijn voor de gestelde vraag.
- Sluit af met één logische vervolgvraag of een concrete suggestie voor een volgende stap, zodat het gesprek natuurlijk doorloopt. Niet meerdere tegelijk — één.
- Stel je aan het begin van een gesprek kort voor en vraag waar de merchant mee geholpen wil worden, in plaats van meteen een overzicht te geven.

BELANGRIJK — OUTPUT FORMAT:
Antwoord altijd met geldige JSON, en niets daarbuiten, in exact deze vorm:
{
  "reply": "je antwoord aan de merchant in tekst",
  "suggest_task": true of false,
  "task_reason": "korte reden waarom een account manager-taak nodig is, of leeg",
  "suggest_booking": true of false
}

Bepaal "suggest_task" (true) alleen als een van deze signalen aanwezig is:
- de merchant uit ontevredenheid of een klacht
- iets blijft onduidelijk nadat jij het hebt proberen te beantwoorden
- de merchant vraagt nadrukkelijk om verbetering van zijn Spotlight-performance
- een concrete hulpvraag die menselijke opvolging vereist
- een signaal van een nieuwe locatie of expansie

Bepaal "suggest_booking" (true) als de merchant nadrukkelijk zijn performance wil verbeteren, als er een concreet verbeterpunt is besproken, of bij een signaal van expansie.

Bij een gewone informatievraag die je volledig zelf beantwoordt, zijn beide false.`;

interface ChatResult {
  reply: string;
  suggest_task: boolean;
  task_reason: string;
  suggest_booking: boolean;
}

async function loadMerchantData(): Promise<string> {
  const filePath = path.join(process.cwd(), "merchant_data.json");
  const raw = await readFile(filePath, "utf-8");
  // Parse and re-stringify zodat we geldige, genormaliseerde JSON injecteren.
  return JSON.stringify(JSON.parse(raw), null, 2);
}

const GENERIC_FALLBACK_REPLY =
  "Sorry, ik kon mijn antwoord even niet goed verwerken. Kun je je vraag opnieuw stellen?";

// Bepaal een veilige fallback-reply: nooit ruwe JSON of een codeblok tonen.
function safeFallbackReply(rawReply: string): string {
  const trimmed = rawReply.trim();
  if (!trimmed || trimmed.startsWith("{") || trimmed.startsWith("```")) {
    return GENERIC_FALLBACK_REPLY;
  }
  return trimmed;
}

// Parse het JSON-antwoord van Claude naar gestructureerde signalen.
// Strip markdown-codeblokken en extraheer het JSON-object (eerste { t/m
// laatste }) zodat eventuele tekst vóór of na de JSON de parse niet breekt.
// Faalt het alsnog, dan een nette fallback zonder ruwe JSON in de chat.
function parseChatResult(rawReply: string): ChatResult {
  const cleaned = rawReply
    .replace(/```json/gi, "")
    .replace(/```/g, "")
    .trim();

  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  const candidate =
    start !== -1 && end !== -1 && end > start
      ? cleaned.slice(start, end + 1)
      : cleaned;

  try {
    const parsed = JSON.parse(candidate);
    return {
      reply:
        typeof parsed.reply === "string"
          ? parsed.reply
          : safeFallbackReply(rawReply),
      suggest_task: parsed.suggest_task === true,
      task_reason:
        typeof parsed.task_reason === "string" ? parsed.task_reason : "",
      suggest_booking: parsed.suggest_booking === true,
    };
  } catch {
    return {
      reply: safeFallbackReply(rawReply),
      suggest_task: false,
      task_reason: "",
      suggest_booking: false,
    };
  }
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

    const rawReply = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === "text")
      .map((block) => block.text)
      .join("");

    const result = parseChatResult(rawReply);
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Onbekende fout.";
    return NextResponse.json(
      { error: `Fout bij het aanroepen van Claude: ${message}` },
      { status: 502 }
    );
  }
}
