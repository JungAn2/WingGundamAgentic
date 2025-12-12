import RadarChat from '../components/RadarChat';
import TaskMonitor from '../components/TaskMonitor';
import ScheduledTasksList from '../components/ScheduledTasksList';
import IssueTracker from '../components/IssueTracker';
import HostManager from '../components/HostManager';

export default function Home() {
  return (
    <main className="h-screen w-full bg-black text-green-500 font-mono overflow-hidden flex flex-col relative">
      {/* Top Header */}
      <header className="w-full flex-none border-b-2 border-green-500/50 flex flex-col items-center justify-center p-2 bg-green-900/10 z-20">
        <h1 className="text-2xl font-bold tracking-widest text-shadow-glow mb-1">ZERO SYSTEM v2.0</h1>
        <div className="flex gap-4 text-xs opacity-70">
          <div>STATUS: ONLINE</div>
          <div>MODE: AGENTIC</div>
          <div>PILOT: HEERO YUY</div>
        </div>
      </header>

      {/* Cockpit Grid */}
      <div className="flex-1 relative grid grid-cols-12 gap-0 p-4 overflow-hidden text-sm">

        {/* Left Panel: Scheduled Tasks & Logs */}
        <div className="col-span-3 h-full pr-2 flex flex-col gap-2">
          {/* Top: Scheduled Tasks */}
          <div className="flex-1">
            <ScheduledTasksList />
          </div>
          {/* Bottom: Task Monitor (Logs) */}
          <div className="flex-1 overflow-hidden">
            <TaskMonitor />
          </div>
        </div>

        {/* Center Panel: Radar Chat */}
        <div className="col-span-6 h-full flex items-center justify-center relative overflow-hidden">
          <RadarChat />
        </div>

        {/* Right Panel: Issue Tracker */}
        <div className="col-span-3 h-full pl-2 overflow-hidden flex flex-col gap-2">
          <div className="flex-1 overflow-hidden">
             <IssueTracker />
          </div>
          <div className="flex-1 overflow-hidden">
             <HostManager />
          </div>
        </div>

        {/* Background Gradients/Effects */}
        <div className="absolute inset-0 pointer-events-none bg-cockpit-vignette opacity-50 z-0"></div>
      </div>
    </main>
  );
}
