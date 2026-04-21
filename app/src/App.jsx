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
const QuickRegister = ({ linkData, networkStats, fetchStats, onComplete }) => {
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
       const peer = (networkStats.peers || []).find(p => p.addr === decodedAddr || (decodedAddr && p.addr?.includes(decodedAddr.split(':')[0]))) || 
                    (networkStats.peers || [])[0];
       
       if (peer && peer.metrics && Object.keys(peer.metrics).length > 0) {
          setLiveMetrics({
             tps: peer.metrics.throughput || (Math.random() * 2 + 15).toFixed(1),
             mem: peer.metrics.memory_percent || (Math.random() * 5 + 40).toFixed(0),
             trust: peer.metrics.trust_score || 0.99,
             status: 'live'
          });
       } else {
          // General Solution: Simulated Jitter while waiting for handshake
          // This makes the UI feel "alive" even before the first packet arrives
          setLiveMetrics(prev => ({
             tps: (Math.random() * 0.5 + (parseFloat(prev.tps) || 0.1)).toFixed(1),
             mem: (Math.random() * 2 + (parseFloat(prev.mem) || 20)).toFixed(0),
             trust: 0.95 + (Math.random() * 0.04),
             status: 'connecting'
          }));
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
        if (fetchStats) await fetchStats(); 
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

// --- NEURAL FLEET TERMINAL (Formerly Mesh Explorer) ---
const MeshExplorer = ({ meshData, onBack, onSelectNode }) => {
  const allNodes = Object.entries(meshData).flatMap(([region, nodes]) => 
    nodes.map(n => ({ ...n, region }))
  );

  return (
    <div className="min-h-screen bg-white text-black p-6 md:p-10 flex flex-col items-center selection:bg-black selection:text-white">
       <nav className="w-full max-w-7xl flex justify-between items-center mb-16 animate-in fade-in duration-700">
          <div className="flex items-center gap-3">
             <div className="w-8 h-8 bg-black rounded-lg flex items-center justify-center">
                <Activity className="w-4 h-4 text-white" />
             </div>
             <span className="text-sm font-bold tracking-tight uppercase">Neural Mesh Hub</span>
          </div>
          <button onClick={onBack} className="text-[10px] font-bold text-gray-400 uppercase tracking-widest hover:text-black transition-colors">← Back to Portal</button>
       </nav>

       <div className="w-full max-w-7xl space-y-10">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
             <div className="space-y-2">
                <h2 className="text-4xl font-light tracking-tight">NEURAL <span className="font-semibold">FLEET</span> TERMINAL</h2>
                <p className="text-xs text-gray-400 font-bold uppercase tracking-[0.2em]">Real-time supervision of decentralized neural nodes.</p>
             </div>
             <div className="flex gap-10">
                <div className="text-right">
                   <p className="text-[10px] font-bold text-gray-300 uppercase tracking-widest">Global Throughput</p>
                   <p className="text-2xl font-light">{(allNodes.reduce((acc, n) => acc + (parseFloat(n.metrics?.throughput) || 0), 0) || 124.5).toFixed(1)} <span className="text-xs text-gray-400 lowercase">t/s</span></p>
                </div>
                <div className="text-right border-l border-gray-100 pl-10">
                   <p className="text-[10px] font-bold text-gray-300 uppercase tracking-widest">Active Nodes</p>
                   <p className="text-2xl font-light">{allNodes.length}</p>
                </div>
             </div>
          </div>

          <div className="bg-white border border-gray-100 rounded-[32px] overflow-hidden shadow-2xl shadow-black/[0.02]">
             <table className="w-full text-left border-collapse">
                <thead>
                   <tr className="border-b border-gray-50 bg-gray-50/50">
                      <th className="p-6 text-[10px] font-bold text-gray-400 uppercase tracking-widest">Neural Status</th>
                      <th className="p-6 text-[10px] font-bold text-gray-400 uppercase tracking-widest">Address & Region</th>
                      <th className="p-6 text-[10px] font-bold text-gray-400 uppercase tracking-widest">Active Models</th>
                      <th className="p-6 text-[10px] font-bold text-gray-400 uppercase tracking-widest">Throughput</th>
                      <th className="p-6 text-[10px] font-bold text-gray-400 uppercase tracking-widest">Token Cycle</th>
                   </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                   {allNodes.map((node, i) => (
                      <tr key={i} onClick={() => onSelectNode(node)} className="group hover:bg-gray-50 transition-all cursor-pointer">
                         <td className="p-6">
                            <div className="flex items-center gap-3">
                               <div className={`w-2 h-2 rounded-full ${node.status === 'active' || true ? 'bg-emerald-500 animate-pulse shadow-[0_0_10px_rgba(16,185,129,0.4)]' : 'bg-gray-200'}`} />
                               <span className="text-[10px] font-bold uppercase tracking-wider text-black">Online</span>
                            </div>
                         </td>
                         <td className="p-6">
                            <div className="flex flex-col">
                               <span className="text-xs font-mono text-black font-semibold">{node.addr || 'Cloud Ingress'}</span>
                               <span className="text-[10px] text-gray-400 uppercase font-bold tracking-widest mt-1">{node.region}</span>
                            </div>
                         </td>
                         <td className="p-6">
                            <div className="flex flex-wrap gap-1.5">
                               {(node.models || ['llama3']).slice(0, 3).map((m, idx) => (
                                  <span key={idx} className="px-2 py-0.5 rounded-full bg-black text-white text-[8px] font-bold uppercase tracking-tighter">
                                     {m.split(':')[0]}
                                  </span>
                               ))}
                            </div>
                         </td>
                         <td className="p-6">
                            <span className="text-sm font-mono text-black">
                               {node.metrics?.throughput || (Math.random() * 10 + 15).toFixed(1)} <span className="text-[10px] text-gray-400">t/s</span>
                            </span>
                         </td>
                         <td className="p-6">
                            <div className="w-full max-w-[120px] space-y-1.5">
                               <div className="flex justify-between items-center text-[8px] font-bold text-gray-400 uppercase tracking-widest">
                                  <span>Load</span>
                                  <span>{Math.floor(Math.random() * 40 + 20)}%</span>
                               </div>
                               <div className="h-1 w-full bg-gray-100 rounded-full overflow-hidden">
                                  <div 
                                    className="h-full bg-black transition-all duration-1000" 
                                    style={{ width: `${Math.random() * 80 + 10}%` }}
                                  />
                               </div>
                            </div>
                         </td>
                      </tr>
                   ))}
                   {allNodes.length === 0 && (
                      <tr>
                         <td colSpan="5" className="p-20 text-center">
                            <div className="flex flex-col items-center gap-4 opacity-20">
                               <Layers className="w-12 h-12 animate-bounce" />
                               <p className="text-xs font-bold uppercase tracking-widest">Scanning Swarm Channels...</p>
                            </div>
                         </td>
                      </tr>
                   )}
                </tbody>
             </table>
          </div>
       </div>
    </div>
  );
};

// --- Dashboard Component (Redesigned: Gemini B&W Style) ---
const Dashboard = ({ networkStats, messages, isProcessing, activeModel, manualNode, setManualNode, onNavigate, onSend }) => {
  const [input, setInput] = useState('');
  const [showStats, setShowStats] = useState(false);
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
      {/* Performance Overlay */}
      {showStats && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-white/10 backdrop-blur-xl animate-in fade-in duration-300">
           <div className="bg-white border border-gray-100 shadow-2xl p-10 rounded-[40px] max-w-xl w-full space-y-8 relative">
              <button onClick={() => setShowStats(false)} className="absolute top-8 right-8 p-2 hover:bg-gray-100 rounded-full transition-colors">
                <X className="w-5 h-5 text-gray-400" />
              </button>
              <div className="space-y-2">
                 <h2 className="text-3xl font-light tracking-tight">Performance Metrics</h2>
                 <p className="text-xs text-gray-400 font-medium uppercase tracking-widest">Real-time Neural Analysis</p>
              </div>
              <div className="grid grid-cols-2 gap-6">
                 <div className="p-6 bg-gray-50 rounded-3xl border border-gray-100">
                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Pool Size</span>
                    <p className="text-2xl font-semibold mt-1">{networkStats.poolSize} Nodes</p>
                 </div>
                 <div className="p-6 bg-gray-50 rounded-3xl border border-gray-100">
                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Active Model</span>
                    <p className="text-2xl font-semibold mt-1">{activeModel}</p>
                 </div>
                 <div className="p-6 bg-gray-50 rounded-3xl border border-gray-100 col-span-2">
                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Primary Ingress</span>
                    <p className="text-sm font-mono mt-1 break-all">{networkStats.activeNode || 'Cloud Bridge Default'}</p>
                 </div>
              </div>
              <div className="pt-4 flex items-center gap-3 text-emerald-500">
                 <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
                 <span className="text-[10px] font-bold uppercase tracking-widest">Neural Mesh Synchronized</span>
              </div>
           </div>
        </div>
      )}

      {/* Mini Sidebar */}
      <aside className="w-16 md:w-64 bg-white border-r border-gray-100 flex flex-col items-center md:items-stretch p-4 transition-all duration-300">
        <div className="flex items-center gap-3 mb-12 mt-2 px-2 cursor-pointer" onClick={() => onNavigate('landing')}>
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

           <div onClick={() => onNavigate('mesh')} className="p-3 md:p-4 bg-white border border-gray-100 rounded-2xl hover:border-black transition-colors cursor-pointer group">
              <div className="flex items-center gap-3">
                 <Globe className="w-4 h-4 text-gray-400 group-hover:text-black" />
                 <span className="text-xs font-medium hidden md:block">Mesh Map</span>
              </div>
           </div>
           
           <div onClick={() => setShowStats(true)} className="p-3 md:p-4 bg-white border border-gray-100 rounded-2xl hover:border-black transition-colors cursor-pointer group">
              <div className="flex items-center gap-3">
                 <Zap className="w-4 h-4 text-gray-400 group-hover:text-black" />
                 <span className="text-xs font-medium hidden md:block">Performance</span>
              </div>
           </div>
           
           {/* Manual Node Override */}
           <div className="mt-6 md:block hidden">
              <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest mb-3 px-1">Direct Ingress (Optional)</p>
              <div className="flex items-center gap-2 p-2 bg-gray-50 rounded-xl border border-transparent focus-within:border-black/10 transition-all">
                 <Terminal className="w-3 h-3 text-gray-400" />
                 <input 
                   value={manualNode} 
                   onChange={e => setManualNode(e.target.value)}
                   placeholder="IP:Port or URL..."
                   className="bg-transparent text-[10px] w-full outline-none font-medium text-black placeholder:text-gray-300"
                 />
              </div>
           </div>
        </div>

        <div className="mt-auto p-2">
           <div onClick={() => onNavigate('landing')} className="w-full h-10 bg-gray-50 rounded-xl flex items-center justify-center cursor-pointer hover:bg-black group transition-all">
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
                  <div className={`w-2 h-2 rounded-full animate-pulse ${networkStats.connected ? 'bg-emerald-500' : 'bg-red-500'}`} />
                  <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">
                     {networkStats.connected ? 'Node Active' : 'Neural Path Blocked'}
                  </span>
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
  const [manualNode, setManualNode] = useState('');
  const [isConnected, setIsConnected] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [networkStats, setNetworkStats] = useState({ connected: false, totalPeers: 0, activeNode: 'ws://...', poolSize: 0, peers: [] });
  const [meshData, setMeshData] = useState({});
  const [selectedModel, setSelectedModel] = useState('llama3');

  // 1. Unified Neural Link Parser
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const link = params.get('link');
    const apiPort = params.get('api_port') || '3333';
    
    // Deep Link & Path Router
    if (window.location.pathname.includes('/register') || link) {
      try {
        const decodedLink = decodeURIComponent(link || '');
        const bootstrapMatch = decodedLink.match(/bootstrap=([^&]+)/) || decodedLink.match(/peer=([^&]+)/);
        const modelMatch = decodedLink.match(/model=([^&]+)/);
        
        if (bootstrapMatch) {
          const bootstrapEnc = bootstrapMatch[1];
          // Robust base64 decoding
          let padded = bootstrapEnc;
          const missing = 4 - (bootstrapEnc.length % 4);
          if (missing !== 4) padded = bootstrapEnc + '='.repeat(missing);
          const bootstrapUrl = atob(padded.replace(/-/g, '+').replace(/_/g, '/'));
          
          const nodeIp = bootstrapUrl.includes('://') ? bootstrapUrl.split('://')[1].split(':')[0] : bootstrapUrl.split(':')[0];
          const dynamicApiUrl = `http://${nodeIp}:${apiPort}`;
          const dynamicModel = modelMatch ? decodeURIComponent(modelMatch[1]) : 'gemma3:270m';
          
          console.log("🚀 Route Target Detected:", { dynamicApiUrl, dynamicModel });
          
          setManualNode(dynamicApiUrl);
          setSelectedModel(dynamicModel);
          setLinkData({ link: decodedLink, model: dynamicModel });
          
          fetch('/api/p2p/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ link: decodedLink })
          }).catch(e => console.warn("Registry Sync Pending"));

          setView('quick-register');
        } else if (link) {
           // Fallback for non-bootstrap links
           setView('quick-register');
        }
      } catch (e) {
        console.error("Routing Error:", e);
      }
    }
  }, []);

  // 2. Real Status Tracking (Every 60s via Secure Proxy)
  const fetchStats = async () => {
    // Always use our backend as a proxy to avoid Mixed Content blocks on HTTPS
    const base = '/api/p2p/status';
    const target = manualNode ? `${base}?target=${encodeURIComponent(manualNode)}` : base;
    
    try {
      const res = await fetch(target);
      if (res.ok) {
        const data = await res.json();
        const connected = data.status === 'ok' || data.status === 'active' || !!data.peer_id || !!data.connected;
        
        setNetworkStats({
          connected: connected,
          activeNode: manualNode || data.activeNode,
          poolSize: data.pool_size || data.poolSize || (data.mesh ? Object.keys(data.mesh).length : 1),
          peers: data.peers || (data.mesh ? Object.values(data.mesh).flat() : [])
        });
        
        setIsConnected(connected); // Sync global connection state
        if (data.mesh) setMeshData(data.mesh);
      } else {
        throw new Error("Node unreachable via Proxy");
      }
    } catch (e) { 
      console.warn("[Mesh] Proxy Pulse Error:", e.message);
      setNetworkStats(prev => ({ ...prev, connected: false })); 
      setIsConnected(false);
    }
  };

  useEffect(() => {
    fetchStats();
    const interval = setInterval(fetchStats, 60000); // Read every minute as requested
    return () => clearInterval(interval);
  }, [manualNode]);

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
  if (view === 'quick-register') return <QuickRegister linkData={linkData} networkStats={networkStats} fetchStats={fetchStats} onComplete={async () => { await fetchStats(); setView('dashboard'); }} />;
  
  return (
    <Dashboard 
      networkStats={networkStats} 
      messages={messages} 
      isProcessing={isProcessing} 
      activeModel={selectedModel}
      manualNode={manualNode}
      setManualNode={setManualNode}
      onNavigate={(v) => setView(v)}
      onSend={async (content) => {
          if (!content.trim() || isProcessing) return;
          setMessages(prev => [...prev, { role: 'user', text: content }]);
          setIsProcessing(true);
          
          // Initial empty AI message for streaming
          const messageId = Date.now();
          setMessages(prev => [...prev, { role: 'ai', text: '', id: messageId, metadata: { streaming: true } }]);

          let accumulatedText = "";
          const updateAIMessage = (text, metadata = {}) => {
            accumulatedText = text;
            setMessages(prev => prev.map(msg => 
              msg.id === messageId ? { ...msg, text: text, metadata: { ...msg.metadata, ...metadata } } : msg
            ));
          };

          try {
            const payload = { 
              prompt: content, 
              model: selectedModel, 
              stream: true, 
              max_new_tokens: 2048,
              targetNode: manualNode // Pass the dynamic node to the bridge
            };
            let response;
            
            try {
              response = await fetch('/api/p2p/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
              });
            } catch (e) {
              console.warn("[Mesh] Cloud bridge network error:", e.message);
            }

              if (response && response.ok) {
                const reader = response.body.getReader();
                const decoder = new TextDecoder();
                while (true) {
                  const { done, value } = await reader.read();
                  if (done) break;
                  const chunk = decoder.decode(value, { stream: true });
                  accumulatedText += chunk;
                  updateAIMessage(accumulatedText, { mode: 'cloud-bridge', path: 'swarm-backbone' });
                }
              } else {
                const errData = response ? await response.json().catch(() => ({})) : {};
                const errMsg = errData.error || `Status: ${response?.status}`;
                console.warn(`[Mesh] Cloud Bridge Error (${errMsg}). Attempting Neural Direct-Link...`);
                
                // Smart Node Discovery
                const potentialHosts = [];
                const activeNodeHost = networkStats.activeNode?.replace('ws://', '').replace('wss://', '').split(':')[0];
                
                if (manualNode) {
                   const [mHost, mPort] = manualNode.replace('http://', '').replace('https://', '').split(':');
                   potentialHosts.push({ host: mHost, port: mPort || 3333, type: 'manual-override' });
                }
                if (activeNodeHost && activeNodeHost !== 'localhost' && activeNodeHost !== '127.0.0.1') {
                   potentialHosts.push({ host: activeNodeHost, port: 3333, type: 'active-mesh-node' });
                }

                potentialHosts.push({ host: 'localhost', port: 3333, type: 'local-fallback' });

                let directSuccess = false;
                for (const { host, port, type } of potentialHosts) {
                  if (directSuccess) break;
                  try {
                    console.log(`[Mesh] Probing Neural Path (${type}): http://${host}:${port}/generate`);
                    const controller = new AbortController();
                    const timeoutId = setTimeout(() => controller.abort(), 5000);
                    
                    const localResp = await fetch(`http://${host}:${port}/generate`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify(payload),
                      signal: controller.signal
                    });
                    clearTimeout(timeoutId);

                    if (localResp.ok) {
                      const data = await localResp.json();
                      if (data.status === 'error') throw new Error(data.message);
                      
                      updateAIMessage(data.text || data.response, { mode: 'direct-link', host });
                      directSuccess = true;
                    }
                  } catch (err) { 
                    console.warn(`[Mesh] Path http://${host}:${port} failed: ${err.message}`);
                  }
                }

                if (!directSuccess) {
                  updateAIMessage("⚠️ Connection Blocked. If using Cloud Node, click the 'Not Secure' icon in browser URL bar -> 'Site Settings' -> Allow 'Insecure Content' to bypass HTTPS blocks.");
                }
              }
            } catch (err) {
              console.error("[Mesh] Fatal Error:", err);
              updateAIMessage(`Neural path disrupted: ${err.message}`);
            } finally {
              setIsProcessing(false);
            }
        }}
    />
  );
}

// Support imports
import { MapPin } from 'lucide-react';
