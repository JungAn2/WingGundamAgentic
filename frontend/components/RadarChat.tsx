"use client"
import { useState, useRef, useEffect } from 'react';
import config from '../config';
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
    const [elapsedTime, setElapsedTime] = useState(0);
    const [executionMode, setExecutionMode] = useState(false);
    const [isConfigOpen, setIsConfigOpen] = useState(false);
    const [configState, setConfigState] = useState({ provider: 'deepseek', model: 'deepseek-chat' });
    
    useEffect(() => {
        // Load initial config
        fetch(`${config.API_BASE_URL}/config/llm`)
            .then(res => res.json())
            .then(data => setConfigState(data))
            .catch(() => {});
    }, []);

    const saveConfig = async () => {
        try {
           const res = await fetch(`${config.API_BASE_URL}/config/llm`, {
               method: 'POST',
               headers: { 'Content-Type': 'application/json' },
               body: JSON.stringify(configState)
           });
           if (res.ok) {
               alert("System Configuration Updated");
               setIsConfigOpen(false);
           }
        } catch (e) {
            alert("Failed to save configuration");
        }
    };

    const messagesEndRef = useRef<HTMLDivElement>(null);
    const stopRef = useRef(false);


    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    useEffect(scrollToBottom, [messages]);

    useEffect(() => {
        let interval: NodeJS.Timeout;
        if (analysisMode || executionMode) {
            const startTime = Date.now();
            setElapsedTime(0);
            interval = setInterval(() => {
                setElapsedTime((Date.now() - startTime) / 1000);
            }, 100);
        }
        return () => clearInterval(interval);
    }, [analysisMode, executionMode]);

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

        const startTime = Date.now();

        try {
            // Simplified: No model param needed, backend defaults to fast model
            const res = await fetch(`${config.API_BASE_URL}/chat`, {
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
            
            const duration = ((Date.now() - startTime) / 1000).toFixed(2);

            if (parsed.type === 'command_proposal') {
                const newMsg: ChatMessage = {
                    role: 'system',
                    content: 'Command Proposal Received.',
                    isProposal: true,
                    proposalData: {
                        type: 'command',
                        command: parsed.command,
                        reason: parsed.reason + ` [Time: ${duration}s]`
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
                        reason: parsed.reason + ` [Time: ${duration}s]`
                    }
                };
                setMessages(prev => [...prev, newMsg]);

                if (autoApprove) {
                    await executeAction(newMsg.proposalData!, true);
                }

            } else {
                setMessages(prev => [...prev, { role: 'system', content: parsed.content + `\n\n[Process Time: ${duration}s]` }]);
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

        setExecutionMode(true);

        if (type === 'command') {
            logMsg += command;
        } else {
            logMsg += `${action} (${JSON.stringify(data)})`;
        }

        setMessages(prev => [...prev, { role: 'system', content: logMsg }]);

        try {
            let result: any;

            if (type === 'command') {
                const res = await fetch(`${config.API_BASE_URL}/execute-command`, {
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

                if (action === 'ping_hosts') {
                    endpoint = '/hosts/ping-all';
                    method = 'POST';
                    body = {};
                }

                // Fix endpoint if run-task
                if (action === 'run_task') endpoint = '/run-task';

                const res = await fetch(`${config.API_BASE_URL}${endpoint}`, {
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
            setExecutionMode(false);
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

    const handleStop = async () => {
        stopRef.current = true;
        setIsRunning(false);
        setAnalysisMode(false);
        setExecutionMode(false);
        
        try {
            await fetch(`${config.API_BASE_URL}/kill-all-processes`, { method: 'POST' });
            setMessages(prev => [...prev, { role: 'system', content: '*** EMERGENCY STOP TRIGGERED - PROCESSES TERMINATED ***' }]);
        } catch (e) {
            setMessages(prev => [...prev, { role: 'system', content: '*** EMERGENCY STOP FAILED TO REACH SERVER ***' }]);
        }
    };

    return (
        <div className="w-full h-full flex flex-col bg-black/80 border-2 border-green-500/50 overflow-hidden relative clip-path-panel">
            {/* Header / Mode Toggle */}
            <div className="flex items-center justify-between px-6 py-3 border-b border-green-500/50 bg-green-900/10 h-16 shrink-0">
                <div className="text-green-500 font-bold tracking-wider flex items-center gap-4 text-lg">
                    PILOT INTERFACE
                    {(analysisMode || executionMode) && <span className={`font-mono text-sm border px-2 py-0.5 rounded ${executionMode ? 'text-yellow-400 border-yellow-500/30 bg-yellow-900/20' : 'text-green-400 border-green-500/30 bg-green-900/20'}`}>{executionMode ? 'EXECUTING' : 'PROCESSING'}... T+{elapsedTime.toFixed(1)}s</span>}
                    {isRunning && (
                        <button
                            onClick={handleStop}
                            className="bg-red-600 hover:bg-red-500 text-white px-3 py-1 text-xs font-bold animate-pulse border border-red-400"
                            style={{color:'lime', border:'solid 1px lime', backgroundColor:'transparent', borderRadius:'4px', transition:'all 0.3s ease'}}
                            onMouseEnter={(e) => {
                                e.currentTarget.style.backgroundColor = 'lime';
                                e.currentTarget.style.color = 'black';
                            }}
                            onMouseLeave={(e) => {
                                e.currentTarget.style.backgroundColor = 'transparent';
                                e.currentTarget.style.color = 'lime';
                            }}
                        >
                            ■ STOP
                        </button>
                    )}
                </div>

                <div className="flex items-center gap-4">
                    {/* Config Toggle */}
                    <button
                        onClick={() => setIsConfigOpen(true)}
                        className="px-3 py-1 border border-green-500 text-green-500 text-sm font-bold transition-all bg-transparent hover:bg-green-500 hover:text-black ml-2"
                    >
                        CONFIG
                    </button>
                    
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

            {/* Config Modal */}
            {isConfigOpen && (
                <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm p-10">
                    <div className="w-full max-w-md border-2 border-green-500 bg-black p-6 shadow-[0_0_50px_rgba(34,197,94,0.3)]">
                         <div className="flex justify-between items-center mb-6 border-b border-green-500 pb-2">
                            <h2 className="text-xl font-bold text-green-400">SYSTEM CONFIGURATION</h2>
                            <button onClick={() => setIsConfigOpen(false)} className="text-green-600 hover:text-green-300">X</button>
                        </div>
                        
                        <div className="space-y-4 mb-6">
                            <div>
                                <label className="block text-xs font-bold mb-2 text-green-500">LLM PROVIDER</label>
                                <select 
                                    className="w-full bg-green-900/10 border border-green-500 p-2 text-green-300 focus:outline-none"
                                    value={configState.provider}
                                    onChange={e => setConfigState({...configState, provider: e.target.value})}
                                >
                                    <option value="deepseek">DEEPSEEK V3 (Cloud)</option>
                                    <option value="ollama">OLLAMA (Local)</option>
                                </select>
                            </div>
                            
                            {configState.provider === 'ollama' && (
                                <div>
                                    <label className="block text-xs font-bold mb-2 text-green-500">OLLAMA MODEL</label>
                                    <input 
                                        className="w-full bg-green-900/10 border border-green-500 p-2 text-green-300 focus:outline-none"
                                        value={configState.model}
                                        onChange={e => setConfigState({...configState, model: e.target.value})}
                                        placeholder="mistral"
                                    />
                                    <div className="text-[10px] text-green-500/50 mt-1">Make sure you have pulled this model: `ollama pull {configState.model || 'mistral'}`</div>
                                </div>
                            )}
                        </div>
                        
                        <div className="flex justify-end gap-2">
                             <button onClick={() => setIsConfigOpen(false)} className="text-green-600 px-4 py-2 text-xs font-bold hover:text-green-400">CANCEL</button>
                             <button onClick={saveConfig} className="bg-green-600 text-black px-6 py-2 text-xs font-bold hover:bg-green-500">SAVE & RELOAD</button>
                        </div>
                    </div>
                </div>
            )}

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
                    {analysisMode && <span className="text-green-500 font-mono text-sm tracking-widest ml-4">PROCESSING... {elapsedTime.toFixed(1)}s</span>}
                    {executionMode && <span className="text-yellow-500 font-mono text-sm tracking-widest ml-4 animate-pulse">EXECUTING... {elapsedTime.toFixed(1)}s</span>}
                </div>
            </div>

            {/* Decorative Overlay */}
            <div className="absolute inset-0 pointer-events-none opacity-10 bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.25)_50%),linear-gradient(90deg,rgba(255,0,0,0.06),rgba(0,255,0,0.02),rgba(0,0,255,0.06))] z-0 bg-[length:100%_2px,3px_100%]"></div>
        </div>
    );
}
