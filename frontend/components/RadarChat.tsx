"use client"
import { useState, useRef, useEffect } from 'react';

interface ChatMessage {
    role: 'user' | 'system';
    content: string; // Markdown or raw text
    isProposal?: boolean;
    proposalData?: {
        type: 'command' | 'server_action';
        command?: string;
        action?: string;
        data?: any;
        reason: string;
    };
    isApproved?: boolean;
    isDenied?: boolean;
}

export default function RadarChat() {
    const [messages, setMessages] = useState<ChatMessage[]>([
        { role: 'system', content: 'ZERO SYSTEM ONLINE. Waiting for input...' }
    ]);
    const [input, setInput] = useState('');
    const [analysisMode, setAnalysisMode] = useState(false);
    // Removed mode state, defaulting to fast mode implicitly via backend default or hardcoded behavior
    const [autoApprove, setAutoApprove] = useState(false);
    const [isRunning, setIsRunning] = useState(false);

    const messagesEndRef = useRef<HTMLDivElement>(null);
    const stopRef = useRef(false);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    useEffect(scrollToBottom, [messages]);

    const handleSend = async (manualMessage?: string, isHidden: boolean = false) => {
        const msgContent = manualMessage || input;
        if (!msgContent.trim()) return;

        // Visual updates (only if not hidden)
        if (!manualMessage && !isHidden) {
            const userMsg: ChatMessage = { role: 'user', content: msgContent };
            setMessages(prev => [...prev, userMsg]);
            setInput('');
        } else if (manualMessage && !isHidden) {
            // For recursive calls that should be visible (like error reports)
            // We don't add user messages for system recursion usually, so do nothing here or adapt.
            // Actually, for "Auto-Correction", it's better if it looks like a system report.
        }

        setAnalysisMode(true);
        setIsRunning(true);
        stopRef.current = false;

        try {
            // Simplified: No model param needed, backend defaults to fast model
            const res = await fetch('http://localhost:8000/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ message: msgContent }) // Request body simplified
            });
            const data = await res.json();

            if (stopRef.current) {
                setMessages(prev => [...prev, { role: 'system', content: 'PROCESS ABORTED BY PILOT.' }]);
                setAnalysisMode(false);
                setIsRunning(false);
                return;
            }

            // Parse Agent Response
            let parsed;
            try {
                parsed = JSON.parse(data.response);
            } catch {
                parsed = { type: 'response', content: data.response };
            }

            if (parsed.type === 'command_proposal') {
                const newMsg: ChatMessage = {
                    role: 'system',
                    content: 'Command Proposal Received.',
                    isProposal: true,
                    proposalData: {
                        type: 'command',
                        command: parsed.command,
                        reason: parsed.reason
                    }
                };
                setMessages(prev => [...prev, newMsg]);

                if (autoApprove) {
                    await executeAction(newMsg.proposalData!, true);
                }

            } else if (parsed.type === 'server_action') {
                const newMsg: ChatMessage = {
                    role: 'system',
                    content: `Action Proposal: ${parsed.action}`,
                    isProposal: true,
                    proposalData: {
                        type: 'server_action',
                        action: parsed.action,
                        data: parsed.data,
                        reason: parsed.reason
                    }
                };
                setMessages(prev => [...prev, newMsg]);

                if (autoApprove) {
                    await executeAction(newMsg.proposalData!, true);
                }

            } else {
                setMessages(prev => [...prev, { role: 'system', content: parsed.content }]);
            }
        } catch (e) {
            setMessages(prev => [...prev, { role: 'system', content: 'Connection Error: Zero System Offline' }]);
        } finally {
            if (!autoApprove) {
                setAnalysisMode(false);
                setIsRunning(false);
            }
        }
    };

    const executeAction = async (proposal: any, isAuto: boolean = false) => {
        const { type, command, action, data } = proposal;
        let logMsg = isAuto ? "AUTO-EXECUTING: " : "EXECUTION CONFIRMED: ";

        if (type === 'command') {
            logMsg += command;
        } else {
            logMsg += `${action} (${JSON.stringify(data)})`;
        }

        setMessages(prev => [...prev, { role: 'system', content: logMsg }]);

        try {
            let result: any;

            if (type === 'command') {
                const res = await fetch('http://localhost:8000/execute-command', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ command })
                });
                result = await res.json();

                setMessages(prev => [...prev, {
                    role: 'system',
                    content: `RESULT (Code ${result.returncode}):\n${result.stdout}\n${result.stderr}`
                }]);

                // Agentic Error Loop removed or simplified if desired, but keeping error reporting is useful
                if (result.returncode !== 0 && !stopRef.current) {
                    // With fast model, maybe we don't recursive fix, or maybe we do. 
                    // User said "all the backend should be using deepseek-chat", implying logic is simpler.
                    // But if it fails, maybe we still want to report it? 
                    // For now, removing the strict 'AGENTIC' check allows simple recursion if desired, 
                    // or we can remove recursion.
                    // Let's keep it but remove the mode check.
                    await handleSend(`Command '${command}' failed. Error: ${result.stderr}. Fix it.`, true);
                    return;
                }

            } else if (type === 'server_action') {
                let endpoint = '';
                let method = 'POST';
                let body = data;

                if (action === 'create_schedule') endpoint = '/scheduled-tasks';
                if (action === 'run_task') endpoint = '/run-task';

                if (action === 'remove_schedule') {
                    endpoint = `/scheduled-tasks/${data.task_id}`;
                    method = 'DELETE';
                    body = {};
                }

                if (action === 'resolve_issue') {
                    endpoint = `/issues/${data.issue_id}/resolve`;
                    method = 'PUT';
                    body = {};
                }

                // Fix endpoint if run-task
                if (action === 'run_task') endpoint = '/run-task';

                const res = await fetch(`http://localhost:8000${endpoint}`, {
                    method: method,
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(body)
                });

                if (!res.ok) throw new Error(res.statusText);
                result = await res.json();

                setMessages(prev => [...prev, {
                    role: 'system',
                    content: `ACTION SUCCESSFUL: ${JSON.stringify(result)}`
                }]);
            }

            // SUCCESS SUMMARY LOOP
            // Removed Agentic check. If we want summaries, we can keep it.
            if (!stopRef.current) {
                const summaryPrompt = `The previous action (${type === 'command' ? command : action}) verified successful. Result: ${JSON.stringify(result)}. Please provide a concise final summary for the user to close this request.`;
                await handleSend(summaryPrompt, true);
            }

        } catch (e: any) {
            setMessages(prev => [...prev, { role: 'system', content: `Execution Failed: ${e.message}` }]);
            if (!stopRef.current) {
                await handleSend(`Action failed: ${e.message}. Fix it.`, true);
            }
        } finally {
            setAnalysisMode(false);
            setIsRunning(false);
        }
    }

    const handleApproval = async (index: number, approved: boolean, proposal: any) => {
        setMessages(prev => prev.map((msg, i) => {
            if (i === index) {
                return { ...msg, isApproved: approved, isDenied: !approved };
            }
            return msg;
        }));

        if (approved) {
            await executeAction(proposal);
        } else {
            setMessages(prev => [...prev, { role: 'system', content: 'EXECUTION DENIED by User.' }]);
            setAnalysisMode(false);
            setIsRunning(false);
        }
    };

    const handleStop = () => {
        stopRef.current = true;
        setIsRunning(false);
        setAnalysisMode(false);
        setMessages(prev => [...prev, { role: 'system', content: '*** EMERGENCY STOP TRIGGERED ***' }]);
    };

    return (
        <div className="w-full h-full flex flex-col bg-black/80 border-2 border-green-500/50 overflow-hidden relative clip-path-panel">
            {/* Header / Mode Toggle */}
            <div className="flex items-center justify-between px-6 py-3 border-b border-green-500/50 bg-green-900/10 h-16 shrink-0">
                <div className="text-green-500 font-bold tracking-wider flex items-center gap-4 text-lg">
                    PILOT INTERFACE
                    {isRunning && (
                        <button
                            onClick={handleStop}
                            className="bg-red-600 hover:bg-red-500 text-white px-3 py-1 text-xs font-bold animate-pulse border border-red-400"
                        >
                            ■ STOP
                        </button>
                    )}
                </div>

                <div className="flex items-center gap-4">
                    {/* Auto Approve Toggle */}
                    <button
                        onClick={() => setAutoApprove(!autoApprove)}
                        className={`px-4 py-1 border border-green-500 text-green-500 text-sm font-bold transition-all bg-transparent`}
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
                        {autoApprove ? 'AUTO' : 'MANUAL'}
                    </button>
                </div>
            </div>

            {/* Chat Area */}
            <div className="flex-1 overflow-y-auto space-y-4 custom-scrollbar text-sm px-6 py-4 min-h-0 bg-scanline bg-opacity-5">
                {messages.map((msg, idx) => (
                    <div key={idx} className={`${msg.role === 'user' ? 'text-right' : 'text-left'} animate-in fade-in slide-in-from-bottom-2`}>
                        <div className={`inline-block max-w-[80%] ${msg.role === 'user' ? 'text-green-300' : 'text-green-500'}`}>
                            <div className={`text-[10px] uppercase tracking-widest mb-1 opacity-50 ${msg.role === 'user' ? 'text-right' : 'text-left'}`}>
                                {msg.role === 'user' ? 'PILOT' : 'ZERO SYSTEM'}
                            </div>

                            {msg.isProposal ? (
                                <div className="border border-yellow-500/50 bg-yellow-900/10 p-4 rounded-sm text-left">
                                    <div className="text-yellow-400 font-bold mb-1 text-xs border-b border-yellow-500/30 pb-1 flex justify-between">
                                        <span>
                                            {msg.proposalData?.type === 'server_action' ? 'SYSTEM ACTION PROPOSAL' : 'COMMAND PROPOSAL'}
                                        </span>
                                        <span className="animate-pulse">⚠</span>
                                    </div>
                                    <div className="text-yellow-200/80 mb-3 text-xs">{msg.proposalData?.reason}</div>
                                    <div className="font-mono bg-black/80 p-3 mb-3 text-xs border border-white/10 text-green-400">
                                        {msg.proposalData?.type === 'server_action' ? (
                                            <>
                                                <div className="text-white mb-1">&gt; ACTION: {msg.proposalData.action}</div>
                                                <div className="opacity-70">{JSON.stringify(msg.proposalData.data, null, 2)}</div>
                                            </>
                                        ) : (
                                            <>&gt; {msg.proposalData?.command}</>
                                        )}
                                    </div>
                                    {!msg.isApproved && !msg.isDenied && !autoApprove && (
                                        <div className="flex gap-4 justify-end">
                                            <button onClick={() => handleApproval(idx, false, msg.proposalData)} className="px-4 py-1 border border-red-500/50 text-red-500 hover:bg-red-900/30 transition-colors text-xs uppercase tracking-widest">
                                                Deny
                                            </button>
                                            <button onClick={() => handleApproval(idx, true, msg.proposalData)} className="px-4 py-1 border border-green-500 text-green-400 bg-green-500/10 hover:bg-green-500/20 transition-colors text-xs uppercase tracking-widest font-bold shadow-[0_0_10px_rgba(34,197,94,0.2)]">
                                                Approve
                                            </button>
                                        </div>
                                    )}
                                    {msg.isApproved && <div className="text-green-500 text-xs font-bold text-right pt-2 border-t border-green-500/30">[ APPROVED ]</div>}
                                    {msg.isDenied && <div className="text-red-500 text-xs font-bold text-right pt-2 border-t border-red-500/30">[ DENIED ]</div>}
                                </div>
                            ) : (
                                <div className="whitespace-pre-wrap bg-green-900/5 p-3 border-l-2 border-green-500/30">
                                    {msg.content}
                                </div>
                            )}
                        </div>
                    </div>
                ))}
                <div ref={messagesEndRef} />
            </div>

            {/* Input Area */}
            <div className="w-full p-0 bg-black border-t-2 border-green-500 relative z-20">
                <div className="flex items-center w-full h-16 px-6 bg-green-900/10">
                    <span className="text-green-500 font-bold text-2xl mr-4 animate-pulse">&gt;</span>
                    <input
                        type="text"
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                        placeholder="INPUT COMMAND..."
                        className="flex-1 bg-transparent border-none text-green-500 text-2xl font-mono focus:outline-none placeholder-green-500/70 tracking-wider h-full"
                        style={{ color: 'limeGreen' }}
                        disabled={analysisMode && !autoApprove}
                        autoFocus
                    />
                    {analysisMode && <span className="text-green-500 text-xs tracking-widest animate-blink">PROCESSING</span>}
                </div>
            </div>

            {/* Decorative Overlay */}
            <div className="absolute inset-0 pointer-events-none opacity-10 bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.25)_50%),linear-gradient(90deg,rgba(255,0,0,0.06),rgba(0,255,0,0.02),rgba(0,0,255,0.06))] z-0 bg-[length:100%_2px,3px_100%]"></div>
        </div>
    );
}
