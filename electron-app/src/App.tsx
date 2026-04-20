import React, { useState, useEffect, useMemo } from 'react';
import { 
  MessageSquare, 
  Settings, 
  Send, 
  Plus, 
  ChevronRight, 
  Cpu, 
  Activity, 
  Globe, 
  Zap, 
  Search,
  Command,
  Cloud,
  Layers,
  ArrowRight
} from 'lucide-react';
import { Button } from './components/ui/button';
import { Input } from './components/ui/input';
import { Badge } from './components/ui/badge';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';

// Default to Local API
const DEFAULT_API = "http://127.0.0.1:4002";

interface Peer {
  peer_id: string;
  addr: string;
  latency_ms: number;
  health_status: string;
  last_audit: number;
  tag?: string;
  models: string[];
  metrics?: {
    cpu_percent: number;
    ram_percent: number;
    gpu_percent?: number;
  };
}

interface ChatMessage {
  role: 'user' | 'ai';
  text: string;
  ts: number;
}

export default function App() {
  const [selectedPeer, setSelectedPeer] = useState<Peer | null>(null);
  const [peers, setPeers] = useState<Peer[]>([]);
  const [apiUrl, setApiUrl] = useState(() => localStorage.getItem("chatit_api_url") || DEFAULT_API);
  const [apiKey, setApiKey] = useState(() => localStorage.getItem("chatit_api_key") || "");
  const [showSettings, setShowSettings] = useState(false);
  const [networkError, setNetworkError] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const fetchPeers = async () => {
    try {
      const res = await fetch(`${apiUrl}/providers`, {
        headers: { 'X-API-KEY': apiKey }
      });
      const data = await res.json();
      setPeers(data);
      setNetworkError(false);
      // Auto-select first peer if none selected
      if (!selectedPeer && data.length > 0) {
        setSelectedPeer(data[0]);
      }
    } catch (e) {
      setNetworkError(true);
    }
  };

  useEffect(() => {
    fetchPeers();
    const interval = setInterval(fetchPeers, 10000); // 10s refresh
    return () => clearInterval(interval);
  }, [apiUrl, apiKey]);

  const handleSend = async () => {
    if (!input.trim() || !selectedPeer) return;
    const userMsg = { role: 'user' as const, text: input, ts: Date.now() };
    setMessages(prev => [...prev, userMsg]);
    setInput("");
    setSending(true);

    try {
      const res = await fetch(`${apiUrl}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-API-KEY': apiKey },
        body: JSON.stringify({ 
          provider_id: selectedPeer.peer_id, 
          prompt: userMsg.text, 
          model: selectedPeer.models[0] 
        })
      });
      const data = await res.json();
      if (data.status === 'ok') {
        setMessages(prev => [...prev, { role: 'ai', text: data.result.text, ts: Date.now() }]);
      } else {
        setMessages(prev => [...prev, { role: 'ai', text: `Error: ${data.message}`, ts: Date.now() }]);
      }
    } catch (e) {
      setMessages(prev => [...prev, { role: 'ai', text: "Connection to peer failed.", ts: Date.now() }]);
    } finally {
      setSending(false);
    }
  };

  const filteredPeers = useMemo(() => {
    return peers.filter(p => 
      p.models[0]?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.peer_id.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [peers, searchQuery]);

  return (
    <div className="flex h-screen bg-[#fafafa] text-[#09090b] font-sans selection:bg-black/5 overflow-hidden">
      {/* Navigation Sidebar */}
      <aside className="w-[320px] border-r border-[#e4e4e7] bg-white flex flex-col z-50">
        <div className="p-6 pb-2">
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-black flex items-center justify-center">
                <Cloud className="w-5 h-5 text-white" />
              </div>
              <span className="font-bold text-lg tracking-tight">Chatit.cloud</span>
            </div>
            <Button variant="ghost" size="icon" className="rounded-full w-8 h-8" onClick={() => setShowSettings(true)}>
              <Settings className="w-4 h-4 opacity-40 hover:opacity-100 transition-opacity" />
            </Button>
          </div>

          <div className="relative group mb-6">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 opacity-30 group-focus-within:opacity-100 transition-opacity" />
            <Input 
              placeholder="Route to model..." 
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="pl-9 h-10 bg-transparent border-[#e4e4e7] rounded-xl text-sm focus-visible:ring-0 focus-visible:border-black/20 transition-all"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-1 space-y-0.5 custom-scrollbar">
          <div className="px-5 mb-2">
            <span className="text-[10px] font-bold uppercase tracking-widest opacity-30">Active Routes</span>
          </div>
          {filteredPeers.map((peer) => (
            <button
              key={peer.peer_id}
              onClick={() => {
                setSelectedPeer(peer);
                setMessages([]); // Clear chat for new model for focus
              }}
              className={cn(
                "w-full flex items-center gap-3 px-5 py-3.5 transition-all relative group",
                selectedPeer?.peer_id === peer.peer_id 
                  ? "bg-black/5" 
                  : "hover:bg-black/[0.02]"
              )}
            >
              {selectedPeer?.peer_id === peer.peer_id && (
                <motion.div layoutId="active-indicator" className="absolute left-0 w-1.5 h-6 bg-black rounded-r-full" />
              )}
              <div className={cn(
                "w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border transition-all",
                selectedPeer?.peer_id === peer.peer_id ? "bg-white border-black/10 shadow-sm" : "bg-black/[0.02] border-transparent"
              )}>
                <Layers className={cn("w-5 h-5", selectedPeer?.peer_id === peer.peer_id ? "text-black" : "text-black/20")} />
              </div>
              <div className="flex flex-col items-start overflow-hidden text-left">
                <span className="text-sm font-semibold truncate w-full group-hover:translate-x-1 transition-transform">{peer.models[0] || "General Model"}</span>
                <span className="text-[10px] font-mono opacity-40 uppercase tracking-tighter">
                  {peer.latency_ms.toFixed(0)}ms · {peer.peer_id.slice(0, 8)}
                </span>
              </div>
            </button>
          ))}
          {filteredPeers.length === 0 && !networkError && (
            <div className="p-8 text-center opacity-30 mt-10">
              <Globe className="w-10 h-10 mx-auto mb-4" />
              <p className="text-xs font-medium">Scanning for available model endpoints...</p>
            </div>
          )}
          {networkError && (
            <div className="p-8 text-center text-red-500/50 mt-10">
              <Zap className="w-10 h-10 mx-auto mb-4" />
              <p className="text-xs font-medium uppercase tracking-widest">Protocol Sync Failure</p>
            </div>
          )}
        </div>

        <div className="p-6 border-t border-[#e4e4e7] bg-white/[0.01]">
          <div className="flex items-center gap-3">
            <div className={cn("w-2 h-2 rounded-full", networkError ? "bg-red-500" : "bg-green-500")} />
            <span className="text-[10px] font-bold uppercase tracking-widest opacity-40">
              {networkError ? "Link Offline" : "System Synchronized"}
            </span>
          </div>
        </div>
      </aside>

      {/* Main Workspace */}
      <main className="flex-1 flex flex-col relative bg-white overflow-hidden">
        {/* Workspace Header */}
        <header className="h-20 border-b border-[#e4e4e7] flex items-center justify-between px-10 bg-white/50 backdrop-blur-xl z-20">
          <div className="flex items-center gap-4">
            <div className="flex flex-col">
              <h2 className="font-bold text-lg leading-none mb-1">{selectedPeer?.models[0] || "Select specialized model"}</h2>
              <div className="flex items-center gap-2 opacity-30">
                <Command className="w-3 h-3" />
                <span className="text-[10px] font-bold uppercase tracking-widest">Routing via {selectedPeer?.peer_id.slice(0, 16)}</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-6">
            <div className="flex items-center gap-4 py-2 px-4 rounded-full bg-black/[0.02] border border-black/[0.05]">
              <div className="flex flex-col items-center">
                <span className="text-[9px] font-bold opacity-30 uppercase tracking-widest">Compute</span>
                <span className="text-xs font-mono font-bold">{(selectedPeer?.metrics?.cpu_percent || 0).toFixed(0)}%</span>
              </div>
              <div className="w-px h-6 bg-black/10" />
              <div className="flex flex-col items-center">
                <span className="text-[9px] font-bold opacity-30 uppercase tracking-widest">Memory</span>
                <span className="text-xs font-mono font-bold">{(selectedPeer?.metrics?.ram_percent || 0).toFixed(0)}%</span>
              </div>
            </div>
            <Badge className="bg-black text-white hover:bg-black rounded-full px-3 py-1 text-[10px] uppercase font-bold tracking-widest h-8 flex items-center">Secure</Badge>
          </div>
        </header>

        {/* Messaging Interface */}
        <div className="flex-1 relative overflow-hidden flex flex-col">
          <div className="flex-1 overflow-y-auto px-10 py-10 space-y-12 scroll-smooth custom-scrollbar">
            {messages.length === 0 && (
              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="h-full flex flex-col items-center justify-center text-center max-w-lg mx-auto"
              >
                <div className="w-24 h-24 rounded-[40px] bg-black shadow-2xl flex items-center justify-center mb-10">
                  <Cloud className="w-12 h-12 text-white" />
                </div>
                <h1 className="text-4xl font-black tracking-tighter mb-4">Chatit.cloud</h1>
                <p className="text-base text-black/40 leading-relaxed">
                  Decentralized routing initialized. Connect with private models across the global mesh network securely.
                </p>
                <div className="mt-12 flex flex-wrap justify-center gap-2">
                  <QuickCommand label="Summarize logs" />
                  <QuickCommand label="Network health" />
                  <QuickCommand label="Inference debug" />
                </div>
              </motion.div>
            )}

            {messages.map((m, i) => (
              <motion.div 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                key={i} 
                className={cn("flex w-full", m.role === 'user' ? 'justify-end' : 'justify-start')}
              >
                <div className={cn(
                  "max-w-2xl px-0 py-0",
                  m.role === 'user' ? "text-right" : "text-left"
                )}>
                  <div className="flex items-center gap-2 mb-2 opacity-30 uppercase text-[10px] font-bold tracking-widest">
                    {m.role === 'user' ? 'Local Operator' : (selectedPeer?.models[0] || 'Remote Intelligence')}
                    <span className="w-1 h-1 rounded-full bg-black/20" />
                    {new Date(m.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </div>
                  <div className={cn(
                    "text-xl leading-relaxed tracking-tight font-medium",
                    m.role === 'user' ? "text-black" : "text-black/60"
                  )}>
                    {m.text}
                  </div>
                </div>
              </motion.div>
            ))}
            
            {sending && (
              <div className="flex justify-start">
                 <div className="flex items-center gap-1 opacity-20">
                    <div className="w-1.5 h-1.5 bg-black rounded-full animate-bounce [animation-delay:-0.3s]" />
                    <div className="w-1.5 h-1.5 bg-black rounded-full animate-bounce [animation-delay:-0.15s]" />
                    <div className="w-1.5 h-1.5 bg-black rounded-full animate-bounce" />
                 </div>
              </div>
            )}
          </div>

          {/* Unified Input Overlay */}
          <div className="px-10 pb-10">
            <div className="max-w-4xl mx-auto relative group">
              <div className="absolute inset-x-0 bottom-full h-24 bg-gradient-to-t from-white to-transparent pointer-events-none" />
              <form 
                className="relative flex items-center"
                onSubmit={(e) => { e.preventDefault(); handleSend(); }}
              >
                <div className="absolute left-6 text-black/20">
                  <Zap className="w-5 h-5" />
                </div>
                <Input 
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  disabled={sending || !selectedPeer}
                  placeholder={selectedPeer ? `Message ${selectedPeer.models[0]}...` : "Select a route to begin..."}
                  className="h-20 bg-[#f4f4f5] border-transparent rounded-[32px] pl-16 pr-24 text-lg font-medium focus-visible:ring-2 focus-visible:ring-black/5 focus-visible:border-black/5 transition-all shadow-sm"
                />
                <button 
                  type="submit" 
                  disabled={sending || !input}
                  className="absolute right-3 w-14 h-14 rounded-full bg-black text-white hover:scale-105 active:scale-95 disabled:opacity-5 transition-all flex items-center justify-center"
                >
                  <ArrowRight className="w-6 h-6" />
                </button>
              </form>
            </div>
          </div>
        </div>
      </main>

      {/* Modern Settings Modal */}
      <AnimatePresence>
        {showSettings && (
          <div className="fixed inset-0 bg-white/80 backdrop-blur-md z-[100] flex items-center justify-center p-6">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              className="w-full max-w-md bg-white border border-[#e4e4e7] rounded-[40px] overflow-hidden shadow-2xl p-10"
            >
              <div className="flex justify-between items-center mb-10">
                <div className="flex items-center gap-3">
                  <div className="w-6 h-6 rounded-full bg-black/5 flex items-center justify-center">
                    <Settings className="w-3 h-3 text-black" />
                  </div>
                  <h3 className="text-sm font-bold uppercase tracking-[0.2em]">Route Configuration</h3>
                </div>
                <Button variant="ghost" size="icon" onClick={() => setShowSettings(false)} className="rounded-full w-10 h-10 hover:bg-black/5 text-black">
                   <ChevronRight className="w-5 h-5" />
                </Button>
              </div>
              
              <div className="space-y-8">
                <div className="space-y-3">
                  <label className="text-[10px] font-bold uppercase tracking-widest opacity-30">Protocol Endpoint</label>
                  <Input 
                    value={apiUrl}
                    onChange={e => { setApiUrl(e.target.value); localStorage.setItem("chatit_api_url", e.target.value); }}
                    className="h-14 bg-[#f4f4f5] border-transparent rounded-2xl px-6 font-mono text-sm"
                  />
                </div>
                <div className="space-y-3">
                  <label className="text-[10px] font-bold uppercase tracking-widest opacity-30">Authentication Key</label>
                  <Input 
                    type="password"
                    value={apiKey}
                    onChange={e => { setApiKey(e.target.value); localStorage.setItem("chatit_api_key", e.target.value); }}
                    className="h-14 bg-[#f4f4f5] border-transparent rounded-2xl px-6 font-mono text-sm"
                    placeholder="X-API-KEY"
                  />
                </div>
                
                <div className="pt-6">
                   <Button onClick={() => setShowSettings(false)} className="w-full h-16 rounded-[24px] bg-black text-white font-bold text-base hover:bg-black/90 active:scale-95 transition-all">Synchronize Configuration</Button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

function QuickCommand({ label }: { label: string }) {
  return (
    <button className="px-5 py-2.5 rounded-full border border-black/[0.08] hover:border-black/20 hover:bg-black/[0.01] transition-all text-sm font-medium opacity-60 hover:opacity-100">
      {label}
    </button>
  );
}
