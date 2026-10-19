import { GoogleGenAI, Type } from '@google/genai';
import { generateHeuristicResponse } from '../server.ts';

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    },
  },
});

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { inquiry, painterName } = req.body || {};
    const trimmedInquiry = (inquiry || '').trim();

    if (!trimmedInquiry) {
      return res.status(400).json({
        error: 'Vložte prosím text zprávy od zákazníka.',
      });
    }

    if (trimmedInquiry.length < 5) {
      return res.status(400).json({
        error: 'Zpráva zákazníka je příliš krátká. Vložte prosím celou poptávku.',
      });
    }

    const signatureName = painterName?.trim() || '[Vaše jméno]';

    const systemInstruction = `Jsi asistent pro českého malíře pokojů.

POSTUP ZPRACOVÁNÍ POPTÁVKY:
1. Nejprve z textu poptávky rozpoznej informace, které zákazník už uvedl:
   - místnosti, plocha m², výška stropů, barva/typ malby, stav stěn (např. praskliny či dobrý stav), fotografie (zda jsou přiloženy nebo nabízeny), termínové preference.
   - KRITICKY DŮLEŽITÉ: Pokud zákazník uvedl výšku stropů v jakékoli běžné formulaci (např. „stropy jsou vysoké 2,6 m“, „výška stropu je 2,6 metru“, „stropy 2,6 m“, „se stropy 2,6 m“), považuj ji za ZNÁMÝ údaj a NIKDY se na ni znovu neptej v návrhu odpovědi ani v seznamu otázek.
2. Do seznamu chybějících údajů (missingQuestions) přidej POUZE otázky na skutečně chybějící údaje (nejvýše 4 otázky).
   - NIKDY se neptej znovu na uvedené místnosti, plochu, výšku stropů, barvu, stav stěn ani fotografie.
   - Nepředpokládej výšku stropů, pouze pokud ji zákazník vůbec neuvedl.
   - U dotazu na termín se případně zeptej, které dny zákazníkovi vyhovují.
3. Návrh zákazníkovi (draftResponse) musí KONKRÉTNĚ požádat o STEJNÉ údaje, které jsou v seznamu otázek.
   - PŘÍSNÝ ZÁKAZ: Nesmí používat neurčité fráze jako „doplňte zbývající podrobnosti“.
   - Místo „přesná nabídka“ nebo „přesná kalkulace“ vždy používej opatrnější formulaci „nabídka po posouzení poptávky“.
   - Pokud už nechybí žádný důležitý údaj, nepiš, že zákazník musí něco doplnit; poděkuj za informace a řekni, že malíř připraví nabídku po posouzení poptávky a ověří termín.
   - Nikdy nevymýšlej cenu ani dostupný termín.
   - Max. 2-3 krátké věty.`;

    const promptText = `Poptávka od zákazníka:

"""
${trimmedInquiry}
"""

Podpis malíře: ${signatureName}

Proveď analýzu a vygeneruj JSON.`;

    let parsedData = null;

    try {
      const generatePromise = ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: promptText,
        config: {
          systemInstruction,
          temperature: 0.1,
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              alreadyProvidedSummary: {
                type: Type.ARRAY,
                description: 'Informace, které zákazník v poptávce už výslovně uvedl.',
                items: { type: Type.STRING },
              },
              missingQuestions: {
                type: Type.ARRAY,
                description: 'Nejvýše 4 konkrétní chybějící informace v odrážkách. Prázdné, pokud nic podstatného nechybí.',
                items: { type: Type.STRING },
              },
              draftResponse: {
                type: Type.STRING,
                description: 'Krátká odpověď zákazníkovi o max. 2-3 větách. Konkrétně žádá o stejné údaje jako v seznamu. Pokud nic nechybí, poděkuje a uvede, že malíř ověří cenu/termín bez vymyšlených čísel.',
              },
              customerRequestedPrice: {
                type: Type.BOOLEAN,
                description: 'Zda zákazník požadoval cenu.',
              },
              customerRequestedDate: {
                type: Type.BOOLEAN,
                description: 'Zda zákazník požadoval termín.',
              },
            },
            required: ['draftResponse', 'missingQuestions'],
          },
        },
      });

      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('AI generation timed out after 8s')), 8000);
      });

      const response: any = await Promise.race([generatePromise, timeoutPromise]);
      const outputText = response.text || '';
      try {
        parsedData = JSON.parse(outputText);
      } catch {
        const cleaned = outputText.replace(/```json/gi, '').replace(/```/g, '').trim();
        parsedData = JSON.parse(cleaned);
      }

      if (parsedData && Array.isArray(parsedData.missingQuestions)) {
        parsedData.missingQuestions = parsedData.missingQuestions.slice(0, 4);
      }
    } catch {
      parsedData = generateHeuristicResponse(trimmedInquiry, painterName);
    }

    const lowerInquiry = trimmedInquiry.toLowerCase();
    const ceilingStated =
      /strop[^\d]{0,35}\b\d+([,.]\d+)?\s*(m\b|metr)/i.test(lowerInquiry) ||
      /výšk[^\d]{0,35}\b\d+([,.]\d+)?\s*(m\b|metr)/i.test(lowerInquiry) ||
      /\b\d+([,.]\d+)?\s*(m\b|metr)[^a-záčďéěíňóřšťúůýž]{0,35}(strop|vysok)/i.test(lowerInquiry) ||
      /vysok[áéýí][^\d]{0,35}\b\d+([,.]\d+)?\s*(m\b|metr)/i.test(lowerInquiry);

    if (ceilingStated && parsedData) {
      if (Array.isArray(parsedData.missingQuestions)) {
        parsedData.missingQuestions = parsedData.missingQuestions.filter(
          (q: string) => !/výšk[au]\s*strop|strop[yů]?\s*(jsou\s*)?vysok|výšk[au]\s*stěn/i.test(q)
        );
      }
      if (typeof parsedData.draftResponse === 'string' && /výšk[au]\s*strop|strop/i.test(parsedData.draftResponse)) {
        parsedData = generateHeuristicResponse(trimmedInquiry, painterName);
      }
    }

    if (!parsedData) {
      parsedData = generateHeuristicResponse(trimmedInquiry, painterName);
    }

    if (parsedData && typeof parsedData.draftResponse === 'string') {
      parsedData.draftResponse = parsedData.draftResponse
        .replace(/přesnou nabídku/gi, 'nabídku po posouzení poptávky')
        .replace(/přesný rozpočet/gi, 'nabídku po posouzení poptávky')
        .replace(/přesnou cenovou nabídku/gi, 'nabídku po posouzení poptávky');
    }

    return res.json({
      success: true,
      data: parsedData,
    });
  } catch (error: any) {
    console.error('Error in Vercel function:', error);
    return res.status(500).json({
      error: 'Při přípravě odpovědi došlo k chybě.',
      details: error?.message || 'Neznámá chyba',
    });
  }
}
