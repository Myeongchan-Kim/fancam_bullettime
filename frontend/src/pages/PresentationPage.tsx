import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Play } from 'lucide-react';
import StageMap from '../components/StageMap';

const PresentationPage = () => {
  const [currentSlide, setCurrentSlide] = useState(0);
  const [currentStep, setCurrentStep] = useState(0);
  const navigate = useNavigate();

  // Slide definitions with internal steps
  const slides = [
    {
      id: 1,
      maxSteps: 3,
      content: (step: number) => (
        <div className="flex flex-col items-center justify-center h-full text-center space-y-8 max-w-5xl mx-auto px-6">
          {/* Step 0: Introduction */}
          <h2 className={`text-3xl md:text-5xl font-light text-slate-400 tracking-wider transition-all duration-1000 ${step >= 0 ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10'}`}>
            What is Korea famous for?
          </h2>
          
          {/* Step 1: K-POP Title */}
          <h1 className={`text-6xl md:text-8xl font-black italic twice-text-gradient tracking-tighter pr-4 transition-all duration-1000 ${step >= 1 ? 'opacity-100 scale-100' : 'opacity-0 scale-50'}`}>
            K-POP
          </h1>

          {/* Step 2: The Representative Image */}
          <div className={`relative w-full max-w-4xl aspect-video rounded-3xl overflow-hidden border-4 border-slate-800 shadow-2xl group transition-all duration-1000 ${step >= 2 ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10'}`}>
            <img 
              src="/modern_artist.png" 
              alt="K-POP Concert Scene" 
              className="w-full h-full object-cover transition-transform duration-1000"
            />
            {/* Step 3: Highlight the bottom part */}
            <div className={`absolute inset-0 bg-slate-950/40 transition-opacity duration-1000 ${step >= 3 ? 'opacity-100' : 'opacity-0'}`} />
            <div className={`absolute bottom-0 left-0 w-full h-[40%] border-t-4 border-twice-magenta bg-twice-magenta/20 transition-all duration-1000 ${step >= 3 ? 'opacity-100' : 'opacity-0 translate-y-full'}`} />
          </div>

          {/* Step 3: Explanation text */}
          <div className={`transition-all duration-1000 ${step >= 3 ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10'}`}>
            <p className="text-xl md:text-2xl font-bold text-white tracking-tight">
              I was fascinated by <span className="text-twice-magenta underline underline-offset-8">this bottom part</span>: <br/>
              thousands of fans recording every single angle with their phones.
            </p>
          </div>
        </div>
      ),
    },
    {
      id: 2,
      maxSteps: 3,
      content: (step: number) => (
        <div className="flex flex-col items-center justify-center h-full space-y-10 max-w-5xl mx-auto px-6 text-center">
          
          {/* Step 0: The Motivation */}
          <div className={`transition-all duration-1000 ${step >= 0 ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10'}`}>
            <p className="text-3xl md:text-5xl font-light text-slate-300">
              4 weeks ago, <span className="text-twice-magenta font-bold">TWICE</span> in Boston.
            </p>
          </div>

          {/* Step 1: Stage Map & 360 Context */}
          <div className={`flex flex-col items-center space-y-6 transition-all duration-1000 ${step >= 1 ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10'}`}>
            <div className="relative w-48 md:w-64 aspect-square bg-slate-900/50 rounded-full p-2 border border-slate-700 shadow-[0_0_50px_rgba(255,105,180,0.15)] flex items-center justify-center">
              <StageMap angle="" sizeClass="w-full" stageScale={0.8} />
            </div>
            <p className="text-xl md:text-2xl text-slate-300 leading-relaxed font-medium">
              Thousands of fans surrounding this stage were recording <br className="hidden md:block" />
              the performance from <span className="text-twice-apricot font-bold text-2xl md:text-3xl">every angle in 360°</span>.
            </p>
          </div>

          {/* Step 2: Vision Statement */}
          <div className={`transition-all duration-1000 ${step >= 2 ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10'}`}>
            <h3 className="text-2xl md:text-3xl font-bold text-white italic leading-snug">
              "What if we could synchronize all these scattered perspectives <br className="hidden md:block" /> 
              into one <span className="twice-text-gradient underline underline-offset-8">360° archive?</span>"
            </h3>
          </div>

          {/* Step 3: The Demo Button */}
          <div className={`pt-4 transition-all duration-1000 ${step >= 3 ? 'opacity-100 scale-100' : 'opacity-0 scale-50 pointer-events-none'}`}>
            <button 
              onClick={(e) => {
                e.stopPropagation();
                navigate('/');
              }}
              className="group relative inline-flex items-center gap-3 bg-white text-black px-12 py-6 rounded-full text-2xl font-black uppercase tracking-widest hover:scale-105 transition-all shadow-[0_0_50px_rgba(255,255,255,0.3)] hover:shadow-[0_0_80px_rgba(255,255,255,0.5)]"
            >
              <Play className="w-8 h-8 fill-black" />
              Show Me the Demo
            </button>
          </div>

        </div>
      ),
    },
  ];

  const handleNext = () => {
    const currentSlideData = slides[currentSlide];
    if (currentStep < currentSlideData.maxSteps) {
      setCurrentStep(prev => prev + 1);
    } else if (currentSlide < slides.length - 1) {
      setCurrentSlide(prev => prev + 1);
      setCurrentStep(0);
    }
  };

  const handlePrev = () => {
    if (currentStep > 0) {
      setCurrentStep(prev => prev - 1);
    } else if (currentSlide > 0) {
      const prevSlideIndex = currentSlide - 1;
      setCurrentSlide(prevSlideIndex);
      setCurrentStep(slides[prevSlideIndex].maxSteps);
    }
  };

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === ' ' || e.key === 'Enter') handleNext();
      if (e.key === 'ArrowLeft') handlePrev();
      if (e.key === 'Escape') navigate('/');
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentSlide, currentStep]);

  return (
    <div 
      className="fixed inset-0 z-[100] bg-slate-950 flex flex-col items-center justify-center overflow-hidden cursor-pointer selection:bg-transparent"
      onClick={handleNext}
    >
      {/* Background Decoration */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
        <div className="absolute -top-[10%] -left-[10%] w-[40%] h-[40%] bg-twice-magenta/10 rounded-full blur-[120px]" />
        <div className="absolute -bottom-[10%] -right-[10%] w-[40%] h-[40%] bg-twice-apricot/10 rounded-full blur-[120px]" />
      </div>

      {/* Progress Bar */}
      <div className="absolute top-0 left-0 w-full h-1 bg-slate-900">
        <div 
          className="h-full bg-twice-magenta transition-all duration-500 ease-out"
          style={{ width: `${((currentSlide + 1) / slides.length) * 100}%` }}
        />
      </div>

      {/* Content Area */}
      <div key={slides[currentSlide].id} className="relative w-full h-full pt-10">
        {slides[currentSlide].content(currentStep)}
      </div>

      {/* Exit Button */}
      <button 
        onClick={(e) => {
          e.stopPropagation();
          navigate('/');
        }}
        className="absolute top-6 right-6 text-slate-500 hover:text-white transition-colors text-xs font-bold tracking-widest uppercase z-50"
      >
        Close [ESC]
      </button>

      {/* Slide Indicator */}
      <div className="absolute bottom-10 text-slate-700 font-mono text-[10px] tracking-[0.3em] uppercase">
        Slide 0{currentSlide + 1} / Step 0{currentStep}
      </div>
    </div>
  );
};

export default PresentationPage;
