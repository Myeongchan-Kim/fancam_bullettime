import { BrowserRouter as Router, Routes, Route, Link, useLocation } from 'react-router-dom';
import { useEffect } from 'react';
import HomePage from './pages/HomePage';
import VideoDetailPage from './pages/VideoDetailPage';
import AboutPage from './pages/AboutPage';
import AdminDashboardPage from './pages/AdminDashboardPage';
import { Candy, LayoutDashboard } from 'lucide-react';
import { API_BASE_URL } from './constants';

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

function App() {
  const adminKey = localStorage.getItem('admin_key');

  return (
    <Router>
      <ScrollToTop />
      <div className="min-h-screen flex flex-col">
        {/* Navigation Header */}
        <nav className="sticky top-0 z-50 bg-slate-900/80 backdrop-blur-md border-b border-slate-700">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center justify-between h-16">
              <Link to="/" className="flex items-center space-x-2">
                <Candy className="h-8 w-8 text-twice-magenta" />
                <div className="flex flex-col">
                  <span className="text-2xl font-black uppercase tracking-tighter italic twice-text-gradient leading-tight">
                    TWICE World Tour 360° Fancam Archive
                  </span>
                  {import.meta.env.DEV && (
                    <span className="text-[9px] font-bold text-gray-500 uppercase tracking-widest leading-none ml-1">
                      Dev Mode • API: {API_BASE_URL.replace('http://', '').replace('https://', '')}
                    </span>
                  )}
                </div>
              </Link>
              <div className="flex items-center space-x-4">
                <Link to="/" className="text-gray-300 hover:text-white px-3 py-2 text-sm font-medium">Home</Link>
                <Link to="/about" className="text-gray-300 hover:text-white px-3 py-2 text-sm font-medium">About</Link>
                {adminKey && (
                  <Link to="/admin" className="bg-slate-800 text-twice-apricot hover:bg-slate-700 px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest flex items-center gap-2 transition-all border border-twice-apricot/20">
                    <LayoutDashboard className="h-4 w-4" /> Dashboard
                  </Link>
                )}
              </div>
            </div>
          </div>
        </nav>

        {/* Main Content */}
        <main className="flex-grow max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full">
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/video/:id" element={<VideoDetailPage />} />
            <Route path="/about" element={<AboutPage />} />
            <Route path="/admin" element={<AdminDashboardPage />} />
          </Routes>
        </main>

        {/* Footer */}
        <footer className="bg-slate-900 border-t border-slate-700 py-12">
          <div className="max-w-7xl mx-auto px-4 text-center">
            <div className="flex justify-center space-x-6 mb-4">
              <Link to="/" className="text-gray-400 hover:text-white transition-colors">Home</Link>
              <Link to="/about" className="text-gray-400 hover:text-white transition-colors">About</Link>
              <a href="https://github.com/Myeongchan-Kim/fancam_bullettime" target="_blank" rel="noopener noreferrer" className="text-gray-400 hover:text-white transition-colors">GitHub</a>
              <a href="https://www.youtube.com/channel/UCZsY0AUdS8yhLCKtCbzB3Cg" target="_blank" rel="noopener noreferrer" className="text-gray-400 hover:text-white transition-colors">YouTube</a>
            </div>
            <p className="text-gray-500 text-sm">
              © 2026 TWICE World Tour 360° Fancam Archive - All stage videos are property of their respective creators.
            </p>
          </div>
        </footer>
      </div>
    </Router>
  );
}

export default App;
