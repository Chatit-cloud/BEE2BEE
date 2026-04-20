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
        <span className="text-[11px] font-bold tracking-tight text-black">CohitHub.org</span>
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
const QuickRegister = ({ linkData, onComplete }) => {
  const [formData, setFormData] = useState({ usage: 'Commercial', tags: 'gpu-node', survey: 'Fast' });
  const [step, setStep] = useState('form');

  const handleRegister = async () => {
    setStep('verifying');
    // Simulate verification
    setTimeout(() => setStep('monitoring'), 2000);
  };

  if (step === 'monitoring') {
    return (
      <div className="min-h-screen bg-black text-white p-10 flex flex-col items-center justify-center text-center">
        <Activity className="w-16 h-16 text-blue-500 animate-pulse mb-8" />
        <h2 className="text-3xl font-light mb-4 text-white">Live Node Monitor</h2>
        <div className="grid grid-cols-3 gap-8 w-full max-w-2xl mt-12">
           <div className="bg-white/5 p-6 rounded-3xl border border-white/10">
              <p className="text-[10px] uppercase tracking-widest text-gray-400 mb-2">Throughput</p>
              <p className="text-2xl font-mono">14.2 t/s</p>
           </div>
           <div className="bg-white/5 p-6 rounded-3xl border border-white/10">
              <p className="text-[10px] uppercase tracking-widest text-gray-400 mb-2">Memory</p>
              <p className="text-2xl font-mono">84%</p>
           </div>
           <div className="bg-white/5 p-6 rounded-3xl border border-white/10">
              <p className="text-[10px] uppercase tracking-widest text-gray-400 mb-2">Trust</p>
              <p className="text-2xl font-mono text-emerald-400">0.99</p>
           </div>
        </div>
        <button onClick={onComplete} className="mt-16 pill-btn bg-white text-black px-12">Enter Dashboard</button>
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
             <span className="text-sm font-bold tracking-tight">Bee2Bee Mesh</span>
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

// --- Dashboard Component (Restored) ---
const Dashboard = ({ networkStats, messages, isProcessing, onSend, onRegister }) => {
  const [input, setInput] = useState('');
  const messagesEndRef = useRef(null);
  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  return (
    <div className="flex h-screen bg-white text-[#202124] font-sans">
      <aside className="w-72 bg-[#f8f9fa] border-r border-[#dadce0] flex flex-col p-6">
        <div className="flex items-center gap-3 mb-10">
          <div className="w-10 h-10 bg-black rounded-xl flex items-center justify-center">
            <Layers className="w-5 h-5 text-white" />
          </div>
          <h1 className="font-bold text-lg">Bee2Bee</h1>
        </div>
        <div className="flex-1 space-y-6">
           <div className="p-4 bg-white border border-gray-100 rounded-2xl shadow-sm">
              <p className="text-[9px] font-bold text-gray-300 uppercase mb-2">Connected ID</p>
              <p className="text-[10px] font-mono truncate">{networkStats.activeNode}</p>
           </div>
           <div className="grid grid-cols-2 gap-3">
              <div className="bg-white border border-gray-100 rounded-2xl p-4 text-center">
                 <p className="text-xl font-bold">{networkStats.totalPeers}</p>
                 <p className="text-[9px] font-bold text-gray-300 uppercase">Peers</p>
              </div>
              <div className="bg-white border border-gray-100 rounded-2xl p-4 text-center">
                 <p className="text-xl font-bold">{networkStats.poolSize}</p>
                 <p className="text-[9px] font-bold text-gray-300 uppercase">Nodes</p>
              </div>
           </div>
        </div>
      </aside>
      <main className="flex-1 flex flex-col">
         <div className="w-full h-80 border-b border-gray-50 flex items-center justify-center relative bg-[#fafafa]">
            <NeuralMap peers={networkStats.peers} />
         </div>
         <div className="flex-1 overflow-y-auto px-10 py-10 space-y-8 no-scrollbar">
            {messages.map((m, i) => (
               <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-xl ${m.role === 'user' ? 'text-right' : 'text-left'}`}>
                     <p className={`text-2xl font-light ${m.role === 'user' ? 'text-black' : 'text-gray-400'}`}>{m.text}</p>
                  </div>
               </div>
            ))}
            <div ref={messagesEndRef} />
         </div>
         <div className="p-10 pt-0 flex gap-4 max-w-4xl mx-auto w-full">
            <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && onSend(input) && setInput('')}
               placeholder="Neural Query..." className="flex-1 h-16 bg-gray-100 rounded-3xl px-8 text-lg focus:outline-none focus:bg-white focus:ring-2 focus:ring-blue-100 transition-all" />
            <button onClick={() => { onSend(input); setInput(''); }} className="w-16 h-16 bg-black text-white rounded-2xl flex items-center justify-center"><Send className="w-6 h-6" /></button>
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

  useEffect(() => {
    // Check for deep link in URL
    const params = new URLSearchParams(window.location.search);
    const link = params.get('link');
    if (link) {
      const model = params.get('model') || 'Neural Node';
      setLinkData({ link, model });
      setView('quick-register');
    }

    const fetchStats = async () => {
      try {
        const [statsRes, meshRes] = await Promise.all([
          fetch('/api/p2p/status'),
          fetch('/api/p2p/mesh')
        ]);
        if (statsRes.ok) setNetworkStats(await statsRes.json());
        if (meshRes.ok) setMeshData(await meshRes.json());
      } catch { setNetworkStats(prev => ({ ...prev, connected: false })); }
    };
    const timer = setInterval(fetchStats, 3000);
    fetchStats();
    return () => clearInterval(timer);
  }, []);

  const handleSelectNode = (node) => {
    setMessages([{ 
      role: 'ai', 
      text: `Handshake successful with ${node.region} cluster. Real-time inference unlocked.`,
      metadata: { trust_score: 1.0, neural_path: node.addr }
    }]);
    setView('dashboard');
  };

  if (view === 'landing') return <Landing onStart={() => setView('mesh')} />;
  if (view === 'mesh') return <MeshExplorer meshData={meshData} onBack={() => setView('landing')} onSelectNode={handleSelectNode} />;
  if (view === 'quick-register') return <QuickRegister linkData={linkData} onComplete={() => setView('dashboard')} />;
  
  return (
    <Dashboard 
      networkStats={networkStats} 
      messages={messages} 
      isProcessing={isProcessing} 
      onSend={async (content) => {
          if (!content.trim() || isProcessing) return;
          setMessages(prev => [...prev, { role: 'user', text: content }]);
          setIsProcessing(true);
          try {
            const response = await fetch('/api/p2p/consensus', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ task: { prompt: content, model: 'glm-4.6:cloud' } })
            });
            const data = await response.json();
            setMessages(prev => [...prev, { role: 'ai', text: data.text || "Consensus failed.", metadata: data.metadata }]);
          } catch { 
            setMessages(prev => [...prev, { role: 'ai', text: "Link Failed.", metadata: { trust_score: 0 } }]); 
          } finally { setIsProcessing(false); }
      }}
    />
  );
}

// Support imports for new UI
import { MapPin } from 'lucide-react';
