"use client"
import { useState, useEffect } from 'react';
import config from '../config';

interface Host {
    id: number;
    hostname: string;
    ip_address: string;
    status: string;
    description: string;
    last_seen: string;
}

interface Issue {
    id: number;
    title: string;
    description: string;
    status: string;
}

export default function HostManager() {
    const [hosts, setHosts] = useState<Host[]>([]);
    const [issues, setIssues] = useState<Issue[]>([]);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingHost, setEditingHost] = useState<Host | null>(null);
    const [formData, setFormData] = useState<Partial<Host>>({});
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        fetchHosts();
        fetchIssues();
        const interval = setInterval(() => {
            fetchHosts();
            fetchIssues();
        }, 5000);
        return () => clearInterval(interval);
    }, []);

    const fetchHosts = async () => {
        try {
            const res = await fetch(`${config.API_BASE_URL}/hosts`);
            if (res.ok) setHosts(await res.json());
        } catch (e) {
            console.error(e);
        }
    };

    const fetchIssues = async () => {
        try {
            const res = await fetch(`${config.API_BASE_URL}/issues`);
            if (res.ok) setIssues(await res.json());
        } catch (e) {
            console.error(e);
        }
    };

    const handleSave = async () => {
        setLoading(true);
        const url = editingHost
            ? `${config.API_BASE_URL}/hosts/${editingHost.id}`
            : `${config.API_BASE_URL}/hosts`;
        const method = editingHost ? 'PUT' : 'POST';

        try {
            const res = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formData)
            });
            if (res.ok) {
                setIsModalOpen(false);
                fetchHosts();
            }
        } catch (e) {
            alert("Failed to save host");
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async () => {
        if (!editingHost || !confirm("Delete this host?")) return;
        setLoading(true);
        try {
            await fetch(`${config.API_BASE_URL}/hosts/${editingHost.id}`, { method: 'DELETE' });
            setIsModalOpen(false);
            fetchHosts();
        } finally {
            setLoading(false);
        }
    };

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!e.target.files?.[0]) return;
        const form = new FormData();
        form.append('file', e.target.files[0]);

        try {
            const res = await fetch(`${config.API_BASE_URL}/hosts/upload-file`, {
                method: 'POST',
                body: form
            });
            if (res.ok) {
                alert("Hosts imported successfully");
                fetchHosts();
            } else {
                alert("Upload failed");
            }
        } catch (e) {
            console.error(e);
            alert("Upload error");
        }
    };

    /**
     * Determine Issue Status Circle Color
     * - Red: Critical/Open issues matching hostname
     * - Green: No issues
     */
    const getIssueStatusColor = (hostname: string) => {
        const hasOpenIssue = issues.some(i => 
            i.status === 'OPEN' && 
            (i.title.toLowerCase().includes(hostname.toLowerCase()) || 
             i.description.toLowerCase().includes(hostname.toLowerCase()))
        );
        return hasOpenIssue ? 'bg-red-500' : 'bg-green-500';
    };

    return (
        <div className="h-full border-2 border-green-500/50 bg-black/80 p-6 font-mono text-green-500 flex flex-col clip-path-panel relative">
             <div className="flex justify-between items-center mb-4 border-b border-green-500 pb-2">
                <h2 className="text-xl font-bold">NETWORK HOSTS</h2>
                <div className="flex gap-2">
                    <label className="bg-green-500/10 hover:bg-green-500/20 text-green-400 border border-green-500 px-3 py-1 text-xs font-bold uppercase tracking-wider transition-colors cursor-pointer flex items-center">
                        Upload
                        <input type="file" className="hidden" onChange={handleFileUpload} />
                    </label>
                    <button
                        onClick={() => {
                            setEditingHost(null);
                            setFormData({ hostname: '', ip_address: '', status: 'UNKNOWN' });
                            setIsModalOpen(true);
                        }}
                        className="bg-green-500/20 hover:bg-green-500/40 text-green-400 border border-green-500 px-3 py-1 text-xs font-bold uppercase tracking-wider transition-colors"
                    >
                        + Add Host
                    </button>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto space-y-2 custom-scrollbar text-xs px-2 min-h-0 pb-10">
                {hosts.map(host => (
                    <div 
                        key={host.id}
                        onClick={() => {
                            setEditingHost(host);
                            setFormData(host);
                            setIsModalOpen(true);
                        }}
                        className="flex items-center justify-between border border-green-500/30 p-3 hover:bg-green-900/10 transition-colors cursor-pointer group"
                    >
                        <div className="flex flex-col">
                            <span className="font-bold text-green-300 text-sm">{host.hostname}</span>
                            <span className="opacity-70">{host.ip_address}</span>
                        </div>
                        
                        <div className="flex gap-4 items-center">
                            {/* Circle 1: Online Status using specific logic (e.g. check status field) */}
                            <div className="flex flex-col items-center gap-1">
                                <div className={`w-3 h-3 rounded-full ${host.status === 'ONLINE' ? 'bg-green-500 shadow-[0_0_8px_lime]' : 'bg-gray-600'}`}></div>
                                <span className="text-[9px] opacity-50">NET</span>
                            </div>

                            {/* Circle 2: Issue Status */}
                            <div className="flex flex-col items-center gap-1">
                                <div className={`w-3 h-3 rounded-full ${getIssueStatusColor(host.hostname)} shadow-[0_0_8px_currentColor]`}></div>
                                <span className="text-[9px] opacity-50">ERR</span>
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            {/* Modal */}
            {isModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
                    <div className="w-full max-w-lg border-2 border-green-500 bg-black p-6 shadow-[0_0_40px_rgba(34,197,94,0.3)]">
                        <div className="text-xl font-bold text-green-400 mb-4 border-b border-green-500/50 pb-2">
                            {editingHost ? `EDIT HOST: ${editingHost.hostname}` : 'NEW HOST CONNECTION'}
                        </div>
                        
                        <div className="space-y-4 mb-6">
                            <div>
                                <label className="block text-xs font-bold mb-1">HOSTNAME</label>
                                <input 
                                    className="w-full bg-green-900/10 border border-green-500 p-2 text-green-300 focus:outline-none focus:border-green-400"
                                    value={formData.hostname || ''} 
                                    onChange={e => setFormData({...formData, hostname: e.target.value})}
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold mb-1">IP ADDRESS</label>
                                <input 
                                    className="w-full bg-green-900/10 border border-green-500 p-2 text-green-300 focus:outline-none focus:border-green-400"
                                    value={formData.ip_address || ''} 
                                    onChange={e => setFormData({...formData, ip_address: e.target.value})}
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold mb-1">STATUS (ONLINE/OFFLINE/UNKNOWN)</label>
                                <select 
                                    className="w-full bg-green-900/10 border border-green-500 p-2 text-green-300 focus:outline-none"
                                    value={formData.status || 'UNKNOWN'}
                                    onChange={e => setFormData({...formData, status: e.target.value})}
                                >
                                    <option value="UNKNOWN">UNKNOWN</option>
                                    <option value="ONLINE">ONLINE</option>
                                    <option value="OFFLINE">OFFLINE</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-xs font-bold mb-1">DESCRIPTION</label>
                                <textarea 
                                    className="w-full bg-green-900/10 border border-green-500 p-2 text-green-300 focus:outline-none h-20"
                                    value={formData.description || ''} 
                                    onChange={e => setFormData({...formData, description: e.target.value})}
                                />
                            </div>
                        </div>

                        <div className="flex justify-between">
                            {editingHost && (
                                <button onClick={handleDelete} className="text-red-500 border border-red-500 px-4 py-2 hover:bg-red-900/20 text-xs font-bold">
                                    DELETE
                                </button>
                            )}
                            <div className="flex gap-2 ml-auto">
                                <button onClick={() => setIsModalOpen(false)} className="text-green-600 px-4 py-2 text-xs font-bold hover:text-green-400">Cancel</button>
                                <button onClick={handleSave} className="bg-green-600 text-black px-6 py-2 text-xs font-bold hover:bg-green-500">
                                    SAVE
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
             {/* Scanline overlay */}
             <div className="pointer-events-none absolute inset-0 bg-scanline opacity-10"></div>
        </div>
    );
}
