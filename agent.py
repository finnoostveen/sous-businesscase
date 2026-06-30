"""Spotlight-assistent van SOUS.

Een command-line chat-agent waarmee één horecaondernemer kan praten over de
Spotlight-performance van zijn restaurant. De merchant-data wordt uit
`merchant_data.json` ingelezen en als context in de systeemprompt geïnjecteerd.
"""

import json
import sys

from anthropic import Anthropic

MODEL = "claude-sonnet-4-6"
MAX_TOKENS = 1000
MERCHANT_DATA_FILE = "merchant_data.json"

SYSTEM_PROMPT_TEMPLATE = """Je bent de Spotlight-assistent van SOUS, een platform dat horecaondernemers helpt met hun online zichtbaarheid, reviews en directe verkoop. Je praat namens SOUS met de eigenaar van één specifiek restaurant over de Spotlight-performance van dát restaurant.

Hieronder staat alle data die je over deze merchant hebt. Dit is je ENIGE bron van waarheid:

<merchant_data>
{merchant_data_json}
</merchant_data>

REGELS:
1. Beantwoord alleen vragen over de Spotlight-performance van deze merchant: zichtbaarheid, reviews, AI-search ranking, zoektermen en de aanbevelingen.
2. Gebruik UITSLUITEND cijfers en feiten die letterlijk in de data hierboven staan. Verzin nooit getallen, trends of informatie. Staat iets niet in de data, zeg dan eerlijk dat je die informatie niet hebt.
3. Je mag de merchant zijn positie duiden tegenover de concurrentie-benchmark die in de data staat (bijvoorbeeld zijn rank en visibility versus die van de top-concurrenten). Maar speculeer NOOIT over waarom een concurrent het beter of slechter doet, en geef geen informatie over concurrenten buiten de cijfers die in de data staan.
4. Vragen die niets met Spotlight-performance te maken hebben (recepten, personeel, juridisch, financieel advies, algemene vragen) beantwoord je niet. Verwijs vriendelijk terug naar waar je wél mee helpt.
5. Klink als een behulpzame partner van SOUS: professioneel, concreet, en gericht op wat de merchant kan verbeteren. Geen generieke chatbot-praat.

Antwoord in het Nederlands, tenzij de merchant in een andere taal schrijft."""


def load_merchant_data(path):
    """Lees het merchant-databestand in en geef het terug als JSON-string."""
    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)
    return json.dumps(data, ensure_ascii=False, indent=2)


def build_system_prompt(merchant_data_json):
    return SYSTEM_PROMPT_TEMPLATE.format(merchant_data_json=merchant_data_json)


def main():
    try:
        merchant_data_json = load_merchant_data(MERCHANT_DATA_FILE)
    except FileNotFoundError:
        print(f"Fout: '{MERCHANT_DATA_FILE}' niet gevonden.", file=sys.stderr)
        sys.exit(1)

    system_prompt = build_system_prompt(merchant_data_json)
    client = Anthropic()
    messages = []

    print("SOUS Spotlight-assistent. Typ 'exit' om te stoppen.\n")

    while True:
        try:
            user_input = input("Jij: ").strip()
        except (EOFError, KeyboardInterrupt):
            print("\nTot ziens!")
            break

        if not user_input:
            continue
        if user_input.lower() == "exit":
            print("Tot ziens!")
            break

        messages.append({"role": "user", "content": user_input})

        response = client.messages.create(
            model=MODEL,
            max_tokens=MAX_TOKENS,
            system=system_prompt,
            messages=messages,
        )

        assistant_reply = "".join(
            block.text for block in response.content if block.type == "text"
        )
        print(f"\nSpotlight: {assistant_reply}\n")

        messages.append({"role": "assistant", "content": assistant_reply})


if __name__ == "__main__":
    main()
