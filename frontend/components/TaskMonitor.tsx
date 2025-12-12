"use client"
import { useState, useEffect } from 'react';

interface Log {
    id: number;
    timestamp: string;
    command: string;
    status: string;
    output: string;
}

export default function TaskMonitor() {
    const [logs, setLogs] = useState<Log[]>([]);

    const [expandedLogId, setExpandedLogId] = useState<number | null>(null);

    useEffect(() => {
        const interval = setInterval(fetchLogs, 5000);
        fetchLogs();
        return () => clearInterval(interval);
    }, []);

    const fetchLogs = async () => {
        try {
            const res = await fetch('http://localhost:8000/logs');
            if (res.ok) {
                const data = await res.json();
                setLogs(data);
            }
        } catch (e) {
            console.error("Failed to fetch logs");
        }
    };

    return (
        <div className="h-full border-2 border-green-500/50 bg-black/80 p-6 font-mono text-green-500 overflow-hidden flex flex-col clip-path-panel relative">
            <h2 className="text-xl font-bold mb-4 border-b border-green-500">SCHEDULED OPERATIONS</h2>

            <div className="flex-1 overflow-y-auto space-y-2 custom-scrollbar text-xs px-2 min-h-0 pb-20">
                {logs.map((log) => (
                    <div
                        key={log.id}
                        className={`border-b border-green-900/50 hover:bg-green-900/10 cursor-pointer transition-colors ${expandedLogId === log.id ? 'bg-green-900/20' : ''}`}
                        onClick={() => setExpandedLogId(expandedLogId === log.id ? null : log.id)}
                    >
                        <div className="flex justify-between items-center px-6 py-2">
                            <span className="font-bold text-green-400 truncate max-w-[70%]">
                                [{log.command}]
                            </span>
                            <span className={`${log.status === 'SUCCESS' ? 'text-green-500' : 'text-red-500'} font-bold`}>
                                {log.status}
                            </span>
                        </div>

                        {expandedLogId === log.id && (
                            <div className="pb-2 px-3 text-xs opacity-80 animate-in fade-in slide-in-from-top-1">
                                <div className="mb-1 opacity-60 flex gap-2 border-b border-green-500/20 pb-1">
                                    <span>ID: {log.id}</span>
                                    <span>•</span>
                                    <span>{new Date(log.timestamp).toLocaleString()}</span>
                                </div>
                                <div className="whitespace-pre-wrap font-mono bg-black/50 p-2 rounded border border-green-500/10 mt-2">{log.output}</div>
                            </div>
                        )}
                    </div>
                ))}
            </div>

            {/* Decorative Grid SVG */}
            <div className="absolute inset-0 pointer-events-none opacity-20">
                <svg width="100%" height="100%">
                    <defs>
                        <pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse">
                            <path d="M 20 0 L 0 0 0 20" fill="none" stroke="currentColor" strokeWidth="0.5" />
                        </pattern>
                    </defs>
                    <rect width="100%" height="100%" fill="url(#grid)" />
                </svg>
            </div>
            {/* Scanline overlay */}
            <div className="pointer-events-none absolute inset-0 bg-scanline opacity-10"></div>
        </div>
    );
}
