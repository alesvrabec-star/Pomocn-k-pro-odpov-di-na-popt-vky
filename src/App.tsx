import React, { useState, useEffect } from 'react';
import {
  Paintbrush,
  Copy,
  Check,
  RotateCcw,
  Sparkles,
  AlertTriangle,
  HelpCircle,
  FileText,
  User,
  ArrowRight,
  ShieldCheck,
  Camera,
  Layers,
  Home,
  Palette,
} from 'lucide-react';

interface ApiResponseData {
  draftResponse: string;
  missingQuestions: string[];
  customerRequestedPrice?: boolean;
  customerRequestedDate?: boolean;
}

const SAMPLE_INQUIRIES = [
  {
    title: 'Byt 2+1 (cena a termín)',
    desc: 'Uvedena dispozice – chybí plocha, výška stropů, stav stěn, barva a fotky',
    text: 'Dobrý den, potřeboval bych vymalovat byt 2+1. Kolik by to stálo a kdy byste mohl přijít?',
  },
  {
    title: 'Obývák a ložnice 38 m², stropy jsou vysoké 2,6 m',
    desc: 'Uvedeny místnosti, plocha, výška stropů, dobrý stav bez prasklin i bílá barva',
    text: 'Prosím o vymalování obýváku a ložnice, dohromady asi 38 m², stropy jsou vysoké 2,6 m. Stěny jsou v dobrém stavu, bez prasklin. Chtěli bychom bílou barvu. Ideálně během příštího měsíce. Fotky můžu poslat.',
  },
  {
    title: 'Kuchyň a chodba 22 m², omyvatelná šedá',
    desc: 'Uvedena plocha, barva, praskliny i fotky – chybí výška a dny',
    text: 'Potřeboval bych vymalovat kuchyň a chodbu. Plocha je asi 22 m², chci omyvatelnou světle šedou barvu. Stěny mají pár prasklin. Fotografie přikládám. Šlo by to příští týden?',
  },
];

export default function App() {
  const [inquiryText, setInquiryText] = useState('');
  const [painterName, setPainterName] = useState(() => {
    return localStorage.getItem('painter_name_pref') || '';
  });
  const [showNameInput, setShowNameInput] = useState(false);

  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [emptyWarning, setEmptyWarning] = useState(false);

  const [result, setResult] = useState<ApiResponseData | null>(null);
  const [editableDraft, setEditableDraft] = useState('');
  const [initialDraft, setInitialDraft] = useState('');

  const [draftCopied, setDraftCopied] = useState(false);
  const [questionsCopied, setQuestionsCopied] = useState(false);

  useEffect(() => {
    localStorage.setItem('painter_name_pref', painterName);
  }, [painterName]);

  const handleClear = () => {
    setInquiryText('');
    setEmptyWarning(false);
    setErrorMessage(null);
  };

  const handleSelectSample = (sampleText: string) => {
    setInquiryText(sampleText);
    setEmptyWarning(false);
    setErrorMessage(null);
  };

  const handlePrepareResponse = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();

    const trimmed = inquiryText.trim();
    if (!trimmed) {
      setEmptyWarning(true);
      setErrorMessage(null);
      const el = document.getElementById('inquiry-input');
      if (el) el.focus();
      return;
    }

    setEmptyWarning(false);
    setErrorMessage(null);
    setLoading(true);

    try {
      const response = await fetch('/api/prepare-response', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          inquiry: trimmed,
          painterName: painterName.trim() || undefined,
        }),
      });

      const resJson = await response.json();

      if (!response.ok || !resJson.success) {
        throw new Error(resJson.error || 'Nepodařilo se připravit odpověď.');
      }

      const data: ApiResponseData = resJson.data;
      setResult(data);
      setEditableDraft(data.draftResponse);
      setInitialDraft(data.draftResponse);

      setTimeout(() => {
        const resultsEl = document.getElementById('output-section');
        if (resultsEl) {
          resultsEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }, 100);
    } catch (err: any) {
      console.error('Error:', err);
      setErrorMessage(
        err.message || 'Nastala chyba při zpracování poptávky. Zkuste to prosím znovu.'
      );
    } finally {
      setLoading(false);
    }
  };

  const handleCopyDraft = async () => {
    if (!editableDraft) return;
    try {
      await navigator.clipboard.writeText(editableDraft);
    } catch {
      const el = document.createElement('textarea');
      el.value = editableDraft;
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
    }
    setDraftCopied(true);
    setTimeout(() => setDraftCopied(false), 2200);
  };

  const handleCopyQuestions = async () => {
    if (!result || !result.missingQuestions || result.missingQuestions.length === 0) return;

    const formatted = result.missingQuestions.map((q) => `• ${q}`).join('\n');
    try {
      await navigator.clipboard.writeText(formatted);
    } catch {
      const el = document.createElement('textarea');
      el.value = formatted;
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
    }
    setQuestionsCopied(true);
    setTimeout(() => setQuestionsCopied(false), 2200);
  };

  const getQuestionIcon = (text: string) => {
    const lower = text.toLowerCase();
    if (lower.includes('foto') || lower.includes('fotk')) {
      return <Camera className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />;
    }
    if (lower.includes('stav') || lower.includes('loupe') || lower.includes('prasklin')) {
      return <Layers className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />;
    }
    if (lower.includes('barv') || lower.includes('odstín') || lower.includes('malb')) {
      return <Palette className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />;
    }
    return <Home className="w-4 h-4 text-sky-600 shrink-0 mt-0.5" />;
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-800">
      {/* Top Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-20 shadow-xs">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-3.5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500 text-white flex items-center justify-center shadow-xs">
              <Paintbrush className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-base sm:text-lg font-bold text-slate-900 tracking-tight font-heading">
                Pomocník pro odpovědi na poptávky
              </h1>
              <p className="text-xs text-slate-500 hidden sm:block">
                Připraví návrh odpovědi zákazníkovi a doporučí, na co se ještě doptat
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowNameInput(!showNameInput)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 transition-colors"
            >
              <User className="w-3.5 h-3.5 text-slate-500" />
              <span>{painterName ? painterName : 'Podpis malíře'}</span>
            </button>
          </div>
        </div>

        {/* Optional painter name editor */}
        {showNameInput && (
          <div className="border-t border-slate-100 bg-slate-50/90 px-4 sm:px-6 py-2.5">
            <div className="max-w-5xl mx-auto flex flex-col sm:flex-row sm:items-center gap-2 text-xs">
              <label htmlFor="painter-name" className="text-slate-600 font-medium whitespace-nowrap">
                Vaše jméno pro podpis odpovědi:
              </label>
              <input
                id="painter-name"
                type="text"
                value={painterName}
                onChange={(e) => setPainterName(e.target.value)}
                placeholder="např. Tomáš Novák"
                className="px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-slate-800 max-w-xs focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
              <span className="text-slate-400 text-[11px]">
                (Ukládá se v prohlížeči, nemusíte zadávat pokaždé)
              </span>
            </div>
          </div>
        )}
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-5xl w-full mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6">
        {/* Intro description */}
        <section className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 shadow-xs">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-sm sm:text-base font-bold text-slate-900 font-heading">
                Příprava odpovědi na poptávku malování
              </h2>
              <p className="text-xs sm:text-sm text-slate-600 mt-1 leading-relaxed">
                Aplikace připraví <strong>návrh odpovědi zákazníkovi</strong> a doporučí,{' '}
                <strong>na co se ještě doptat</strong> pro přesný odhad a termín. Nikdy nevymýšlí cenu ani dostupnost.
              </p>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-slate-500 bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-200 shrink-0">
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
              <span>Bez vymyšlených cen</span>
            </div>
          </div>
        </section>

        {/* Input Form Section */}
        <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 sm:p-6 space-y-4">
          <div className="flex items-center justify-between">
            <label htmlFor="inquiry-input" className="block text-sm sm:text-base font-bold text-slate-900">
              Zpráva zákazníka
            </label>
            {inquiryText && (
              <button
                type="button"
                onClick={handleClear}
                className="text-xs text-slate-400 hover:text-rose-600 transition-colors flex items-center gap-1"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Vymazat
              </button>
            )}
          </div>

          <div className="relative">
            <textarea
              id="inquiry-input"
              rows={5}
              value={inquiryText}
              onChange={(e) => {
                setInquiryText(e.target.value);
                if (e.target.value.trim()) setEmptyWarning(false);
              }}
              placeholder="Sem vložte zprávu od zákazníka (např. e-mail, SMS nebo poptávku z formuláře)..."
              className={`w-full p-3.5 sm:p-4 rounded-xl border text-sm sm:text-base leading-relaxed focus:outline-none focus:ring-2 transition-all resize-y min-h-[130px] ${
                emptyWarning
                  ? 'border-rose-400 focus:border-rose-500 focus:ring-rose-200 bg-rose-50/20'
                  : 'border-slate-300 focus:border-amber-500 focus:ring-amber-200 bg-slate-50/40 hover:bg-white'
              }`}
            />
          </div>

          {/* Validation Notice when input is empty */}
          {emptyWarning && (
            <div className="flex items-start gap-3 p-3.5 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-xs sm:text-sm animate-in fade-in duration-200">
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <div>
                <span className="font-semibold">Vložte prosím text poptávky</span>
                <p className="text-rose-700 mt-0.5">
                  Pro přípravu návrhu odpovědi zkopírujte a vložte zprávu od zákazníka do textového pole výše, nebo
                  klikněte na jednu z ukázek níže.
                </p>
              </div>
            </div>
          )}

          {/* Error Message */}
          {errorMessage && (
            <div className="flex items-start gap-3 p-3.5 bg-amber-50 border border-amber-200 rounded-xl text-amber-900 text-xs sm:text-sm">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <span className="font-semibold">Upozornění</span>
                <p className="text-amber-800 mt-0.5">{errorMessage}</p>
              </div>
            </div>
          )}

          {/* Fast Sample Inquiries */}
          <div className="pt-1">
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block mb-2">
              Ukázkové poptávky k vyzkoušení:
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {SAMPLE_INQUIRIES.map((sample, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => handleSelectSample(sample.text)}
                  className="text-left p-2.5 rounded-xl border border-slate-200 hover:border-amber-300 bg-slate-50 hover:bg-amber-50/50 transition-all text-xs group cursor-pointer"
                >
                  <div className="font-semibold text-slate-800 group-hover:text-amber-800 flex items-center justify-between">
                    <span>{sample.title}</span>
                    <ArrowRight className="w-3.5 h-3.5 text-slate-400 group-hover:text-amber-600 group-hover:translate-x-0.5 transition-transform" />
                  </div>
                  <p className="text-slate-500 mt-0.5 text-[11px] line-clamp-1">{sample.desc}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Primary Action Button */}
          <div className="pt-2 flex justify-end border-t border-slate-100">
            <button
              type="button"
              onClick={() => handlePrepareResponse()}
              disabled={loading}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-amber-500 hover:bg-amber-600 active:bg-amber-700 text-white font-semibold text-sm sm:text-base shadow-xs hover:shadow transition-all disabled:opacity-60 cursor-pointer"
            >
              {loading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Připravuji odpověď...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  <span>Připravit odpověď</span>
                </>
              )}
            </button>
          </div>
        </section>

        {/* Results: The two required separate sections */}
        {result && (
          <section id="output-section" className="space-y-6 pt-2 animate-in fade-in duration-300">
            {/* Section 1: Návrh odpovědi zákazníkovi */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 sm:p-6 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
                <div className="flex items-center gap-3">
                  <div className="w-7 h-7 rounded-lg bg-amber-100 text-amber-800 font-bold text-xs flex items-center justify-center">
                    1
                  </div>
                  <div>
                    <h3 className="text-base sm:text-lg font-bold text-slate-900 font-heading flex items-center gap-2">
                      <FileText className="w-4 h-4 text-amber-500" />
                      Návrh odpovědi zákazníkovi
                    </h3>
                    <p className="text-xs text-slate-500">
                      Krátká, přirozená zpráva. Můžete ji rovnou upravit a poslat.
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 self-start sm:self-auto">
                  {editableDraft !== initialDraft && (
                    <button
                      type="button"
                      onClick={() => setEditableDraft(initialDraft)}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors"
                      title="Vrátit původní text"
                    >
                      <RotateCcw className="w-3 h-3" />
                      <span>Obnovit</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={handleCopyDraft}
                    className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs sm:text-sm font-semibold transition-all cursor-pointer ${
                      draftCopied
                        ? 'bg-emerald-600 text-white'
                        : 'bg-amber-500 hover:bg-amber-600 text-white shadow-xs'
                    }`}
                  >
                    {draftCopied ? (
                      <>
                        <Check className="w-3.5 h-3.5" />
                        <span>Zkopírováno!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span>Zkopírovat</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Editable response area */}
              <div className="space-y-1.5">
                <textarea
                  rows={6}
                  value={editableDraft}
                  onChange={(e) => setEditableDraft(e.target.value)}
                  className="w-full p-4 rounded-xl border border-slate-200 bg-slate-50/50 hover:bg-white focus:bg-white text-slate-800 text-sm sm:text-base leading-relaxed focus:outline-none focus:ring-2 focus:ring-amber-500 font-sans resize-y"
                />
                <div className="flex items-center justify-between text-[11px] text-slate-400">
                  <span>Krátká zpráva (2–3 věty) bez otázek a odrážek – připraveno rovnou k odeslání.</span>
                  <span>{editableDraft.length} znaků</span>
                </div>
              </div>
            </div>

            {/* Section 2: Na co se ještě doptat */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 sm:p-6 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
                <div className="flex items-center gap-3">
                  <div className="w-7 h-7 rounded-lg bg-indigo-100 text-indigo-800 font-bold text-xs flex items-center justify-center">
                    2
                  </div>
                  <div>
                    <h3 className="text-base sm:text-lg font-bold text-slate-900 font-heading flex items-center gap-2">
                      <HelpCircle className="w-4 h-4 text-indigo-500" />
                      Na co se ještě doptat
                    </h3>
                    <p className="text-xs text-slate-500">
                      Nejvýše 4 konkrétní chybějící informace v odrážkách (rozsah práce, stav stěn, typ malby, fotografie).
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleCopyQuestions}
                  className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs sm:text-sm font-semibold transition-all self-start sm:self-auto cursor-pointer ${
                    questionsCopied
                      ? 'bg-emerald-600 text-white'
                      : 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-xs'
                  }`}
                >
                  {questionsCopied ? (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      <span>Zkopírováno!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>Zkopírovat</span>
                    </>
                  )}
                </button>
              </div>

              {/* List of at most 4 key questions in clear bullet points */}
              {result.missingQuestions && result.missingQuestions.length > 0 ? (
                <ul className="space-y-2.5">
                  {result.missingQuestions.slice(0, 4).map((question, idx) => (
                    <li
                      key={idx}
                      className="p-3.5 rounded-xl bg-slate-50 hover:bg-slate-100/80 border border-slate-200/90 flex items-start gap-3 text-xs sm:text-sm transition-colors"
                    >
                      <span className="w-2 h-2 rounded-full bg-indigo-500 shrink-0 mt-1.5" />
                      <div className="flex items-start gap-2.5 flex-1">
                        {getQuestionIcon(question)}
                        <span className="font-medium text-slate-800 leading-relaxed">
                          {question}
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-slate-500 italic p-3 bg-slate-50 rounded-xl">
                  Zákazník ve své poptávce uvedl všechny základní údaje (rozsah, stav stěn i typ malby).
                </p>
              )}
            </div>
          </section>
        )}
      </main>

      {/* Footer */}
      <footer className="mt-auto border-t border-slate-200 bg-white py-3.5 text-center text-xs text-slate-500">
        <p>Pomocník pro odpovědi na poptávky • Pro malíře pokojů</p>
      </footer>
    </div>
  );
}
