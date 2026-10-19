import express from 'express';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI, Type } from '@google/genai';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json({ limit: '1mb' }));

const PORT = Number(process.env.PORT) || 3000;
const isProd = process.env.NODE_ENV === 'production';

// Initialize Gemini client with server environment and User-Agent telemetry
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    },
  },
});

interface PrepareRequestBody {
  inquiry: string;
  painterName?: string;
}

interface MissingItem {
  question: string;
  requestPhrase: string;
}

function joinPhrases(phrases: string[]): string {
  if (phrases.length === 0) return '';
  if (phrases.length === 1) return phrases[0];
  if (phrases.length === 2) return `${phrases[0]} a ${phrases[1]}`;
  return `${phrases.slice(0, -1).join(', ')} a ${phrases[phrases.length - 1]}`;
}

// Logic in generateHeuristicResponse strictly implements:
// 1. Recognize information the customer has already provided.
// 2. Add to candidateQuestions ONLY questions for genuinely missing data.
// 3. Draft response to customer must specifically ask for the EXACT SAME items as in the question list.
// 4. Never use vague phrases like "doplňte zbývající podrobnosti".
// 5. Never re-ask for mentioned rooms, area, color, wall condition, or photos.
// 6. Do NOT assume ceiling height if customer did not state it.
// 7. If customer asks for a date but gave vague timeframe, ask for specific day.
// 8. If nothing important is missing, do not ask to complete anything.
export function generateHeuristicResponse(inquiry: string, painterName?: string) {
  const lower = inquiry.toLowerCase();

  const requestedPrice = /kolik|cena|cen[uoy]|st[aá]l|rozpo[cč]et|k[cč]|sazb|kalkulac/i.test(lower);
  const requestedDate = /kdy|term[ií]n|volno|p[rř][ií][sš]t|t[yý]den|sp[eě]ch[aá]|m[uů][zž]ete|za[cč][ií]t|[cč]as|šlo\s*by\s*to/i.test(lower);

  // 1. Rooms / Dispositions
  const hasRooms = /kuchy[nň]|chodb|ložnic|obývák|pokoj|koupeln|předsíň|kancelář|byt|\b\d\s*\+\s*\d|\b\d\s*kk|garsonk|místnost|jídeln|dětský/i.test(lower);
  const mentions2plus1 = /\b2\s*\+\s*1\b/i.test(lower);

  // 2. Area (m²)
  const hasArea = /\b\d+([,.]\d+)?\s*(m2|m²|metr|čtvereč)/i.test(lower);

  // 3. Ceiling height (recognize all common variants: "stropy jsou vysoké 2,6 m", "výška stropu je 2,6 metru", "stropy 2,6 m", "se stropy 2,6 m")
  const hasCeilingHeight =
    /strop[^\d]{0,35}\b\d+([,.]\d+)?\s*(m\b|metr)/i.test(lower) ||
    /výšk[^\d]{0,35}\b\d+([,.]\d+)?\s*(m\b|metr)/i.test(lower) ||
    /\b\d+([,.]\d+)?\s*(m\b|metr)[^a-záčďéěíňóřšťúůýž]{0,35}(strop|vysok)/i.test(lower) ||
    /vysok[áéýí][^\d]{0,35}\b\d+([,.]\d+)?\s*(m\b|metr)/i.test(lower);

  // 4. Color / Paint type
  const hasColor = /bíl|šed|barv|odstín|tón|omyvateln|akryl|otěruvzdorn|primalex|dulux|het/i.test(lower);

  // 5. Wall condition
  const hasConditionGood = /v\s*dobrém\s*stavu|dobrý\s*stav|novostavb|po\s*rekonstrukci|nové\s*omítky|čisté\s*stěny|bez\s*prasklin/i.test(lower);
  const hasCracks = /prasklin|trhlin/i.test(lower) && !/bez\s*prasklin/i.test(lower);
  const hasConditionBad = /plíseň|plísn|loupe|loupající|star[áé]\s*malb|škráb|tapet|flek|skvrn|vlhk/i.test(lower);
  const hasConditionKnown = hasConditionGood || hasCracks || hasConditionBad;

  // 6. Photos
  const photosOffered = /fot[ky].*(m[uů][zž]u|mohu|lze)\s*poslat|(m[uů][zž]u|mohu|lze)\s*poslat.*fot[ky]/i.test(lower);
  const photosProvided = /fot[ky]|fotografi[ie]|snímk[y]|příloh|přikládám|posílám\s*i\s*fot/i.test(lower) && !photosOffered;

  // 7. Timeframe
  const mentionsSpecificDays = /pondělí|úterý|střed[au]|čtvrtek|pátek|sobot[au]|neděl[ei]|konkrétní.*den|\b\d{1,2}\.\s*\d{1,2}\./i.test(lower);
  const mentionsNextWeek = /příští.*týden|tento.*týden/i.test(lower);
  const mentionsNextMonth = /příští.*měsíc|během.*měsíc/i.test(lower);
  const mentionsVaguePeriod = mentionsNextWeek || mentionsNextMonth || /začátkem|koncem|na\s*jaře|na\s*podzim/i.test(lower);

  // 8. Furniture / Prep
  const hasFurniturePrep = /nábytek|vykliz|vystěh|zakrý|prázdn/i.test(lower);

  const signature = painterName?.trim() || '[Vaše jméno]';

  // Build candidate items strictly for what is genuinely missing
  const candidateItems: MissingItem[] = [];

  // A) Area & Ceiling height
  if (!hasArea) {
    if (!hasRooms) {
      candidateItems.push({
        question: 'Přibližná plocha (m²) a počet místností',
        requestPhrase: 'přibližnou plochu (m²) a počet místností',
      });
    } else {
      candidateItems.push({
        question: 'Přibližná plocha (m²) a výška stropů',
        requestPhrase: 'přibližnou plochu (m²) a výšku stropů',
      });
    }
  } else if (!hasCeilingHeight) {
    // Area is given, but ceiling height was not specified - do not assume it!
    candidateItems.push({
      question: 'Výška stropů (pro přesný výpočet celkové plochy stěn)',
      requestPhrase: 'výšku stropů',
    });
  }

  // B) Wall condition
  if (hasCracks) {
    candidateItems.push({
      question: 'Rozsah a hloubka prasklin (zda postačí lokální přetmelení, nebo je nutná zpevňující bandáž)',
      requestPhrase: 'rozsah prasklin na stěnách',
    });
  } else if (!hasConditionKnown) {
    candidateItems.push({
      question: 'Současný stav stěn (zda se starý nátěr loupe, jsou praskliny, skvrny či plíseň)',
      requestPhrase: 'současný stav stěn',
    });
  }

  // C) Color & Paint type
  if (!hasColor) {
    candidateItems.push({
      question: 'Požadovaný typ malby a odstíny (klasická bílá, omyvatelná barva, nebo tónované odstíny)',
      requestPhrase: 'představu o barvách a typu malby',
    });
  }

  // D) Photos
  if (photosOffered) {
    candidateItems.push({
      question: 'Zaslání nabízených fotografií místností pro přesnější posouzení',
      requestPhrase: 'zaslání nabízených fotografií',
    });
  } else if (!photosProvided) {
    candidateItems.push({
      question: 'Případné fotografie místností pro posouzení prostoru',
      requestPhrase: 'případné fotografie místností',
    });
  }

  // E) Specific day when timeframe is needed or vague
  if ((requestedDate || mentionsVaguePeriod) && !mentionsSpecificDays) {
    if (mentionsNextWeek && candidateItems.length < 4) {
      candidateItems.push({
        question: 'Které dny v příštím týdnu by Vám pro malování vyhovovaly',
        requestPhrase: 'které dny v příštím týdnu by Vám vyhovovaly',
      });
    } else if (mentionsNextMonth && candidateItems.length < 4) {
      candidateItems.push({
        question: 'Které dny nebo termín v průběhu příštího měsíce by Vám vyhovovaly',
        requestPhrase: 'které dny v příštím měsíci by Vám vyhovovaly',
      });
    } else if (candidateItems.length < 4) {
      candidateItems.push({
        question: 'Které dny by Vám pro realizaci vyhovovaly',
        requestPhrase: 'které dny by Vám pro realizaci vyhovovaly',
      });
    }
  }

  // F) Furniture prep (if space permits in max 4 items)
  if (!hasFurniturePrep && candidateItems.length < 4) {
    candidateItems.push({
      question: 'Příprava prostor: zda budou místnosti vyklizené, nebo bude potřeba zakrývat nábytek',
      requestPhrase: 'zda bude potřeba zakrývat či stěhovat nábytek',
    });
  }

  // Strictly at most 4 questions
  const finalItems = candidateItems.slice(0, 4);
  const missingQuestions = finalItems.map((item) => item.question);

  // Formulate draftResponse:
  // If nothing important is missing:
  // "Pokud už nechybí žádný důležitý údaj, nepiš, že zákazník musí něco doplnit; poděkuj za informace a řekni, že malíř ověří cenu nebo termín."
  let draftResponse = '';

  if (finalItems.length === 0) {
    draftResponse = `Dobrý den,\n\nděkuji za Vaši poptávku a zaslané podklady k malování. Všechny informace si podrobně projdu a připravím nabídku po posouzení poptávky včetně ověření termínu v kalendáři. Brzy se Vám ozvu s podrobnostmi.\n\nS pozdravem,\n${signature}`;
  } else {
    // Specifically ask for the exact same items without any vague phrases
    const phrases = finalItems.map((item) => item.requestPhrase);
    const joinedPhrases = joinPhrases(phrases);

    let intro = 'děkuji za Vaši poptávku malování.';
    if (photosProvided) {
      intro = 'děkuji za Vaši poptávku i přiložené fotografie.';
    } else if (mentions2plus1) {
      intro = 'děkuji za Vaši poptávku malování bytu 2+1.';
    } else if (hasArea && hasCeilingHeight) {
      intro = 'děkuji za poptávku malování s podrobnými údaji.';
    }

    let purpose = 'Abych mohl připravit nabídku po posouzení poptávky a ověřit možnosti termínu';
    if (mentionsNextWeek) {
      purpose = 'Abych mohl připravit nabídku po posouzení poptávky a ověřit volný termín na příští týden';
    } else if (mentionsNextMonth) {
      purpose = 'Abych mohl připravit nabídku po posouzení poptávky a prověřit volný termín v příštím měsíci';
    } else if (!requestedDate && requestedPrice) {
      purpose = 'Abych mohl připravit nabídku po posouzení poptávky';
    }

    draftResponse = `Dobrý den,\n\n${intro} ${purpose}, potřeboval bych od Vás ještě upřesnit ${joinedPhrases}. Jakmile mi tyto informace pošlete, rád se na to podívám.\n\nS pozdravem,\n${signature}`;
  }

  return {
    draftResponse,
    missingQuestions,
    customerRequestedPrice: requestedPrice,
    customerRequestedDate: requestedDate,
  };
}

app.post('/api/prepare-response', async (req, res) => {
  try {
    const { inquiry, painterName }: PrepareRequestBody = req.body || {};

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

      // Enforce at most 4 missing questions
      if (parsedData && Array.isArray(parsedData.missingQuestions)) {
        parsedData.missingQuestions = parsedData.missingQuestions.slice(0, 4);
      }
    } catch (apiError: any) {
      console.warn('Using deterministic generator:', apiError?.message);
      parsedData = generateHeuristicResponse(trimmedInquiry, painterName);
    }

    // Safety guarantee: If ceiling height was stated, it must NEVER appear in missing questions or draft response
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
    console.error('Error in prepare-response endpoint:', error);
    return res.status(500).json({
      error: 'Při přípravě odpovědi došlo k chybě.',
      details: error?.message || 'Neznámá chyba',
    });
  }
});

// Setup Vite in Dev or static files in Production
if (!isProd) {
  const { createServer: createViteServer } = await import('vite');
  const vite = await createViteServer({
    server: {
      middlewareMode: true,
      hmr: process.env.DISABLE_HMR !== 'true',
    },
    appType: 'spa',
  });
  app.use(vite.middlewares);
} else {
  app.use(express.static(path.resolve(__dirname, 'dist')));
  app.get('*', (_req, res) => {
    res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
  });
}

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server listening on port ${PORT} (prod=${isProd})`);
});
