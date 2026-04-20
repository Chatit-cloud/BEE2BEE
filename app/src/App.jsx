import React, { useState, useEffect, useRef } from 'react';
import createGlobe from 'cobe';
import { 
  Plus, Cpu, Globe, Zap, Send, Settings, 
  Terminal, Shield, Layers, Activity,
  ArrowRight, Database, Users, Info, X
} from 'lucide-react';

// --- Core Globe ---
const NeuralMap = ({ peers }) => {
  const canvasRef = useRef();
  const markers = (peers || []).map(p => ({ location: p.location || [30, 31], size: 0.05 }));
  
  useEffect(() => {
    let phi = 0;
    const globe = createGlobe(canvasRef.current, {
      devicePixelRatio: 2,
      width: 500 * 2,
      height: 500 * 2,
      phi: 0,
      theta: 0,
      dark: 0,
      diffuse: 1.2,
      mapSamples: 16000,
      mapBrightness: 6,
      baseColor: [1, 1, 1],
      markerColor: [0.1, 0.45, 0.9],
      glowColor: [1, 1, 1],
      markers,
      onRender: (state) => {
        state.phi = phi;
        phi += 0.003;
      },
    });
    return () => globe.destroy();
  }, [markers.length]);

  return (
    <canvas
      ref={canvasRef}
      className="w-[500px] h-[500px] max-w-full opacity-90 drop-shadow-2xl"
    />
  );
};

// --- Landing Page ---
const Landing = ({ onStart }) => {
  const [email, setEmail] = useState('');
  const [subscribed, setSubscribed] = useState(false);

  const handleSubscribe = async () => {
    if (!email) return;
    try {
      await fetch('/api/subscribe', { 
        method: 'POST', 
        headers: { 'Content-Type': 'application/json' }, 
        body: JSON.stringify({ email }) 
      });
      setSubscribed(true);
    } catch { alert("Subscription error"); }
  };

  return (
    <div className="min-h-screen bg-white flex flex-col items-center justify-center px-6 relative overflow-hidden">
      <div className="mb-12 flex items-center gap-2 py-2 px-4 rounded-full border border-gray-100 bg-white shadow-sm ring-1 ring-black/5 animate-float">
        <Layers className="w-3.5 h-3.5 text-black" />
        <span className="text-[11px] font-bold tracking-tight text-black">CoitHub.org</span>
      </div>
      <div className="text-center space-y-10 max-w-4xl mx-auto z-10">
        <h1 className="google-sans-title">Neural<br />Autonomous Cluster</h1>
        <p className="sub-title mx-auto">Freemium-First inference routed through a modernized<br />Javascript API bridge. 100% decentralized.</p>
        
        <div className="flex flex-col items-center gap-6 pt-6 animate-in fade-in slide-in-from-bottom-10 duration-700">
          <button onClick={onStart} className="pill-btn bg-black text-white hover:scale-105 active:scale-95 shadow-xl shadow-black/10 text-lg py-5 px-12">
            Enter Global Mesh
          </button>
          
          <div className="flex flex-col items-center gap-3">
             {subscribed ? (
               <span className="text-[11px] font-bold text-emerald-500 uppercase tracking-widest bg-emerald-50 px-4 py-2 rounded-full">✓ Subscribed for Updates</span>
             ) : (
               <div className="flex items-center gap-2 p-1.5 pl-5 bg-white border border-gray-100 rounded-full shadow-lg hover:shadow-xl transition-all focus-within:ring-2 focus-within:ring-blue-100">
                  <input 
                    value={email} onChange={e => setEmail(e.target.value)}
                    placeholder="Email for changelog..." 
                    className="bg-transparent border-none outline-none text-xs w-48 font-medium"
                  />
                  <button onClick={handleSubscribe} className="bg-gray-50 text-gray-400 hover:text-black p-2 rounded-full transition-colors">
                    <ArrowRight className="w-4 h-4" />
                  </button>
               </div>
             )}
          </div>
        </div>
      </div>
      
      <div className="mt-28 grid grid-cols-3 gap-16 md:gap-32 px-10">
        <div className="text-center group">
          <p className="text-3xl font-light text-black tracking-tighter">1.2M</p>
          <p className="text-[9px] font-bold text-gray-300 uppercase tracking-widest mt-2 group-hover:text-blue-500">Tokens</p>
        </div>
        <div className="text-center group">
          <p className="text-3xl font-light text-black tracking-tighter">48k</p>
          <p className="text-[9px] font-bold text-gray-300 uppercase tracking-widest mt-2 group-hover:text-blue-500">Chats</p>
        </div>
        <div className="text-center group">
          <p className="text-3xl font-light text-black tracking-tighter">8k</p>
          <p className="text-[9px] font-bold text-gray-300 uppercase tracking-widest mt-2 group-hover:text-blue-500">Nodes</p>
        </div>
      </div>
      <div className="absolute top-[-10%] right-[-10%] w-[500px] h-[500px] bg-blue-50 rounded-full blur-[140px] -z-10" />
      <div className="absolute bottom-[-10%] left-[-10%] w-[500px] h-[500px] bg-gray-50 rounded-full blur-[120px] -z-10" />
    </div>
  );
};

// --- Quick Registration & Survey ---
const QuickRegister = ({ linkData, networkStats, onComplete }) => {
  const [formData, setFormData] = useState({ usage: 'Commercial', tags: 'gpu-node', survey: 'Fast' });
  const [step, setStep] = useState('form');
  const [liveMetrics, setLiveMetrics] = useState({ tps: 0, mem: 0, trust: 0, status: 'connecting' });

  // Poll for real metrics once we move to monitoring
  useEffect(() => {
    if (step !== 'monitoring') return;
    
    const nodeAddr = linkData.link.split('bootstrap=')[1]?.split('&')[0];
    // Handle URL-safe base64 with stripped padding
    let decodedAddr = null;
    if (nodeAddr) {
      try {
        let padded = nodeAddr;
        const missing = 4 - (nodeAddr.length % 4);
        if (missing !== 4) padded = nodeAddr + '='.repeat(missing);
        decodedAddr = window.atob(padded);
      } catch (e) {
        console.error('Failed to decode bootstrap:', e);
      }
    }

    const findMetrics = () => {
       // Try to find by decoded address or use first peer
       const peer = (networkStats.peers || []).find(p => p.addr === decodedAddr || (decodedAddr && p.addr?.includes(decodedAddr.split(':')[0]))) || 
                    (networkStats.peers || [])[0];
       
       if (peer) {
          setLiveMetrics({
             tps: peer.metrics?.throughput || 0,
             mem: peer.metrics?.memory_percent || 0,
             trust: peer.metrics?.trust_score || 0.99,
             status: 'live'
          });
       }
    };
    
    const interval = setInterval(findMetrics, 2000);
    findMetrics(); // Initial call
    return () => clearInterval(interval);
  }, [step, networkStats.peers, linkData.link]);

  const handleRegister = async () => {
    setStep('verifying');
    try {
      const res = await fetch('/api/p2p/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ link: linkData.link })
      });
      const result = await res.json();
      
      if (result.success) {
        // Wait for P2P handshake with longer timeout
        setTimeout(() => setStep('monitoring'), 2000);
      } else {
        console.error('Registration failed:', result.error);
        setStep('form');
      }
    } catch (e) {
      console.error('Registration failed:', e);
      setStep('form');
    }
  };

  if (step === 'monitoring') {
    return (
      <div className="min-h-screen bg-black text-white p-10 flex flex-col items-center justify-center text-center animate-in fade-in duration-700">
        <div className="mb-12">
           <Activity className={`w-16 h-16 ${liveMetrics.status === 'live' ? 'text-emerald-500' : 'text-blue-500'} animate-pulse mb-8 mx-auto`} />
           <h2 className="text-3xl font-light mb-2 text-white italic">Live Node Monitor</h2>
           <p className="text-[10px] font-bold text-gray-500 uppercase tracking-[0.3em] font-mono">
              {liveMetrics.status === 'live' ? 'Synchronized with Neural Core' : 'Awaiting Peer Handshake...'}
           </p>
        </div>

        <div className="grid grid-cols-3 gap-8 w-full max-w-2xl mt-12">
           <div className="bg-white/5 p-8 rounded-[32px] border border-white/10 hover:border-white/20 transition-all">
              <p className="text-[9px] font-bold uppercase tracking-widest text-gray-400 mb-3">Throughput</p>
              <p className="text-3xl font-mono text-white">{liveMetrics.tps} <span className="text-xs text-gray-500">t/s</span></p>
           </div>
           <div className="bg-white/5 p-8 rounded-[32px] border border-white/10 hover:border-white/20 transition-all">
              <p className="text-[9px] font-bold uppercase tracking-widest text-gray-400 mb-3">Memory</p>
              <p className="text-3xl font-mono text-white">{liveMetrics.mem}<span className="text-xs text-gray-500">%</span></p>
           </div>
           <div className="bg-white/5 p-8 rounded-[32px] border border-white/10 hover:border-white/20 transition-all">
              <p className="text-[9px] font-bold uppercase tracking-widest text-gray-400 mb-3">Trust</p>
              <p className="text-3xl font-mono text-emerald-400">{liveMetrics.trust.toFixed(2)}</p>
           </div>
        </div>

        <div className="mt-20 flex flex-col items-center gap-6">
           <button onClick={onComplete} className="pill-btn bg-white text-black px-16 hover:scale-105 active:scale-95 shadow-2xl shadow-white/10">
              Enter Dashboard
           </button>
           <p className="text-[8px] text-gray-600 font-bold uppercase tracking-widest">RSA-4096 Encrypted Neural Tunnel</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white p-10 flex flex-col items-center justify-center">
       <div className="w-full max-w-md space-y-10">
          <div className="text-center">
             <div className="w-16 h-16 bg-blue-50 rounded-2xl flex items-center justify-center mx-auto mb-6">
                <Plus className="w-8 h-8 text-blue-600" />
             </div>
             <h2 className="text-2xl font-semibold tracking-tight">One-Click Onboarding</h2>
             <p className="text-sm text-gray-400 mt-2">Finish setting up {linkData.model} cluster</p>
          </div>

          <div className="space-y-6">
             <div className="space-y-2">
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest px-1">Usage Type</label>
                <select className="w-full h-14 bg-gray-50 border-none rounded-2xl px-5 text-sm outline-none" onChange={e => setFormData({...formData, usage: e.target.value})}>
                   <option>Personal / Development</option>
                   <option>Commercial / API</option>
                   <option>Public Mesh Relay</option>
                </select>
             </div>
             <div className="space-y-2">
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest px-1">Performance Tier</label>
                <div className="flex gap-2">
                   {['Low', 'Medium', 'Ultra'].map(t => (
                      <button key={t} onClick={() => setFormData({...formData, survey: t})} className={`flex-1 h-12 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all ${formData.survey === t ? 'bg-black text-white' : 'bg-gray-50 text-gray-400'}`}>{t}</button>
                   ))}
                </div>
             </div>
          </div>

          <button onClick={handleRegister} className="w-full h-16 bg-black text-white rounded-3xl font-bold uppercase tracking-widest shadow-xl shadow-black/10 hover:scale-[1.02] active:scale-[0.98] transition-all">
             {step === 'verifying' ? 'Verifying Neural Path...' : 'Confirm Registration'}
          </button>
       </div>
    </div>
  );
};

// --- Mesh/Region Explorer ---
const MeshExplorer = ({ meshData, onBack, onSelectNode }) => {
  return (
    <div className="min-h-screen bg-[#fcfcfc] p-10 flex flex-col items-center">
       <nav className="w-full max-w-6xl flex justify-between items-center mb-20 animate-in fade-in duration-500">
          <div className="flex items-center gap-3">
             <div className="w-8 h-8 bg-black rounded-lg flex items-center justify-center">
                <Globe className="w-4 h-4 text-white" />
             </div>
             <span className="text-sm font-bold tracking-tight">CoitHub Mesh</span>
          </div>
          <button onClick={onBack} className="text-[10px] font-bold text-gray-400 uppercase tracking-widest hover:text-black">Exit</button>
       </nav>

       <div className="w-full max-w-6xl space-y-12">
          <h2 className="text-4xl font-light tracking-tight text-center mb-16">Select Neural Region</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
             {Object.entries(meshData).map(([region, nodes]) => (
                <div key={region} className="bg-white border border-gray-100 rounded-[32px] p-8 shadow-sm hover:shadow-xl hover:scale-[1.02] transition-all group flex flex-col">
                   <div className="flex justify-between items-start mb-10">
                      <div className="p-3 bg-blue-50 rounded-2xl group-hover:bg-black transition-colors duration-500">
                         <MapPin className="w-5 h-5 text-blue-600 group-hover:text-white" />
                      </div>
                      <span className="text-[10px] font-bold text-emerald-500 uppercase tracking-widest bg-emerald-50 px-3 py-1 rounded-full">
                         {nodes.length} Nodes
                      </span>
                   </div>
                   <h3 className="text-2xl font-semibold mb-6 tracking-tight">{region}</h3>
                   <div className="space-y-4 flex-1">
                      {nodes.slice(0, 3).map(node => (
                         <div key={node.addr} onClick={() => onSelectNode(node)} className="flex items-center justify-between p-4 bg-gray-50 rounded-2xl cursor-pointer hover:bg-gray-100 transition-all border border-transparent hover:border-gray-200">
                            <div className="flex flex-col">
                               <span className="text-[10px] font-bold text-black group-hover:text-blue-600">{node.models[0] || 'Unknown'}</span>
                               <span className="text-[9px] text-gray-400 font-mono">{node.latency}ms</span>
                            </div>
                            <ArrowRight className="w-3 h-3 text-gray-300" />
                         </div>
                      ))}
                   </div>
                </div>
             ))}
          </div>
       </div>
    </div>
  );
};

// --- Dashboard Component (Redesigned: Gemini B&W Style) ---
const Dashboard = ({ networkStats, messages, isProcessing, activeModel, onSend }) => {
  const [input, setInput] = useState('');
  const messagesEndRef = useRef(null);
  
  useEffect(() => { 
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }); 
  }, [messages]);

  const handleCommit = () => {
    if (!input.trim() || isProcessing) return;
    onSend(input);
    setInput('');
  };

  return (
    <div className="flex h-screen bg-white text-black font-sans selection:bg-black selection:text-white">
      {/* Mini Sidebar */}
      <aside className="w-16 md:w-64 bg-white border-r border-gray-100 flex flex-col items-center md:items-stretch p-4 transition-all duration-300">
        <div className="flex items-center gap-3 mb-12 mt-2 px-2">
          <div className="w-8 h-8 bg-black rounded-lg flex items-center justify-center shrink-0">
             <Layers className="w-4 h-4 text-white" />
          </div>
          <h1 className="font-bold text-sm hidden md:block tracking-tight text-black">CoitHub</h1>
        </div>
        
        <div className="flex-1 space-y-2 overflow-y-auto no-scrollbar">
           <div className="p-3 md:p-4 bg-gray-50 rounded-2xl border border-gray-100">
              <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest mb-1.5 hidden md:block">Network Pool</p>
              <div className="flex items-center justify-between">
                 <div className="flex flex-col">
                    <span className="text-xl font-light leading-none">{networkStats.poolSize}</span>
                    <span className="text-[8px] font-bold text-gray-400 uppercase md:hidden mt-0.5">NODES</span>
                    <span className="text-[9px] font-bold text-gray-400 uppercase hidden md:block">Nodes Online</span>
                 </div>
                 <Activity className="w-4 h-4 text-black hidden md:block opacity-20" />
              </div>
           </div>

           <div className="p-3 md:p-4 bg-white border border-gray-100 rounded-2xl hover:border-black transition-colors cursor-pointer group">
              <div className="flex items-center gap-3">
                 <Globe className="w-4 h-4 text-gray-400 group-hover:text-black" />
                 <span className="text-xs font-medium hidden md:block">Mesh Map</span>
              </div>
           </div>
           
           <div className="p-3 md:p-4 bg-white border border-gray-100 rounded-2xl hover:border-black transition-colors cursor-pointer group">
              <div className="flex items-center gap-3">
                 <Zap className="w-4 h-4 text-gray-400 group-hover:text-black" />
                 <span className="text-xs font-medium hidden md:block">Performance</span>
              </div>
           </div>
        </div>

        <div className="mt-auto p-2">
           <div className="w-full h-10 bg-gray-50 rounded-xl flex items-center justify-center cursor-pointer hover:bg-black group transition-all">
              <Settings className="w-4 h-4 text-gray-400 group-hover:text-white" />
           </div>
        </div>
      </aside>

      {/* Chat Area */}
      <main className="flex-1 flex flex-col relative">
         {/* Top Bar */}
         <header className="h-16 border-b border-gray-50 flex items-center justify-between px-8 bg-white/80 backdrop-blur-md sticky top-0 z-50">
            <div className="flex items-center gap-4">
               <div className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
                  <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Node Active</span>
               </div>
               <div className="h-4 w-px bg-gray-100 hidden sm:block" />
               <div className="hidden sm:flex items-center gap-2">
                  <Cpu className="w-3.5 h-3.5 text-black opacity-30" />
                  <span className="text-[11px] font-bold text-black uppercase tracking-tight">{activeModel}</span>
               </div>
            </div>
            <div className="flex items-center gap-4">
               <span className="text-[10px] font-bold text-gray-300 font-mono hidden sm:block">{networkStats.activeNode}</span>
            </div>
         </header>

         {/* Messages Container */}
         <div className="flex-1 overflow-y-auto pt-12 pb-32 no-scrollbar">
            <div className="max-w-3xl mx-auto px-6 space-y-12">
               {messages.length === 0 && (
                  <div className="py-20 text-center space-y-4 animate-in fade-in duration-1000">
                     <h2 className="text-4xl md:text-5xl font-light tracking-tight text-gray-200">How can CoitHub help you?</h2>
                     <p className="text-xs text-gray-300 font-medium uppercase tracking-[0.2em]">Decentralized Neural Cluster — Private & Permissionless</p>
                  </div>
               )}

               {messages.map((m, i) => (
                  <div key={i} className={`flex flex-col ${m.role === 'user' ? 'items-end' : 'items-start'} animate-in fade-in slide-in-from-bottom-2 duration-500`}>
                     <div className={`flex items-start gap-4 max-w-[85%] md:max-w-[80%] ${m.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
                        {m.role === 'ai' && (
                           <div className="w-8 h-8 rounded-full bg-black flex items-center justify-center shrink-0 mt-1 shadow-lg shadow-black/10">
                              <Cpu className="w-4 h-4 text-white" />
                           </div>
                        )}
                        <div className={`space-y-1 ${m.role === 'user' ? 'text-right' : 'text-left'}`}>
                           <p className={`text-[15px] leading-relaxed font-normal whitespace-pre-wrap ${m.role === 'user' ? 'bg-gray-100 py-3 px-5 rounded-[24px] rounded-tr-none text-black' : 'text-black py-1'}`}>
                              {m.text}
                           </p>
                           {m.metadata && (
                              <div className="flex items-center gap-3 mt-4 opacity-30 group-hover:opacity-100 transition-opacity">
                                 <span className="text-[8px] font-bold uppercase tracking-widest">{m.metadata.neural_path || 'Cloud'}</span>
                                 <span className="text-[8px] font-bold uppercase tracking-widest">{m.metadata.latency_ms}ms</span>
                              </div>
                           )}
                        </div>
                     </div>
                  </div>
               ))}
               {isProcessing && (
                  <div className="flex items-start gap-4 animate-pulse">
                     <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center shrink-0">
                        <Cpu className="w-4 h-4 text-gray-300" />
                     </div>
                     <div className="space-y-2 py-3 w-full">
                        <div className="h-2 bg-gray-100 rounded-full w-3/4" />
                        <div className="h-2 bg-gray-100 rounded-full w-1/2" />
                     </div>
                  </div>
               )}
               <div ref={messagesEndRef} />
            </div>
         </div>

         {/* Floating Input Bar (Gemini Style) */}
         <div className="absolute bottom-0 left-0 right-0 p-6 md:p-10 bg-gradient-to-t from-white via-white/95 to-transparent pointer-events-none">
            <div className="max-w-3xl mx-auto pointer-events-auto">
               <div className="relative group">
                  <div className="absolute inset-0 bg-black/5 rounded-[32px] blur-xl opacity-0 group-focus-within:opacity-100 transition-opacity pointer-events-none" />
                  <div className="relative flex items-center gap-2 p-2 pl-6 bg-[#f0f2f5] border border-transparent focus-within:border-gray-200 focus-within:bg-white rounded-[32px] transition-all duration-300 shadow-sm">
                     <input 
                        value={input} 
                        onChange={e => setInput(e.target.value)} 
                        onKeyDown={e => e.key === 'Enter' && handleCommit()}
                        placeholder="Message CoitHub..." 
                        className="flex-1 h-12 bg-transparent text-[15px] text-black placeholder:text-gray-400 outline-none" 
                     />
                     <button 
                        onClick={handleCommit}
                        disabled={!input.trim() || isProcessing}
                        className={`w-12 h-12 rounded-full flex items-center justify-center transition-all ${input.trim() && !isProcessing ? 'bg-black text-white hover:scale-105 active:scale-95' : 'bg-transparent text-gray-300 cursor-not-allowed'}`}
                     >
                        <Send className="w-5 h-5" />
                     </button>
                  </div>
                  <p className="text-[9px] text-center text-gray-300 mt-4 font-bold uppercase tracking-widest">CoitHub may hallucinate. Verify critical outputs.</p>
               </div>
            </div>
         </div>
      </main>
    </div>
  );
};

// --- App Root ---
export default function App() {
  const [view, setView] = useState('landing');
  const [linkData, setLinkData] = useState(null);
  const [messages, setMessages] = useState([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [networkStats, setNetworkStats] = useState({ connected: false, totalPeers: 0, activeNode: 'ws://...', poolSize: 0, peers: [] });
  const [meshData, setMeshData] = useState({});
  const [selectedModel, setSelectedModel] = useState('llama3'); // Default

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const link = params.get('link');
    let modelParam = params.get('model');
    
    if (link) {
      // Try to extract model from the nested link if not at top level
      if (!modelParam) {
        try {
          const innerUrlStr = link.includes('://') ? link : `http://${link}`;
          const innerUrl = new URL(innerUrlStr.replace('coithub.org://', 'http://coithub.org/'));
          modelParam = innerUrl.searchParams.get('model');
        } catch (e) {
          console.warn("[App] Could not parse nested model info:", e);
        }
      }

      setLinkData({ link, model: modelParam || 'Neural Node' });
      if (modelParam) setSelectedModel(modelParam);
      setView('quick-register');
    }
  }, []);

  const fetchStats = async () => {
      try {
        const [statsRes, meshRes] = await Promise.all([
          fetch('/api/p2p/status'),
          fetch('/api/p2p/mesh')
        ]);
        if (statsRes.ok) setNetworkStats(await statsRes.json());
        if (meshRes.ok) {
           const mesh = await meshRes.json();
           setMeshData(mesh);
           // Auto-pick first available model if default not found
           const allModels = Object.values(mesh).flat().flatMap(n => n.models);
           if (allModels.length > 0 && !allModels.includes(selectedModel)) {
              setSelectedModel(allModels[0]);
           }
        }
      } catch { setNetworkStats(prev => ({ ...prev, connected: false })); }
    };

  useEffect(() => {
    fetchStats();
    const interval = setInterval(fetchStats, 2000);
    return () => clearInterval(interval);
  }, []);

  // Immediate fetch when node is detected
  useEffect(() => {
    if (linkData) fetchStats();
  }, [linkData]);

  const handleSelectNode = (node) => {
    if (node.models && node.models.length > 0) setSelectedModel(node.models[0]);
    setMessages([{ 
      role: 'ai', 
      text: `Link established. Regional cluster: ${node.region}. Neural path: ${node.addr}. Ready for ${node.models[0] || 'inference'}.`,
      metadata: { neural_path: node.addr, latency_ms: node.latency }
    }]);
    setView('dashboard');
  };

  if (view === 'landing') return <Landing onStart={() => setView('mesh')} />;
  if (view === 'mesh') return <MeshExplorer meshData={meshData} onBack={() => setView('landing')} onSelectNode={handleSelectNode} />;
  if (view === 'quick-register') return <QuickRegister linkData={linkData} networkStats={networkStats} onComplete={() => setView('dashboard')} />;
  
  return (
    <Dashboard 
      networkStats={networkStats} 
      messages={messages} 
      isProcessing={isProcessing} 
      activeModel={selectedModel}
onSend={async (content) => {
          if (!content.trim() || isProcessing) return;
          setMessages(prev => [...prev, { role: 'user', text: content }]);
          setIsProcessing(true);
          try {
            const payload = { task: { prompt: content, model: selectedModel } };
            let response = await fetch('/api/p2p/consensus', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(payload)
            });

            if (response.status === 504 || response.status === 503) {
               console.warn("[Mesh] Cloud Bridge timeout. Attempting Neural Direct-Link...");
               
               // Try direct local node at common ports
               const ports = [8000, 4001, 3000];
               let directSuccess = false;
               
               for (const port of ports) {
                   try {
                       const localResp = await fetch(`http://localhost:${port}/chat`, {
                           method: 'POST',
                           headers: { 'Content-Type': 'application/json' },
                           body: JSON.stringify({ 
                               prompt: content, 
                               model: selectedModel,
                               max_new_tokens: 2048
                           })
                       });
                       if (localResp.ok) {
                           const localData = await localResp.json();
                           setMessages(prev => [...prev, { 
                               role: 'ai', 
                               text: localData.text || "Direct Link Success.", 
                               metadata: { ...localData.metadata, mode: 'direct-ingress', port } 
                           }]);
                           directSuccess = true;
                           break;
                       }
                   } catch (localErr) {
                       console.log(`[Mesh] Port ${port} failed:`, localErr.message);
                   }
               }
               
               if (directSuccess) return;
               
               setMessages(prev => [...prev, { 
                   role: 'ai', 
                   text: `No nodes available. Make sure your node is running:\npython -m bee2bee serve-ollama --model ${selectedModel}`, 
                   metadata: { error: true } 
               }]);
            } else {
                const data = await response.json();
                setMessages(prev => [...prev, { role: 'ai', text: data.text || "Consensus failed (No Response).", metadata: data.metadata }]);
            }
          } catch (err) { 
            console.error("[Mesh] Request failed:", err);
            setMessages(prev => [...prev, { role: 'ai', text: "Bridge Offline. Is your node running?", metadata: { trust_score: 0 } }]); 
          } finally { setIsProcessing(false); }
      }}
    />
  );
}

// Support imports
import { MapPin } from 'lucide-react';
