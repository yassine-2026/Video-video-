import React, { useState, useEffect } from 'react';
import { SURAHS, RECITERS, BACKGROUNDS } from './data';
import { Loader2, Download, Video, AlertCircle, PlayCircle } from 'lucide-react';

export default function App() {
  const [surah, setSurah] = useState(1);
  const [startAyah, setStartAyah] = useState(1);
  const [endAyah, setEndAyah] = useState(7);
  const [reciter, setReciter] = useState(RECITERS[0]);
  const [background, setBackground] = useState(BACKGROUNDS[0]);

  const [taskId, setTaskId] = useState<string | null>(null);
  const [status, setStatus] = useState<'idle' | 'processing' | 'done' | 'error'>('idle');
  const [progress, setProgress] = useState(0);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (taskId && status === 'processing') {
      interval = setInterval(async () => {
        try {
          const res = await fetch(`/api/status/${taskId}`);
          if (!res.ok) throw new Error('Failed to fetch status');
          const data = await res.json();
          
          setProgress(data.progress);
          setStatus(data.status);
          
          if (data.status === 'error') {
            setErrorMsg(data.error || 'حدث خطأ غير معروف');
            setTaskId(null);
          } else if (data.status === 'done') {
            // keep taskId to show download
          }
        } catch (err) {
          console.error(err);
        }
      }, 2000);
    }
    return () => clearInterval(interval);
  }, [taskId, status]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (startAyah > endAyah) {
      alert('الآية النهاية يجب أن تكون أكبر من أو تساوي الآية البداية');
      return;
    }
    
    setStatus('processing');
    setProgress(0);
    setErrorMsg('');
    setTaskId(null);

    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ surah, startAyah, endAyah, reciter, background }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'فشل بدء العملية');
      
      setTaskId(data.taskId);
    } catch (err: any) {
      setStatus('error');
      setErrorMsg(err.message);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans" dir="rtl">
      <div className="max-w-2xl mx-auto py-12 px-4 sm:px-6">
        
        <header className="text-center mb-10">
          <div className="inline-flex items-center justify-center p-3 bg-emerald-100 rounded-full mb-4">
            <Video className="w-8 h-8 text-emerald-700" />
          </div>
          <h1 className="text-3xl font-bold text-slate-800 mb-2 tracking-tight">صانع تلاوات القرآن</h1>
          <p className="text-slate-600">قم بإنشاء مقاطع فيديو قرآنية بخلفيات طبيعية بسهولة</p>
        </header>

        <main className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="p-6 sm:p-8">
            <form onSubmit={handleSubmit} className="space-y-6">
              
              <div className="space-y-2">
                <label className="block text-sm font-medium text-slate-700">السورة</label>
                <select 
                  value={surah} 
                  onChange={(e) => setSurah(Number(e.target.value))}
                  className="w-full rounded-lg border-slate-300 border px-4 py-2.5 focus:ring-emerald-500 focus:border-emerald-500 bg-slate-50"
                >
                  {SURAHS.map((s, i) => (
                    <option key={i} value={i + 1}>{i + 1}. سورة {s}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-slate-700">من آية</label>
                  <input 
                    type="number" 
                    min={1} 
                    value={startAyah} 
                    onChange={(e) => setStartAyah(Number(e.target.value))}
                    className="w-full rounded-lg border-slate-300 border px-4 py-2.5 focus:ring-emerald-500 focus:border-emerald-500 bg-slate-50 text-left"
                    dir="ltr"
                  />
                </div>
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-slate-700">إلى آية</label>
                  <input 
                    type="number" 
                    min={1} 
                    value={endAyah} 
                    onChange={(e) => setEndAyah(Number(e.target.value))}
                    className="w-full rounded-lg border-slate-300 border px-4 py-2.5 focus:ring-emerald-500 focus:border-emerald-500 bg-slate-50 text-left"
                    dir="ltr"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="block text-sm font-medium text-slate-700">القارئ</label>
                <select 
                  value={reciter} 
                  onChange={(e) => setReciter(e.target.value)}
                  className="w-full rounded-lg border-slate-300 border px-4 py-2.5 focus:ring-emerald-500 focus:border-emerald-500 bg-slate-50"
                >
                  {RECITERS.map((r, i) => (
                    <option key={i} value={r}>{r}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <label className="block text-sm font-medium text-slate-700">الخلفية</label>
                <select 
                  value={background} 
                  onChange={(e) => setBackground(e.target.value)}
                  className="w-full rounded-lg border-slate-300 border px-4 py-2.5 focus:ring-emerald-500 focus:border-emerald-500 bg-slate-50"
                >
                  {BACKGROUNDS.map((b, i) => (
                    <option key={i} value={b}>{b}</option>
                  ))}
                </select>
              </div>

              <button 
                type="submit" 
                disabled={status === 'processing'}
                className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-medium py-3 px-4 rounded-lg transition-colors flex items-center justify-center disabled:opacity-70 disabled:cursor-not-allowed"
              >
                {status === 'processing' ? (
                  <>
                    <Loader2 className="w-5 h-5 ml-2 animate-spin" />
                    جاري الإنشاء... ({progress}%)
                  </>
                ) : (
                  <>
                    <PlayCircle className="w-5 h-5 ml-2" />
                    إنشاء الفيديو
                  </>
                )}
              </button>
            </form>
          </div>

          {/* Results Area */}
          {(status === 'done' || status === 'error') && (
            <div className={`p-6 border-t ${status === 'error' ? 'bg-red-50 border-red-100' : 'bg-emerald-50 border-emerald-100'}`}>
              
              {status === 'error' && (
                <div className="flex items-start text-red-700">
                  <AlertCircle className="w-6 h-6 ml-3 shrink-0 mt-0.5" />
                  <div>
                    <h3 className="font-medium text-lg mb-1">حدث خطأ</h3>
                    <p className="text-sm opacity-90">{errorMsg}</p>
                  </div>
                </div>
              )}

              {status === 'done' && taskId && (
                <div className="flex flex-col sm:flex-row items-center gap-6">
                  <div className="w-full sm:w-1/3 aspect-video bg-black rounded-lg overflow-hidden relative group">
                    <img 
                      src={`/api/thumbnail/${taskId}`} 
                      alt="Thumbnail preview" 
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div className="w-full sm:w-2/3 space-y-4">
                    <h3 className="font-semibold text-lg text-emerald-900">تم إنشاء الفيديو بنجاح!</h3>
                    <p className="text-emerald-700 text-sm">الفيديو جاهز للتحميل الآن. يرجى تحميله قبل انتهاء صلاحية الجلسة.</p>
                    <a 
                      href={`/api/download/${taskId}`} 
                      download
                      className="inline-flex items-center justify-center w-full sm:w-auto bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-2.5 rounded-lg font-medium transition-colors"
                    >
                      <Download className="w-4 h-4 ml-2" />
                      تحميل الفيديو
                    </a>
                  </div>
                </div>
              )}

            </div>
          )}
        </main>
      </div>
    </div>
  );
}
