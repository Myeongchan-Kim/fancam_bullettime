import { useState } from 'react';
import { Heart, Github, Youtube, Copy, Check, MessageSquareHeart, Zap, View } from 'lucide-react';

const AboutPage = () => {
  const [copied, setCopied] = useState(false);
  const email = "twice.once.fancam.maina@gmail.com";

  const copyToClipboard = () => {
    navigator.clipboard.writeText(email);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="max-w-5xl mx-auto py-12 px-4 sm:px-6 lg:px-8 space-y-16">
      {/* 1. Header & The Dream */}
      <section className="text-center space-y-6">
        <h1 className="text-4xl md:text-5xl font-extrabold text-white tracking-tight">
          Our Goal: <span className="twice-text-gradient uppercase italic tracking-tighter text-5xl md:text-6xl">The 360° Bullet Time</span>
        </h1>
        <div className="max-w-3xl mx-auto bg-slate-900/30 p-8 rounded-3xl border border-slate-800/50 shadow-inner mb-12">
          <p className="text-xl text-twice-apricot leading-relaxed italic font-medium mb-4">
            "어느 날 공연 영상을 보다가 객석을 가득 채운 별빛 같은 핸드폰들을 보며 생각했습니다.<br/>
            저 수많은 시선들을, 저 직캠들을 전부 하나로 이어 붙여보면 어떨까?"
          </p>
          <p className="text-lg text-gray-400 leading-relaxed">
            이 아카이브는 그 작은 상상에서 시작되었습니다. 우리의 목표는 전 세계 원스들이 서로 다른 위치에서 기록한 수만 개의 파편화된 영상들을 완벽하게 동기화하여, 
            마치 영화 '매트릭스'의 <strong className="text-twice-magenta">불릿 타임(Bullet Time)</strong>처럼 사용자가 원하는 각도로 무대를 돌려보며 감상하는 혁신적인 시청 경험을 구현하는 것입니다.
          </p>
        </div>
      </section>

      {/* 2. The Path We Take (Full Width Bar) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <section className="bg-slate-900/30 rounded-[2rem] p-8 md:p-10 border border-slate-800 hover:border-twice-magenta/20 transition-all space-y-6">
          <div className="bg-twice-magenta/10 w-16 h-16 rounded-2xl flex items-center justify-center shadow-inner">
            <View className="text-twice-magenta w-8 h-8" />
          </div>
          <h3 className="text-2xl font-bold text-white tracking-tight">입체적인 감상, 멀티앵글 싱크</h3>
          <p className="text-gray-400 text-base leading-relaxed">
            마스터 영상(Full Concert)의 타임라인을 기준으로 모든 직캠의 오프셋을 정밀하게 동기화합니다. 수십 개의 앵글이 끊김 없이 매끄럽게 교차되는 진정한 멀티앵글 경험을 향해 나아가고 있습니다.
          </p>
        </section>

        <section className="bg-slate-900/30 rounded-[2rem] p-8 md:p-10 border border-slate-800 hover:border-blue-500/20 transition-all space-y-6">
          <div className="bg-blue-500/10 w-16 h-16 rounded-2xl flex items-center justify-center shadow-inner">
            <Zap className="text-blue-500 w-8 h-8" />
          </div>
          <h3 className="text-2xl font-bold text-white tracking-tight">AI와 집단지성의 결합</h3>
          <p className="text-gray-400 text-base leading-relaxed">
            Gemini AI가 24시간 내내 유튜브를 탐색하여 방대한 투어 데이터를 수집하고 분류합니다. 그리고 이 시스템의 마지막 0.01초 오차를 바로잡아 완성도를 높이는 것은 바로 원스(ONCE) 여러분의 기여입니다.
          </p>
        </section>
      </div>

      {/* 2.5 Sync Guide Section */}
      <section className="bg-slate-900/50 rounded-[3rem] p-10 md:p-12 border border-slate-800 shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-twice-magenta/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2"></div>
        
        <div className="relative z-10 space-y-10">
          <div className="text-center space-y-4">
            <h2 className="text-3xl font-black text-white uppercase tracking-tight italic">
              ⏱️ <span className="twice-text-gradient">Sync Guide</span>: 타임 오프셋 맞추는 법
            </h2>
            <p className="text-gray-400 max-w-2xl mx-auto">
              모든 영상은 콘서트 시작 시점을 기준으로 정렬됩니다. 정확한 싱크 오프셋 설정은 전 세계 원스들에게 완벽한 360도 경험을 선사합니다.
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="bg-slate-950/50 p-6 rounded-2xl border border-slate-800 space-y-4">
              <div className="text-twice-magenta font-black text-xl italic">01. 기준점 잡기</div>
              <p className="text-sm text-gray-400 leading-relaxed">
                각 콘서트의 <strong className="text-white">마스터 타임라인(0:00)</strong>은 공연이 완전히 시작되는 첫 순간입니다. 보통 오프닝 VCR이 시작되거나 인트로 문구(<span className="text-twice-apricot">"This is for..."</span>)가 화면에 나타나는 시점을 0초로 잡습니다.
              </p>
            </div>

            <div className="bg-slate-950/50 p-6 rounded-2xl border border-slate-800 space-y-4">
              <div className="text-twice-magenta font-black text-xl italic">02. 오프셋 계산</div>
              <p className="text-sm text-gray-400 leading-relaxed">
                <strong className="text-white text-sm">싱크 오프셋(Sync Offset)</strong>은 콘서트 시작 후 해당 영상이 <strong className="text-white">몇 초 뒤에 시작하는지</strong>를 의미합니다.<br/><br/>
                <span className="bg-slate-900 px-2 py-1 rounded text-[11px] text-gray-300">예: 콘서트 시작 10분(600초) 후 촬영 시작 ➔ 오프셋 600</span>
              </p>
            </div>

            <div className="bg-slate-950/50 p-6 rounded-2xl border border-slate-800 space-y-4">
              <div className="text-twice-magenta font-black text-xl italic">03. 미세 조정</div>
              <ul className="text-sm text-gray-400 space-y-2 list-disc pl-4">
                <li>영상이 마스터보다 <strong className="text-white">빠를 때</strong> (화면이 먼저 나옴) ➔ 오프셋 값을 <span className="text-green-500 font-bold">늘리세요 (+1.0)</span></li>
                <li>영상이 마스터보다 <strong className="text-white">느릴 때</strong> (화면이 나중에 나옴) ➔ 오프셋 값을 <span className="text-red-500 font-bold">줄이세요 (-1.0)</span></li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* 3. Contact & Call to Action */}
      <section className="bg-twice-magenta/5 rounded-[2.5rem] p-10 md:p-12 border border-twice-magenta/10 flex flex-col md:flex-row items-center gap-10 mt-12">
        <div className="bg-twice-magenta/10 w-24 h-24 rounded-full flex items-center justify-center shrink-0 shadow-[0_0_30px_rgba(255,25,136,0.1)]">
          <MessageSquareHeart className="text-twice-magenta w-12 h-12" />
        </div>
        <div className="flex-grow text-center md:text-left space-y-4">
          <h2 className="text-2xl font-bold text-white">함께 꿈을 현실로 만들어주세요</h2>
          <p className="text-gray-500">
            부족한 데이터, 어긋난 싱크, 누락된 영상 제보... 그 어떤 의견도 소중합니다. <br/>
            원스 여러분의 작은 참여가 우리가 꿈꾸는 360도 아카이브를 완성하는 가장 큰 힘이 됩니다.
          </p>
        </div>
        <div className="shrink-0 space-y-3 w-full md:w-auto">
          <div className="flex items-center justify-between bg-slate-950 p-4 rounded-xl border border-slate-800 min-w-[300px]">
            <span className="font-mono text-gray-300 text-sm truncate mr-4">{email}</span>
            <button
              onClick={copyToClipboard}
              className="p-2 hover:bg-slate-800 rounded-lg text-gray-400 hover:text-white transition-all active:scale-90"
              title="복사하기"
            >
              {copied ? <Check className="w-5 h-5 text-green-500" /> : <Copy className="w-5 h-5" />}
            </button>
          </div>
          <a 
            href={`mailto:${email}`}
            className="flex items-center justify-center space-x-2 w-full py-3 px-6 bg-twice-magenta hover:bg-twice-magenta/90 text-white rounded-xl font-black uppercase tracking-widest text-xs transition-all shadow-lg shadow-twice-magenta/20"
          >
            <span>Send Us Your Vision</span>
          </a>
        </div>
      </section>

      {/* 5. Footer Repository */}
      <div className="pt-8 text-center border-t border-slate-800/50">
        <div className="flex justify-center items-center space-x-10">
          <a href="https://github.com/mckim/twice_concert_crawling" target="_blank" rel="noopener noreferrer" className="flex items-center space-x-2 text-gray-500 hover:text-white transition-colors group">
            <Github className="w-6 h-6 group-hover:scale-110 transition-transform" />
            <span className="font-bold uppercase tracking-tighter text-sm">GitHub</span>
          </a>
          <a href="#" className="flex items-center space-x-2 text-gray-500 hover:text-white transition-colors group">
            <Youtube className="w-6 h-6 group-hover:scale-110 transition-transform" />
            <span className="font-bold uppercase tracking-tighter text-sm">YouTube</span>
          </a>
        </div>
        <div className="mt-8">
          <Heart className="text-twice-magenta w-5 h-5 mx-auto animate-pulse opacity-30" />
        </div>
      </div>
    </div>
  );
};

export default AboutPage;
