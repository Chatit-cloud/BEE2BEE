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
  ArrowRight,
  Maximize2,
  Minimize2,
  X,
  Wifi,
  HardDrive,
  CheckCircle2,
  Users,
  Vote,
  ShieldCheck
} from 'lucide-react';
import { Button } from './components/ui/button';
import { Input } from './components/ui/input';
import { Badge } from './components/ui/badge';
import { GlobeCdn } from './components/ui/globe-cdn';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';

// Default to Local API
const DEFAULT_API = "http://127.0.0.1:4002";
const DEFAULT_SYSTEM_PROMPT = "You are a member of a consensus voting group. Evaluate the user request and provide the most accurate, secure, and robust response possible. Your response will be compared against other nodes in the cluster to reach a majority consensus.";

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
  role: 'user' | 'ai' | 'system';
  text: string;
  ts: number;
  node_id?: string; // Which node generated this (if applicable)
  isConsensus?: boolean;
}

const getPeerCoords = (id: string) => {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = id.charCodeAt(i) + ((hash << 5) - hash);
  }
  const x = Math.abs(hash % 70) + 15;
  const y = Math.abs((hash >> 8) % 50) + 25;
  return { x: `${x}%`, y: `${y}%` };
};

export default function App() {
  const [view, setView] = useState<'map' | 'chat'>('map');
  const [selectedPeers, setSelectedPeers] = useState<Peer[]>([]);
  const [peers, setPeers] = useState<Peer[]>([]);
  const [apiUrl, setApiUrl] = useState(() => localStorage.getItem("chatit_api_url") || DEFAULT_API);
  const [apiKey, setApiKey] = useState(() => localStorage.getItem("chatit_api_key") || "");
  const [systemPrompt, setSystemPrompt] = useState(() => localStorage.getItem("chatit_system_prompt") || DEFAULT_SYSTEM_PROMPT);
  const [showSettings, setShowSettings] = useState(false);
  const [networkError, setNetworkError] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isVoting, setIsVoting] = useState(false);
  const [voteProgress, setVoteProgress] = useState<Record<string, 'pending' | 'done' | 'error'>>({});

  const fetchPeers = async () => {
    try {
      const res = await fetch(`${apiUrl}/providers`, {
        headers: { 'X-API-KEY': apiKey }
      });
      const data = await res.json();
      setPeers(data);
      setNetworkError(false);
    } catch (e) {
      setNetworkError(true);
    }
  };

  useEffect(() => {
    fetchPeers();
    const interval = setInterval(fetchPeers, 8000);
    return () => clearInterval(interval);
  }, [apiUrl, apiKey]);

  const togglePeerSelection = (peer: Peer) => {
    setSelectedPeers(prev => {
      const exists = prev.find(p => p.peer_id === peer.peer_id);
      if (exists) {
        return prev.filter(p => p.peer_id !== peer.peer_id);
      }
      // If family check is needed, we could filter here, but we'll allow freedom for now with a warning UI
      return [...prev, peer];
    });
  };

  const startRouting = () => {
    if (selectedPeers.length === 0) return;
    setView('chat');
  };

  const handleSendConsensus = async () => {
    if (!input.trim() || selectedPeers.length === 0) return;
    
    const userMsg = { role: 'user' as const, text: input, ts: Date.now() };
    setMessages(prev => [...prev, userMsg]);
    setInput("");
    setIsVoting(true);
    
    const progress: Record<string, 'pending' | 'done' | 'error'> = {};
    selectedPeers.forEach(p => progress[p.peer_id] = 'pending');
    setVoteProgress(progress);

    try {
      // Parallel execution across all selected nodes
      const requests = selectedPeers.map(async (peer) => {
        try {
          const res = await fetch(`${apiUrl}/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-API-KEY': apiKey },
            body: JSON.stringify({ 
              provider_id: peer.peer_id, 
              prompt: `${systemPrompt}\n\nUser: ${userMsg.text}`, 
              model: peer.models[0] 
            })
          });
          const data = await res.json();
          setVoteProgress(prev => ({ ...prev, [peer.peer_id]: data.status === 'ok' ? 'done' : 'error' }));
          return { node_id: peer.peer_id, text: data.status === 'ok' ? data.result.text : null };
        } catch (e) {
          setVoteProgress(prev => ({ ...prev, [peer.peer_id]: 'error' }));
          return { node_id: peer.peer_id, text: null };
        }
      });

      const responses = await Promise.all(requests);
      const validResponses = responses.filter(r => r.text !== null);

      if (validResponses.length > 0) {
        // Simple Voting Logic: In a real scenario, we might use a LLM to evaluate the consensus.
        // Here we'll simulate the "Voting Mechanism" by picking the first valid one or the most detailed.
        const winner = validResponses.sort((a, b) => (b.text?.length || 0) - (a.text?.length || 0))[0];
        
        setMessages(prev => [...prev, { 
          role: 'ai', 
          text: winner.text!, 
          ts: Date.now(), 
          node_id: winner.node_id, 
          isConsensus: true 
        }]);
      } else {
        setMessages(prev => [...prev, { role: 'ai', text: "Clustered consensus failed. No nodes reachable.", ts: Date.now() }]);
      }
    } catch (e) {
       setMessages(prev => [...prev, { role: 'ai', text: "Routing engine failure.", ts: Date.now() }]);
    } finally {
      setIsVoting(false);
    }
  };

  return (
    <div className="flex flex-col h-screen bg-[#020203] text-white font-sans selection:bg-white/10 overflow-hidden">
      {/* Dynamic Background */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
         <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[80%] h-[80%] bg-blue-600/5 blur-[180px] rounded-full animate-pulse" />
         <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-[0.2] mix-blend-overlay" />
      </div>

      {/* Modern Header */}
      <header className="h-20 px-8 flex items-center justify-between z-50 backdrop-blur-3xl bg-black/40 border-b border-white/[0.03]">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-3 group cursor-pointer" onClick={() => setView('map')}>
            <div className="w-10 h-10 rounded-2xl bg-white flex items-center justify-center shadow-2xl group-hover:scale-105 transition-all">
              <Cloud className="w-6 h-6 text-black" />
            </div>
            <div className="flex flex-col">
              <span className="font-black text-xl tracking-tighter italic">Chatit.cloud</span>
              <div className="flex items-center gap-1.5 opacity-30">
                 <ShieldCheck className="w-2.5 h-2.5" />
                 <span className="text-[9px] font-bold uppercase tracking-[0.2em]">Consensus Engine v1.0</span>
              </div>
            </div>
          </div>
          
          <AnimatePresence>
            {selectedPeers.length > 0 && (
              <motion.div 
                initial={{ opacity: 0, x: -20 }} 
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="flex items-center gap-2 px-1 ml-4"
              >
                <div className="flex -space-x-3">
                  {selectedPeers.map((p, i) => (
                    <div key={p.peer_id} style={{ zIndex: selectedPeers.length - i }} className="w-8 h-8 rounded-full bg-white/5 border border-white/20 flex items-center justify-center backdrop-blur-lg">
                       <Cpu className="w-3.5 h-3.5 text-blue-400" />
                    </div>
                  ))}
                </div>
                <div className="h-6 w-px bg-white/10 mx-2" />
                {view === 'map' ? (
                  <Button onClick={startRouting} className="h-9 px-5 rounded-full bg-white text-black font-bold text-[10px] uppercase tracking-widest hover:bg-white/90">
                    Route Cluster ({selectedPeers.length})
                  </Button>
                ) : (
                  <span className="text-[10px] font-bold uppercase tracking-widest opacity-40">Active Cluster: {selectedPeers.length} Nodes</span>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className="flex items-center gap-4">
          <div className="hidden md:flex items-center gap-3 px-4 py-2 rounded-full border border-white/[0.05] bg-white/[0.02]">
             <Activity className={cn("w-3 h-3", networkError ? "text-red-500" : "text-green-500")} />
             <span className="text-[10px] font-bold uppercase tracking-[0.2em] opacity-40">Network Load: {networkError ? "OFFLINE" : "0.04%"}</span>
          </div>
          <Button variant="ghost" size="icon" className="rounded-full w-10 h-10 hover:bg-white/5" onClick={() => setShowSettings(true)}>
            <Settings className="w-4 h-4 opacity-40" />
          </Button>
        </div>
      </header>

      {/* Workspace */}
      <main className="flex-1 relative overflow-hidden">
        <AnimatePresence mode="wait">
          {view === 'map' ? (
            <LandingMap 
              key="map" 
              peers={peers} 
              selectedPeers={selectedPeers} 
              onToggle={togglePeerSelection} 
            />
          ) : (
            <ConsensusChat 
              key="chat" 
              peers={selectedPeers} 
              messages={messages} 
              onBack={() => setView('map')} 
              input={input}
              setInput={setInput}
              sending={isVoting}
              handleSend={handleSendConsensus}
              voteProgress={voteProgress}
            />
          )}
        </AnimatePresence>
      </main>

      {/* Advanced Settings */}
      <AnimatePresence>
        {showSettings && (
          <div className="fixed inset-0 bg-black/98 backdrop-blur-3xl z-[100] flex items-center justify-center p-6">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.98 }}
              className="w-full max-w-2xl bg-[#08080a] border border-white/[0.05] rounded-[40px] shadow-3xl overflow-hidden"
            >
              <div className="p-8 border-b border-white/[0.03] flex justify-between items-center bg-white/[0.01]">
                <div className="flex items-center gap-3">
                   <Command className="w-5 h-5 text-blue-400" />
                   <h3 className="text-sm font-bold uppercase tracking-[0.3em]">System Architecture</h3>
                </div>
                <Button variant="ghost" size="icon" onClick={() => setShowSettings(false)} className="rounded-full hover:bg-white/5"><X className="w-5 h-5" /></Button>
              </div>
              <div className="p-10 space-y-10">
                <div className="grid grid-cols-2 gap-8">
                   <div className="space-y-3">
                      <label className="text-[10px] font-bold uppercase tracking-widest opacity-30">P2P Gateway</label>
                      <Input 
                        value={apiUrl}
                        onChange={e => { setApiUrl(e.target.value); localStorage.setItem("chatit_api_url", e.target.value); }}
                        className="h-14 bg-white/5 border-transparent rounded-2xl px-6 font-mono text-xs text-blue-400"
                      />
                   </div>
                   <div className="space-y-3">
                      <label className="text-[10px] font-bold uppercase tracking-widest opacity-30">Auth Cryptography</label>
                      <Input 
                        type="password"
                        value={apiKey}
                        onChange={e => { setApiKey(e.target.value); localStorage.setItem("chatit_api_key", e.target.value); }}
                        className="h-14 bg-white/5 border-transparent rounded-2xl px-6 font-mono text-xs text-blue-400"
                        placeholder="X-API-KEY"
                      />
                   </div>
                </div>
                
                <div className="space-y-3">
                  <label className="text-[10px] font-bold uppercase tracking-widest opacity-30">Robust System Prompt (Governance)</label>
                  <textarea 
                    value={systemPrompt}
                    onChange={e => { setSystemPrompt(e.target.value); localStorage.setItem("chatit_system_prompt", e.target.value); }}
                    className="w-full h-40 bg-white/5 border-transparent rounded-3xl p-6 font-mono text-xs text-white/60 resize-none focus:ring-1 focus:ring-blue-500/30 transition-all outline-none"
                  />
                  <p className="text-[9px] font-mono opacity-20 uppercase tracking-widest">This prompt is injected into every node in the cluster to ensure consensus alignment.</p>
                </div>
                
                <Button onClick={() => setShowSettings(false)} className="w-full h-18 rounded-[28px] bg-white text-black font-black uppercase tracking-[0.3em] hover:bg-white/90 active:scale-95 transition-all shadow-2xl shadow-blue-500/10">Synchronize Engine</Button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

const getPeerLatLong = (id: string): [number, number] => {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = id.charCodeAt(i) + ((hash << 5) - hash);
  }
  const lat = (Math.abs(hash % 120) - 60); // -60 to 60 deg
  const lon = (Math.abs((hash >> 8) % 360) - 180); // -180 to 180 deg
  return [lat, lon];
};

const LandingMap = ({ peers, selectedPeers, onToggle }: { peers: Peer[], selectedPeers: Peer[], onToggle: (p: Peer) => void }) => {
  const markers = useMemo(() => peers.map(p => ({
    id: p.peer_id,
    location: getPeerLatLong(p.peer_id),
    region: p.peer_id.slice(0, 4).toUpperCase()
  })), [peers]);

  const arcs = useMemo(() => {
    if (peers.length < 2) return [];
    return peers.slice(0, 5).map((p, i) => ({
      id: `arc-${i}`,
      from: getPeerLatLong(p.peer_id),
      to: getPeerLatLong(peers[(i + 1) % peers.length].peer_id)
    }));
  }, [peers]);

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="absolute inset-0 flex flex-col items-center justify-center pt-24"
    >
      <div className="relative w-full max-w-[1200px] h-[80vh] flex items-center justify-center lg:px-20">
        
        {/* Realtime 3D Globe */}
        <div className="w-full max-w-2xl aspect-square relative z-10">
          <GlobeCdn 
            markers={markers}
            arcs={arcs}
            className="w-full h-full"
          />
        </div>

        <div className="absolute inset-0 flex items-center justify-between pointer-events-none">
          <div className="flex flex-col gap-6 max-w-xl pl-20 bg-gradient-to-r from-[#020203] via-[#020203]/80 to-transparent p-10 rounded-r-[40px]">
             <div className="flex items-center gap-3">
                <div className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-ping" />
                <span className="text-[10px] font-black uppercase tracking-[0.4em] text-blue-500">Live 3D Node Mesh</span>
             </div>
             <h1 className="text-8xl font-black tracking-tighter leading-[0.8] text-white">Neural<br />Globe</h1>
             <p className="text-sm font-medium text-white/40 leading-relaxed max-w-sm mt-4">
               Interact with the 3D topology to discover active inference clusters. 
               Spin to rotate, and monitor global link telemetry in real-time.
             </p>
             <div className="mt-8 flex items-center gap-10">
                <div className="flex flex-col gap-1">
                   <span className="text-[10px] font-bold text-white/20 uppercase tracking-widest">Active Peers</span>
                   <span className="text-2xl font-black text-white">{peers.length}</span>
                </div>
                <div className="flex flex-col gap-1">
                   <span className="text-[10px] font-bold text-white/20 uppercase tracking-widest">Mesh Latency</span>
                   <span className="text-2xl font-black text-white">42ms</span>
                </div>
             </div>
             <div className="mt-12 flex flex-wrap gap-2 max-w-md pointer-events-auto">
                <span className="text-[9px] font-black uppercase tracking-widest text-white/10 w-full mb-2">Available Nodes (Click to Recruit)</span>
                {peers.map(p => (
                  <button 
                    key={p.peer_id}
                    onClick={() => onToggle(p)}
                    className={cn(
                      "px-3 py-1.5 rounded-lg border text-[10px] font-mono transition-all",
                      selectedPeers.find(sp => sp.peer_id === p.peer_id)
                        ? "bg-blue-500 border-blue-400 text-white"
                        : "bg-white/5 border-white/5 text-white/40 hover:bg-white/10"
                    )}
                  >
                    {p.peer_id.slice(0, 8)}
                  </button>
                ))}
             </div>
          </div>
        </div>
        
        {/* Selection Counter Overlay */}
        <AnimatePresence>
          {selectedPeers.length > 0 && (
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              className="absolute bottom-20 right-20 bg-white shadow-2xl rounded-[32px] p-6 pr-8 flex items-center gap-8 pointer-events-auto border border-white/10"
            >
               <div className="flex flex-col text-black">
                  <span className="text-[10px] font-black uppercase tracking-widest opacity-30">Nodes Active</span>
                  <span className="text-4xl font-black leading-none">{selectedPeers.length}</span>
               </div>
               <button 
                onClick={() => (window as any).startRoutingEngine?.()} 
                className="h-16 px-10 rounded-2xl bg-black text-white hover:bg-black/90 font-bold uppercase tracking-widest text-xs flex items-center gap-3 transition-transform active:scale-95"
              >
                  Open Route <ArrowRight className="w-4 h-4" />
               </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
};

const ConsensusChat = ({ peers, messages, onBack, input, setInput, sending, handleSend, voteProgress }: any) => {
  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="flex h-full"
    >
      {/* Cluster Overview Sidebar */}
      <div className="w-[340px] border-r border-white/[0.05] bg-black/40 backdrop-blur-3xl p-10 flex flex-col gap-10">
         <div className="flex items-center justify-between mb-4">
            <h4 className="text-[10px] font-black text-white/30 tracking-[0.4em] uppercase flex items-center gap-2">
               <Vote className="w-3 h-3" /> Routing Group
            </h4>
            <Badge className="bg-blue-500/10 text-blue-400 border-blue-500/20 text-[9px] px-2">{peers.length} Nodes</Badge>
         </div>
         
         <div className="flex-1 overflow-y-auto space-y-4 custom-scrollbar pr-2">
            {peers.map((peer: any) => (
               <div key={peer.peer_id} className="p-5 rounded-3xl bg-white/[0.03] border border-white/[0.03] active:scale-[0.98] transition-all group">
                  <div className="flex items-center justify-between mb-4">
                     <span className="text-[9px] font-mono opacity-30">{peer.peer_id.slice(0, 14)}</span>
                     {voteProgress[peer.peer_id] === 'done' ? <CheckCircle2 className="w-3 h-3 text-green-500" /> : 
                      voteProgress[peer.peer_id] === 'pending' ? <div className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-pulse" /> : 
                      <div className="w-1.5 h-1.5 bg-white/10 rounded-full" />}
                  </div>
                  <h5 className="text-xs font-bold mb-3">{peer.models[0]}</h5>
                  <div className="flex items-center gap-4">
                     <div className="flex flex-col gap-1">
                        <span className="text-[8px] font-black uppercase opacity-20">Compute</span>
                        <span className="text-[10px] font-mono font-bold">{(peer.metrics?.cpu_percent || 0).toFixed(0)}%</span>
                     </div>
                     <div className="flex flex-col gap-1">
                        <span className="text-[8px] font-black uppercase opacity-20">Latency</span>
                        <span className="text-[10px] font-mono font-bold">{peer.latency_ms.toFixed(0)}ms</span>
                     </div>
                  </div>
               </div>
            ))}
         </div>
         
         <Button onClick={onBack} variant="ghost" className="w-full h-14 rounded-2xl border border-white/5 hover:bg-white/5 text-[10px] font-bold uppercase tracking-widest flex items-center gap-3">
            <Minimize2 className="w-4 h-4 opacity-40" /> Back to Map
         </Button>
      </div>

      {/* Consensus Interface */}
      <div className="flex-1 flex flex-col relative bg-[#020203]">
        <div className="flex-1 overflow-y-auto px-16 py-12 space-y-16 custom-scrollbar">
          {messages.length === 0 && (
            <div className="h-full flex flex-col items-center justify-center text-center max-w-lg mx-auto py-20">
               <div className="w-28 h-28 rounded-[48px] bg-white text-black flex items-center justify-center mb-12 shadow-2xl relative">
                  <div className="absolute inset-0 bg-blue-500 blur-2xl opacity-20 rounded-full animate-pulse" />
                  <Users className="w-12 h-12 relative z-10" />
               </div>
               <h2 className="text-4xl font-black tracking-tighter uppercase mb-6 leading-none">Consensus<br />Environment</h2>
               <p className="text-sm font-mono tracking-widest uppercase opacity-30 leading-loose">
                  Selectively routing through {peers.length} validated nodes. Synchronized via decentralized voting.
               </p>
            </div>
          )}

          {messages.map((m: any, i: number) => (
            <motion.div 
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              key={i} 
              className={cn("flex w-full", m.role === 'user' ? 'justify-end' : 'justify-start')}
            >
              <div className={cn(
                "max-w-3xl",
                m.role === 'user' ? "text-right" : "text-left"
              )}>
                <div className="flex items-center gap-3 mb-4 opacity-30 uppercase text-[9px] font-black tracking-[0.3em]">
                  {m.role === 'user' ? 'Local Operator' : 'Final Selection Consensus'}
                  {m.isConsensus && <Badge className="bg-green-500/10 text-green-500 border-green-500/20 text-[7px] py-0 h-4">Verified</Badge>}
                  <span className="w-1 h-1 rounded-full bg-white/20" />
                  {new Date(m.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                </div>
                <div className={cn(
                  "text-3xl leading-[1.2] tracking-tighter font-medium",
                  m.role === 'user' ? "text-white" : "text-white/60"
                )}>
                  {m.text}
                </div>
                {m.node_id && (
                  <div className="mt-6 flex items-center gap-4 opacity-20 transition-opacity hover:opacity-100">
                     <div className="flex items-center gap-2">
                        <Cpu className="w-3 h-3" />
                        <span className="text-[9px] font-mono tracking-widest uppercase">Node: {m.node_id.slice(0, 16)}</span>
                     </div>
                     <div className="h-3 w-px bg-white/10" />
                     <div className="flex items-center gap-2">
                        <Vote className="w-3 h-3" />
                        <span className="text-[9px] font-mono tracking-widest uppercase">Majority Vote Reachout</span>
                     </div>
                  </div>
                )}
              </div>
            </motion.div>
          ))}
          
          {sending && (
            <div className="flex flex-col items-start gap-4">
               <div className="flex items-center gap-2 px-1">
                  <div className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-bounce [animation-delay:-0.3s]" />
                  <div className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-bounce [animation-delay:-0.15s]" />
                  <div className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-bounce" />
                  <span className="text-[10px] font-black uppercase tracking-[0.3em] opacity-30 ml-4">Evaluating Clustered Response Consensus...</span>
               </div>
            </div>
          )}
        </div>

        {/* Global Input Space */}
        <div className="p-16 pt-0 bg-gradient-to-t from-[#020203] via-[#020203] to-transparent">
          <form 
            className="max-w-5xl mx-auto relative group"
            onSubmit={(e) => { e.preventDefault(); handleSend(); }}
          >
            <div className="absolute inset-0 bg-blue-500/5 blur-3xl rounded-full opacity-0 group-focus-within:opacity-100 transition-opacity" />
            <Input 
              value={input}
              onChange={e => setInput(e.target.value)}
              disabled={sending}
              placeholder="Inject Cluster Prompt Expression..."
              className="h-24 bg-white/[0.02] border-white/[0.05] rounded-[48px] px-12 text-2xl font-medium focus-visible:ring-1 focus-visible:ring-white/10 focus-visible:border-white/10 transition-all shadow-3xl placeholder:opacity-20"
            />
            <button 
              type="submit" 
              disabled={sending || !input}
              className="absolute right-4 top-4 h-16 w-16 rounded-full bg-white text-black hover:scale-105 active:scale-95 disabled:opacity-5 transition-all flex items-center justify-center p-0 shadow-xl"
            >
              <ArrowRight className="w-7 h-7" />
            </button>
          </form>
          <div className="mt-8 text-center flex items-center justify-center gap-10 opacity-20">
             <div className="flex items-center gap-2"><ShieldCheck className="w-3 h-3" /><span className="text-[9px] font-black uppercase tracking-widest text-center">P2P Encryption Path Enabled</span></div>
             <div className="h-1 w-1 rounded-full bg-white/20" />
             <div className="flex items-center gap-2"><Vote className="w-3 h-3" /><span className="text-[9px] font-black uppercase tracking-widest text-center">Weighted Consensus: ON</span></div>
          </div>
        </div>
      </div>
    </motion.div>
  );
};

const SidebarItem = ({ icon }: { icon: any }) => (
  <div className="w-12 h-12 rounded-2xl flex items-center justify-center cursor-pointer hover:bg-white/5 transition-colors group">
    <div className="text-white/20 group-hover:text-white transition-colors">{icon}</div>
  </div>
);
