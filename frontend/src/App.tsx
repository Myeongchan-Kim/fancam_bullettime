import React from 'react';
import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom';
import HomePage from './pages/HomePage';
import VideoDetailPage from './pages/VideoDetailPage';
import { Candy } from 'lucide-react';

function App() {
  return (
    <Router>
      <div className="min-h-screen flex flex-col">
        {/* Navigation Header */}
        <nav className="sticky top-0 z-50 bg-slate-900/80 backdrop-blur-md border-b border-slate-700">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center justify-between h-16">
              <Link to="/" className="flex items-center space-x-2">
                <Candy className="h-8 w-8 text-twice-magenta" />
                <span className="text-xl font-bold uppercase tracking-widest twice-text-gradient">
                  TWICE World Tour Archive
                </span>
              </Link>
              <div className="flex space-x-4">
                <Link to="/" className="text-gray-300 hover:text-white px-3 py-2 text-sm font-medium">Home</Link>
                <a href="#" className="text-gray-300 hover:text-white px-3 py-2 text-sm font-medium">About</a>
              </div>
            </div>
          </div>
        </nav>

        {/* Main Content */}
        <main className="flex-grow max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full">
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/video/:id" element={<VideoDetailPage />} />
          </Routes>
        </main>

        {/* Footer */}
        <footer className="bg-slate-900 border-t border-slate-700 py-8">
          <div className="max-w-7xl mx-auto px-4 text-center text-gray-400 text-sm">
            <p>© 2026 TWICE World Tour Archive - All stage videos are property of their respective creators.</p>
          </div>
        </footer>
      </div>
    </Router>
  );
}

export default App;
