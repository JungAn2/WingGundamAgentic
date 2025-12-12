"use client"
import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import config from '../config';

interface ScheduledTask {
    id: number;
    name: string;
    cron_expression: string;
    description: string;
    prompt: string;
    input_command?: string; // Optional
    follow_up_command?: string; // Optional
    is_agentic?: boolean;
    is_active: boolean;
    last_run: string | null;
}

interface ValidationResult {
    isValid: boolean;
    corrections: Partial<ScheduledTask>;
    analysis: string;
}

export default function ScheduledTasksList() {
    const [tasks, setTasks] = useState<ScheduledTask[]>([]);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingTask, setEditingTask] = useState<ScheduledTask | null>(null);
    const [formData, setFormData] = useState<Partial<ScheduledTask>>({});
    const [validationResult, setValidationResult] = useState<ValidationResult | null>(null);
    const [loading, setLoading] = useState(false);
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
        fetchTasks();
    }, []);

    const fetchTasks = async () => {
        try {
            const res = await fetch(`${config.API_BASE_URL}/scheduled-tasks`);
            if (res.ok) {
                const data = await res.json();
                setTasks(data);
            }
        } catch (e) {
            console.error("Failed to fetch scheduled tasks");
        }
    };

    const handleOpenModal = (task?: ScheduledTask) => {
        if (task) {
            setEditingTask(task);
            setFormData(task);
        } else {
            setEditingTask(null);
            setFormData({
                name: '',
                cron_expression: '0 0 * * *',
                description: '',
                prompt: '',
                input_command: '',
                follow_up_command: '',
                is_agentic: false
            });
        }
        setValidationResult(null);
        setIsModalOpen(true);
    };

    const handleValidate = async () => {
        setLoading(true);
        try {
            const res = await fetch(`${config.API_BASE_URL}/validate-task`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formData)
            });
            const data = await res.json();
            setValidationResult(data);

            // Auto-apply corrections if available
            if (data.corrections) {
                setFormData(prev => ({ ...prev, ...data.corrections }));
            }
        } catch (e) {
            console.error("Validation failed", e);
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async () => {
        setLoading(true);
        const url = editingTask
            ? `${config.API_BASE_URL}/scheduled-tasks/${editingTask.id}`
            : `${config.API_BASE_URL}/scheduled-tasks`;
        const method = editingTask ? 'PUT' : 'POST';

        try {
            const res = await fetch(url, {
                method: method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formData)
            });
            if (res.ok) {
                setIsModalOpen(false);
                fetchTasks();
            } else {
                alert("Failed to save task");
            }
        } catch (e) {
            alert("Error saving task: " + e);
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async () => {
        if (!editingTask || !confirm("Are you sure you want to delete this task?")) return;
        setLoading(true);
        try {
            const res = await fetch(`${config.API_BASE_URL}/scheduled-tasks/${editingTask.id}`, {
                method: 'DELETE'
            });
            if (res.ok) {
                setIsModalOpen(false);
                fetchTasks();
            }
        } catch (e) {
            alert("Error deleting task: " + e);
        } finally {
            setLoading(false);
        }
    };

    const applyCorrections = () => {
        if (validationResult?.corrections) {
            setFormData(prev => ({ ...prev, ...validationResult.corrections }));
            setValidationResult(null); // Clear validation to show it's applied
        }
    };

    return (
        <div className={`h-full border-2 border-green-500/50 bg-black/80 p-6 font-mono text-green-500 flex flex-col relative overflow-hidden clip-path-panel ${isModalOpen ? 'z-50' : ''}`}>
            <div className="flex justify-between items-center mb-4 border-b border-green-500 pb-2">
                <h2 className="text-xl font-bold">SCHEDULED TASKS</h2>
                <button
                    onClick={() => handleOpenModal()}
                    className="bg-green-500/20 hover:bg-green-500/40 text-green-400 border border-green-500 px-3 py-1 text-xs font-bold uppercase tracking-wider transition-colors cursor-pointer"
                    style={{ color: 'lime', border: 'solid 1px lime', backgroundColor: 'transparent', borderRadius: '4px', transition: 'all 0.3s ease' }}
                    onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor = 'lime';
                        e.currentTarget.style.color = 'black';
                    }}
                    onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = 'transparent';
                        e.currentTarget.style.color = 'lime';
                    }}
                >
                    + Add Task
                </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-2 custom-scrollbar text-xs px-2 min-h-0 pb-10">
                {tasks.length === 0 ? (
                    <div className="text-green-500/50 italic text-center mt-4">No tasks scheduled.</div>
                ) : (
                    tasks.map((task) => (
                        <div
                            key={task.id}
                            onClick={() => handleOpenModal(task)}
                            className="border border-green-500/30 p-3 hover:bg-green-900/10 transition-colors cursor-pointer group relative"
                        >
                            <div className="flex justify-between items-center mb-1">
                                <span className="font-bold text-green-400 group-hover:text-green-300">{task.name}</span>
                                <span className="text-green-600 bg-green-900/20 px-2 py-0.5 rounded text-[10px] border border-green-800">
                                    {task.cron_expression}
                                </span>
                            </div>
                            <div className="opacity-70 mb-2">{task.description}</div>
                            {task.input_command && (
                                <div className="text-[10px] text-yellow-500/70 mb-1 font-mono">
                                    INPUT: {task.input_command}
                                </div>
                            )}
                            {task.prompt && (
                                <div className="bg-black/40 p-2 border-l-2 border-green-500/50 text-[10px] font-mono break-all opacity-80 mb-1">
                                    &gt; {task.prompt}
                                </div>
                            )}
                            {task.follow_up_command && (
                                <div className="text-[10px] text-blue-500/70 mt-1 font-mono">
                                    FOLLOW-UP: {task.follow_up_command}
                                </div>
                            )}
                            <div className="mt-2 text-[10px] opacity-50 text-right">
                                Last Run: {task.last_run ? new Date(task.last_run).toLocaleString() : 'Never'}
                            </div>
                        </div>
                    ))
                )}
            </div>

            {/* Modal Overlay - Rendered via Portal to escape stacking contexts */}
            {/* Modal Overlay - Rendered via Portal to escape stacking contexts */}
            {mounted && isModalOpen && document.body && createPortal(
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4" style={{ width: '85%', height: '60%', position: 'fixed', top: '25%', left: '10%', zIndex: 50, backgroundColor: 'black' }}>
                    <div className="relative w-full max-w-5xl max-h-[90vh] flex flex-col border-2 border-green-500 bg-black p-6 shadow-[0_0_40px_rgba(34,197,94,0.3)] font-mono overflow-hidden custom-scrollbar">
                        <div className="flex justify-between items-center mb-6 border-b border-green-500/50 pb-2">
                            <h2 className="text-xl font-bold text-green-400 uppercase tracking-widest">
                                {editingTask ? `>> EDIT_SEQUENCE: ID_${editingTask.id}` : '>> NEW_SEQUENCE_INIT'}
                            </h2>
                            <button onClick={() => setIsModalOpen(false)} className="text-green-700 hover:text-green-400 font-bold uppercase tracking-widest text-sm"
                                style={{ color: 'lime', border: 'solid 1px lime', backgroundColor: 'transparent', borderRadius: '4px', transition: 'all 0.3s ease' }}
                                onMouseEnter={(e) => {
                                    e.currentTarget.style.backgroundColor = 'lime';
                                    e.currentTarget.style.color = 'black';
                                }}
                                onMouseLeave={(e) => {
                                    e.currentTarget.style.backgroundColor = 'transparent';
                                    e.currentTarget.style.color = 'lime';
                                }}>CANCEL</button>
                        </div>

                        <div className="grid grid-cols-12 gap-6">
                            <div className="col-span-9">
                                <label className="block text-sm font-bold mb-2 text-green-400 uppercase tracking-widest">
                                    [ Mission Name ]
                                </label>
                                <input
                                    className="w-full bg-transparent border border-green-500 p-3 text-lg focus:outline-none focus:border-green-300 focus:shadow-[0_0_10px_rgba(34,197,94,0.4)] transition-all placeholder-green-800"
                                    style={{ color: 'lime' }}
                                    placeholder="ENTER_NAME"
                                    value={formData.name || ''}
                                    onChange={e => setFormData({ ...formData, name: e.target.value })}
                                />
                            </div>
                            <div className="col-span-3">
                                <label className="block text-sm font-bold mb-2 text-green-400 uppercase tracking-widest">
                                    [ Cron Timing ]
                                </label>
                                <input
                                    className="w-full bg-transparent border border-green-500 p-3 text-lg font-mono focus:outline-none focus:border-green-300 focus:shadow-[0_0_10px_rgba(34,197,94,0.4)] transition-all placeholder-green-800"
                                    style={{ color: 'lime' }}
                                    placeholder="* * * * *"
                                    value={formData.cron_expression || ''}
                                    onChange={e => setFormData({ ...formData, cron_expression: e.target.value })}
                                />
                                <div className="text-[10px] uppercase opacity-50 mt-1 pl-2 text-right">Min Hour Day Month Week</div>
                            </div>
                        </div >

                        {/* Row 2: Core Intelligence */}
                        < div className="grid grid-cols-12 gap-6 flex-1 min-h-[300px]" >
                            <div className="col-span-4 flex flex-col">
                                <label className="block text-sm font-bold mb-2 text-green-400 uppercase tracking-widest">
                                    [ Briefing ]
                                </label>
                                <textarea
                                    className="w-full bg-transparent border border-green-500 p-3 text-sm focus:outline-none focus:border-green-300 h-full resize-none placeholder-green-800"
                                    style={{ color: 'lime' }}
                                    placeholder="Mission objectives..."
                                    value={formData.description || ''}
                                    onChange={e => setFormData({ ...formData, description: e.target.value })}
                                />
                            </div>
                            <div className="col-span-8 flex flex-col relative group">
                                <div className="absolute -left-[1px] top-8 bottom-8 w-[2px] bg-green-500/30"></div>
                                <label className="block text-sm font-bold mb-2 text-green-400 uppercase tracking-widest flex items-center gap-2">
                                    <span>[ Agent Intelligence Protocol ]</span>
                                    <span className="text-[10px] bg-green-900/40 px-2 py-0.5 border border-green-500/50">PRIMARY INSTRUCTION SET</span>
                                </label>
                                <textarea
                                    className="w-full bg-transparent border border-green-500 p-4 text-base font-mono focus:outline-none focus:border-green-300 focus:shadow-[0_0_15px_rgba(34,197,94,0.2)] h-full resize-none leading-relaxed placeholder-green-900"
                                    style={{ color: 'lime' }}
                                    placeholder="// Enter instructions for the Zero System..."
                                    value={formData.prompt || ''}
                                    onChange={e => setFormData({ ...formData, prompt: e.target.value })}
                                />
                            </div>
                        </div >

                        {/* Row 3: Execution Wrappers */}
                        < div className="grid grid-cols-2 gap-8 pt-4 border-t border-green-500/30" >
                            {/* Phase 1: Input */}
                            < div className="relative group" >
                                <label className="block text-sm font-bold mb-2 text-yellow-400 uppercase tracking-widest flex justify-between">
                                    <span>[ 01 // Pre-Flight Shell Command ]</span>
                                    <span className="text-[10px] bg-yellow-900/20 text-yellow-500 px-2 py-0.5">OPTIONAL</span>
                                </label>
                                <input
                                    className="w-full bg-transparent border border-yellow-500/50 p-3 text-sm font-mono focus:outline-none focus:border-yellow-400 focus:bg-yellow-900/10 transition-all placeholder-yellow-900"
                                    style={{ color: 'lime' }}
                                    placeholder="> Execute pre-processing script..."
                                    value={formData.input_command || ''}
                                    onChange={e => setFormData({ ...formData, input_command: e.target.value })}
                                />
                            </div >

                            {/* Phase 3: Follow-Up */}
                            < div className="relative group" >
                                <label className="block text-sm font-bold mb-2 text-blue-400 uppercase tracking-widest flex justify-between">
                                    <span>[ 03 // Post-Flight Shell Command ]</span>
                                    <span className="text-[10px] bg-blue-900/20 text-blue-500 px-2 py-0.5">OPTIONAL</span>
                                </label>
                                <input
                                    className="w-full bg-transparent border border-blue-500/50 p-3 text-sm font-mono focus:outline-none focus:border-blue-400 focus:bg-blue-900/10 transition-all placeholder-blue-900"
                                    style={{ color: 'lime' }}
                                    placeholder="> Execute post-processing clean up..."
                                    value={formData.follow_up_command || ''}
                                    onChange={e => setFormData({ ...formData, follow_up_command: e.target.value })}
                                />
                            </div >
                        </div >


                        {/* Validation Results Area */}
                        {
                            validationResult && (
                                <div className="mb-6 border-2 border-yellow-500 bg-black p-4 text-sm shadow-[0_0_20px_rgba(234,179,8,0.2)] animate-pulse-slow">
                                    <div className="font-bold text-yellow-400 text-lg mb-2 flex justify-between border-b border-yellow-500/50 pb-2">
                                        <span>// AI VALIDATION REPORT //</span>
                                        <span className={validationResult.isValid ? "text-green-500" : "text-red-500 blinking-text"}>
                                            {validationResult.isValid ? '[ STATUS: GREEN ]' : '[ STATUS: RED - ISSUES DETECTED ]'}
                                        </span>
                                    </div>
                                    <div className="text-yellow-200/90 mb-4 whitespace-pre-wrap font-mono leading-relaxed">
                                        {validationResult.analysis}
                                    </div>
                                    {!validationResult.isValid && validationResult.corrections && (
                                        <div className="w-full bg-yellow-500/20 text-yellow-500 border border-yellow-500 py-2 font-bold uppercase tracking-widest text-center text-xs"
                                            style={{ color: 'lime', border: 'solid 1px lime', backgroundColor: 'transparent', borderRadius: '4px', transition: 'all 0.3s ease' }}
                                            onMouseEnter={(e) => {
                                                e.currentTarget.style.backgroundColor = 'lime';
                                                e.currentTarget.style.color = 'black';
                                            }}
                                            onMouseLeave={(e) => {
                                                e.currentTarget.style.backgroundColor = 'transparent';
                                                e.currentTarget.style.color = 'lime';
                                            }}>
                                            Auto-Corrections Applied
                                        </div>
                                    )}
                                </div>
                            )
                        }

                        {/* Footer / Actions */}
                        <div className="flex gap-6 mt-auto pt-6 border-t-2 border-green-500/50">
                            {editingTask && (
                                <button
                                    onClick={handleDelete}
                                    disabled={loading}
                                    className="px-6 py-3 border border-red-500 text-red-500 hover:bg-red-500 hover:text-black font-bold uppercase tracking-widest transition-all cursor-pointer"
                                >
                                    [ Delete Mission ]
                                </button>
                            )}
                            <div className="flex-1"></div>
                            <button
                                onClick={handleValidate}
                                disabled={loading}
                                className="px-8 py-3 border border-blue-500 text-blue-400 hover:bg-blue-500 hover:text-black font-bold uppercase tracking-widest transition-all cursor-pointer"
                                style={{ color: 'lime', border: 'solid 1px lime', backgroundColor: 'transparent', borderRadius: '4px', transition: 'all 0.3s ease' }}
                                onMouseEnter={(e) => {
                                    e.currentTarget.style.backgroundColor = 'lime';
                                    e.currentTarget.style.color = 'black';
                                }}
                                onMouseLeave={(e) => {
                                    e.currentTarget.style.backgroundColor = 'transparent';
                                    e.currentTarget.style.color = 'lime';
                                }}
                            >
                                {loading ? 'ANALYZING...' : 'RUN SIMULATION / VALIDATE'}
                            </button>
                            <button
                                onClick={handleSave}
                                disabled={loading}
                                className="px-10 py-3 bg-green-600 text-black font-bold uppercase tracking-widest hover:bg-green-400 transition-colors shadow-[0_0_20px_rgba(34,197,94,0.6)] cursor-pointer"
                                style={{ color: 'lime', border: 'solid 1px lime', backgroundColor: 'transparent', borderRadius: '4px', transition: 'all 0.3s ease' }}
                                onMouseEnter={(e) => {
                                    e.currentTarget.style.backgroundColor = 'lime';
                                    e.currentTarget.style.color = 'black';
                                }}
                                onMouseLeave={(e) => {
                                    e.currentTarget.style.backgroundColor = 'transparent';
                                    e.currentTarget.style.color = 'lime';
                                }}
                            >
                                {loading ? 'COMMITTING...' : 'ENGAGE / SAVE'}
                            </button>
                        </div>
                    </div>
                </div>,
                document.body
            )}

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
            <div className="pointer-events-none absolute inset-0 bg-scanline opacity-10 z-0"></div>
        </div >
    );
}
