import React from 'react';
import { CourseProvider, useCourseStore } from './store/courseContext';
import { Navbar } from './components/Navbar';
import { Dashboard } from './components/Dashboard';
import { CourseLibrary } from './components/CourseLibrary';
import { CourseView } from './components/CourseView';
import { VideoPlayer } from './components/VideoPlayer';
import { AddCourseModal } from './components/AddCourseModal';
import { NotesDrawer } from './components/NotesDrawer';
import { AnalyticsModal } from './components/AnalyticsModal';

const AppContent: React.FC = () => {
  const { activeView } = useCourseStore();

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-indigo-500 selection:text-white">
      <Navbar />

      <main className="flex-1">
        {activeView === 'dashboard' && <Dashboard />}
        {activeView === 'library' && <CourseLibrary />}
        {activeView === 'course' && <CourseView />}
        {activeView === 'player' && <VideoPlayer />}
      </main>

      <footer className="border-t border-slate-900 bg-slate-950/80 py-4 px-4 sm:px-6 lg:px-8 text-center text-xs text-slate-500">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
          <span>Local Lecture Progress Tracker • 100% Local Browser Storage (IndexedDB)</span>
          <span className="font-mono text-[11px] text-slate-600">No Telemetry • No Cloud Uploads</span>
        </div>
      </footer>

      <AddCourseModal />
      <NotesDrawer />
      <AnalyticsModal />
    </div>
  );
};

export default function App() {
  return (
    <CourseProvider>
      <AppContent />
    </CourseProvider>
  );
}
