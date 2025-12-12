"use client"
import { useState, useEffect } from 'react';
import config from '../config';
interface Issue {
    id: number;
    title: string;
    description: string;
    status: string;
    timestamp: string;
}

export default function IssueTracker() {
    const [issues, setIssues] = useState<Issue[]>([]);

    useEffect(() => {
        const interval = setInterval(fetchIssues, 2000);
        fetchIssues();
        return () => clearInterval(interval);
    }, []);

    const fetchIssues = async () => {
        const res = await fetch(`${config.API_BASE_URL}/issues`);
        if (res.ok) {
            const data = await res.json();
            setIssues(data);
        }
    };

    const resolveIssue = async (id: number) => {
        await fetch(`${config.API_BASE_URL}/issues/${id}/resolve`, { method: 'PUT' });
        fetchIssues();
    };

    return (
        <div className="h-full border-2 border-green-500/50 bg-black/80 p-6 font-mono text-green-500 overflow-hidden flex flex-col clip-path-panel relative">
            <h2 className="text-xl font-bold mb-4 border-b border-green-500 pb-2">ISSUE TRACKER</h2>

            <div className="flex-1 overflow-y-auto space-y-3 custom-scrollbar min-h-0 pr-20 pb-20">
                {issues.map((issue) => (
                    <div key={issue.id} className={`p-3 border ${issue.status === 'RESOLVED' ? 'border-green-900 text-green-800' : 'border-green-500/50'} relative group`}>
                        <div className="flex justify-between items-start">
                            <span className="font-bold">{issue.title}</span>
                            <span className="text-xs opacity-70">{new Date(issue.timestamp).toLocaleDateString()}</span>
                        </div>
                        <p className="text-sm mt-1 opacity-80">{issue.description}</p>
                        <div className="flex justify-between items-center mt-2">
                            <span className={`text-xs px-2 py-0.5 ${issue.status === 'RESOLVED' ? 'bg-green-900' : 'bg-red-900/50 text-red-400'}`}>
                                {issue.status}
                            </span>
                            {issue.status !== 'RESOLVED' && (
                                <button
                                    onClick={() => resolveIssue(issue.id)}
                                    className="bg-transparent text-xs hover:text-white"
                                    style={{
                                        color: 'lime',
                                        border: 'solid 1px lime',
                                        borderRadius: '4px',
                                        transition: 'background-color 0.3s ease, color 0.3s ease',
                                    }}
                                    onMouseEnter={(e) => {
                                        e.currentTarget.style.backgroundColor = 'lime';
                                        e.currentTarget.style.color = 'black';
                                    }}
                                    onMouseLeave={(e) => {
                                        e.currentTarget.style.backgroundColor = 'transparent';
                                        e.currentTarget.style.color = 'lime';
                                    }}
                                >
                                    RESOLVE
                                </button>
                            )}
                        </div>
                    </div>
                ))}
            </div>

            {/* Scanline overlay for this panel */}
            <div className="pointer-events-none absolute inset-0 bg-scanline opacity-10"></div>
        </div>
    );
}
