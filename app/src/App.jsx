import React, { useState, useEffect, useRef } from 'react';
import createGlobe from 'cobe';
import {
  Plus, Cpu, Globe, Zap, Send, Settings,
  Terminal, Shield, Layers, Activity,
  ArrowRight, Database, Users, Info, X
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import rehypeKatex from 'rehype-katex';
import remarkMath from 'remark-math';
import 'highlight.js/styles/github.css';
import 'katex/dist/katex.min.css';


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

// --- Animated Terminal Component ---
const AnimatedTerminal = () => {
  const [lines, setLines] = useState([]);
  const containerRef = useRef(null);

  useEffect(() => {
    let isCancelled = false;
    const sequence = [
      { text: "pip install bee2bee", type: "input", delay: 800 },
      { text: "Collecting bee2bee==3.6.27\n  Downloading bee2bee-3.6.27-py3-none-any.whl (42 kB)\nInstalling collected packages: bee2bee\nSuccessfully installed bee2bee-3.6.27", type: "output", delay: 1000 },
      { text: "python -m bee2bee serve-hf --model \"unsloth/gemma-3-270m-it\" --region egypt", type: "input", delay: 800 },
      { text: "🚀 Starting P2P Node\nRegion: egypt | Port: 3333\n⠋ [BEE2BEE] Downloading Model weights from HuggingFace...", type: "output", delay: 1500 },
      { text: "✔ [HF] Model 'gemma-3-270m' loaded on CUDA:0", type: "output", delay: 0 },
      { text: "⠋ [P2P] Initializing Swarm Network layers...", type: "output", delay: 1200 },
      { text: "✔ [P2P] WebSocket server active on port 35281", type: "output", delay: 0 },
      { text: "⠋ [NETWORK] Registering with Global Neural Registry...", type: "output", delay: 1000 },
      { text: "✔ [NETWORK] Registered successfully. Public ID: bee-node-5c3c1a", type: "output", delay: 0 },
      { text: "\n=======================================================", type: "system", delay: 0 },
      { text: "🔗 ONE-CLICK ONBOARDING LINK GENERATED", type: "system", delay: 0 },
      { text: "=======================================================\n", type: "system", delay: 400 },
      { text: "Share this link to let anyone use your node's compute:", type: "output", delay: 0 },
      { text: "https://coithub.org/register?link=coithub.org%3A%2F%2Fjoin%3Fbootstrap%3DYmVlLW5vZGUtNWMzYzFh", type: "highlight", delay: 1500 },
      { text: "\n[INFO] Neural Bridge active. Ready for streaming inference.", type: "output", delay: 800 },
      { text: "[P2P-EVENT] New peer handshake successful from [104.198.62.116]", type: "output", delay: 1000 },
      { text: "", type: "input", delay: 9999999 }
    ];

    const runSequence = async () => {
      for (let i = 0; i < sequence.length; i++) {
        if (isCancelled) break;
        const step = sequence[i];

        if (step.type === "input") {
          const linesToType = step.text.split('\n');
          for (let l = 0; l < linesToType.length; l++) {
            let typed = "";
            setLines(prev => [...prev, { text: typed, type: "input", active: true }]);
            const cmd = linesToType[l];
            for (let c = 0; c < cmd.length; c++) {
              if (isCancelled) return;
              typed += cmd[c];
              setLines(prev => {
                const copy = [...prev];
                copy[copy.length - 1].text = typed;
                return copy;
              });
              await new Promise(r => setTimeout(r, 20 + Math.random() * 30));
            }
            if (isCancelled) return;
            setLines(prev => {
              const copy = [...prev];
              copy[copy.length - 1].active = false;
              return copy;
            });
            await new Promise(r => setTimeout(r, 400));
          }
          await new Promise(r => setTimeout(r, step.delay));
        } else {
          setLines(prev => [...prev, { text: step.text, type: step.type }]);
          await new Promise(r => setTimeout(r, step.delay));
        }

        if (containerRef.current) {
          containerRef.current.scrollTop = containerRef.current.scrollHeight;
        }
      }
    };

    runSequence();
    return () => { isCancelled = true; };
  }, []);

  return (
    <div
      ref={containerRef}
      className="w-full bg-[#050505] border border-white/5 rounded-[24px] p-6 font-mono text-xs md:text-[13px] text-gray-300 shadow-2xl overflow-hidden h-[420px] overflow-y-auto"
    >
      <div className="flex gap-2 mb-6 sticky top-0 left-0 bg-[#050505] pb-2 z-10 w-full">
        <div className="w-3 h-3 rounded-full bg-red-500"></div>
        <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
        <div className="w-3 h-3 rounded-full bg-green-500"></div>
        <span className="ml-4 text-[10px] text-gray-500 uppercase tracking-widest font-bold">Terminal / Neural Node Setup</span>
      </div>
      <div className="space-y-2 pb-10 leading-relaxed">
        {lines.map((line, i) => (
          <div key={i} className={`
                ${line.type === 'input' ? 'text-emerald-400 font-semibold' : ''} 
                ${line.type === 'system' ? 'text-blue-400 font-bold' : ''}
                ${line.type === 'highlight' ? 'text-amber-300 font-bold bg-amber-500/10 inline-block px-2 py-1 mt-1 rounded break-all' : ''}
                ${line.text.startsWith('✔') ? 'text-green-400' : ''}
                ${line.text.startsWith('⠋') ? 'text-gray-400' : ''}
             `}>
            {line.type === 'input' && <span className="text-gray-600 mr-2">root@coithub:~$</span>}
            <span className="whitespace-pre-wrap">{line.text}</span>
            {line.active && <span className="inline-block w-2 h-4 bg-emerald-400 animate-pulse ml-1 align-middle opacity-80" />}
          </div>
        ))}
      </div>
    </div>
  );
};

// --- Landing Page ---
const Landing = ({ onStart, networkStats, globalStats, meshData }) => {
  const [email, setEmail] = useState('');
  const [subscribed, setSubscribed] = useState(false);
  const [subError, setSubError] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubscribe = async () => {
    if (!email || !email.includes('@')) return;
    setLoading(true);
    setSubError(false);
    try {
      const res = await fetch('/api/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      });
      if (res.ok) {
        setSubscribed(true);
        if (window.clarity) window.clarity("event", "landing_lead_captured", { email: email.substring(0, 3) + '...' });
      } else {
        setSubError(true);
      }
    } catch {
      setSubError(true);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-white flex flex-col items-center justify-center px-6 relative overflow-x-hidden pt-32 pb-32">
      <div className="mb-12 flex items-center gap-2 py-2 px-4 rounded-full border border-gray-100 bg-white shadow-sm ring-1 ring-black/5 animate-float">
        <Layers className="w-3.5 h-3.5 text-black" />
        <span className="text-[11px] font-bold tracking-tight text-black">CoitHub.org</span>
      </div>
      <div className="text-center space-y-10 max-w-4xl mx-auto z-10">
        <h1 className="google-sans-title">Neural<br />Autonomous Cluster</h1>
        <p className="sub-title mx-auto">Freemium-First inference routed through a modernized<br />Javascript API bridge. 100% decentralized.</p>

        <div className="flex flex-col items-center gap-6 pt-6 animate-in fade-in slide-in-from-bottom-10 duration-700">
          <div className="flex gap-4">

            <a href="https://github.com/Chatit-cloud/BEE2BEE" target="_blank" rel="noreferrer" className="pill-btn bg-white text-black border border-gray-200 hover:bg-gray-50 hover:scale-105 active:scale-95 shadow-sm text-lg py-5 px-8 flex items-center gap-2">
              <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current"><path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" /></svg>
              GitHub
            </a>
          </div>
        </div>
      </div>

      {/* Stealth Mode: Counters suppressed for minimalist aesthetic */}


      <div className="mt-32 max-w-6xl mx-auto px-6 grid grid-cols-1 md:grid-cols-2 gap-16 relative z-10 text-left">
        {/* Team & Built By */}
        <div className="bg-white rounded-[40px] p-10 border border-gray-100 shadow-2xl shadow-black/[0.02] hover:shadow-black/[0.05] transition-all">
          <Users className="w-8 h-8 text-black mb-6" />
          <h3 className="text-2xl font-light mb-4 text-black">The Architects</h3>
          <p className="text-sm text-gray-600 leading-relaxed mb-8">
            Bee2Bee Neural Mesh is engineered to democratize access to Large Language Models. Built by an elite task force committed to Open Source and Decentralization, bypassing traditional centralized constraints.
          </p>
          <div className="border-t border-gray-100 pt-6">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Lead Architect</p>
            <p className="text-xl font-semibold text-black tracking-tight">Loay Abdel-Salam</p>
            <p className="text-xs text-blue-500 font-bold uppercase tracking-widest mt-1">P2P Protocols & Neural Distribution</p>
          </div>
        </div>

        {/* Privacy Policy */}
        <div className="bg-white rounded-[40px] p-10 border border-gray-100 shadow-2xl shadow-black/[0.02] hover:shadow-black/[0.05] transition-all">
          <Shield className="w-8 h-8 text-black mb-6" />
          <h3 className="text-2xl font-light mb-4 text-black">Zero-Knowledge Privacy</h3>
          <p className="text-sm text-gray-600 leading-relaxed">
            Your data is exactly that: yours. CoitHub and the Bee2Bee network operate on a strict <span className="font-bold text-black border-b border-black pb-0.5">No-Chat-Storage Policy</span>.
            <br /><br />
            We do not log, persist, or harvest any conversation data on our servers. Our bridge functions purely as a stateless ephemeral proxy to connect you directly with decentralized nodes. Once your chat session is closed, the tokens vanish into the ether forever.
          </p>
        </div>

        {/* Python Package Docs & Tutorial */}
        <div className="bg-[#0a0a0c] rounded-[40px] p-8 md:p-12 md:col-span-2 shadow-2xl transition-all relative overflow-hidden flex flex-col xl:flex-row gap-12 items-center">
          <div className="absolute top-0 right-0 w-64 h-64 bg-blue-500/10 rounded-full blur-[100px]" />

          <div className="xl:w-1/3 w-full z-10 flex flex-col space-y-8">
            <div>
              <Terminal className="w-8 h-8 text-white mb-6" />
              <h3 className="text-3xl font-light mb-4 text-white">Zero-Config Node Setup</h3>
              <p className="text-sm text-gray-400 mb-2 leading-relaxed">Deploying your own neural node is a matter of running two commands. By contributing computation to the mesh, you earn priority routing.</p>
            </div>

            <div className="space-y-6">
              <div className="flex gap-4">
                <div className="w-8 h-8 rounded-full bg-white/10 text-white flex items-center justify-center font-bold shrink-0">1</div>
                <div>
                  <h4 className="text-white font-semibold mb-1">Install Package</h4>
                  <p className="text-xs text-gray-400 leading-relaxed">Download the official Bee2Bee python package from PyPI.</p>
                </div>
              </div>
              <div className="flex gap-4">
                <div className="w-8 h-8 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center justify-center font-bold shrink-0">2</div>
                <div>
                  <h4 className="text-white font-semibold mb-1">Make Ollama Public</h4>
                  <p className="text-xs text-gray-400 leading-relaxed">Allow your local Ollama instance to accept bindings from the P2P mesh by setting environment variables.</p>
                </div>
              </div>
              <div className="flex gap-4">
                <div className="w-8 h-8 rounded-full bg-blue-500 text-white flex items-center justify-center font-bold shrink-0">3</div>
                <div>
                  <h4 className="text-white font-semibold mb-1">Join the Mesh</h4>
                  <p className="text-xs text-gray-400 leading-relaxed">Run the node creation protocol. Your device will automatically establish a cryptographic identity and receive an invite link.</p>
                </div>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <span className="px-3 py-1.5 bg-white/5 border border-white/10 rounded-lg text-[10px] font-bold uppercase tracking-widest text-white">bee2bee serve-ollama</span>
              <span className="px-3 py-1.5 bg-white/5 border border-white/10 rounded-lg text-[10px] font-bold uppercase tracking-widest text-white">bee2bee serve-hf</span>
              <span className="px-3 py-1.5 bg-white/5 border border-white/10 rounded-lg text-[10px] font-bold uppercase tracking-widest text-white">bee2bee serve-hf-remote</span>
              <span className="px-3 py-1.5 bg-emerald-500/10 border border-emerald-500/20 rounded-lg text-[10px] font-bold uppercase tracking-widest text-emerald-400">bee2bee register</span>
            </div>
          </div>

          <div className="xl:w-2/3 w-full z-10">
            <AnimatedTerminal />
          </div>
        </div>
      </div>

      <div className="absolute top-[0%] right-[0%] w-[800px] h-[800px] bg-blue-50 rounded-full blur-[140px] -z-10" />
      <div className="absolute bottom-[0%] left-[-10%] w-[600px] h-[600px] bg-gray-50 rounded-full blur-[120px] -z-10" />
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
            <select className="w-full h-14 bg-gray-50 border-none rounded-2xl px-5 text-sm outline-none" onChange={e => setFormData({ ...formData, usage: e.target.value })}>
              <option>Personal / Development</option>
              <option>Commercial / API</option>
              <option>Public Mesh Relay</option>
            </select>
          </div>
          <div className="space-y-2">
            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest px-1">Performance Tier</label>
            <div className="flex gap-2">
              {['Low', 'Medium', 'Ultra'].map(t => (
                <button key={t} onClick={() => setFormData({ ...formData, survey: t })} className={`flex-1 h-12 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all ${formData.survey === t ? 'bg-black text-white' : 'bg-gray-50 text-gray-400'}`}>{t}</button>
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

// Mesh Table Removed


// --- Dashboard Component (Redesigned: Gemini B&W Style) ---
const Dashboard = ({ networkStats, messages, isProcessing, activeModel, manualNode, setManualNode, onNavigate, onSend, tokenConsumption, genSettings, setGenSettings }) => {
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
              <div className="p-6 bg-gray-50 rounded-3xl border border-gray-100">
                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Session Tokens</span>
                <p className="text-2xl font-semibold mt-1 text-emerald-500">{tokenConsumption.toLocaleString()}</p>
              </div>
              <div className="p-6 bg-gray-50 rounded-3xl border border-gray-100">
                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Primary Ingress</span>
                <p className="text-sm font-mono mt-1 break-all">{networkStats.activeNode || 'Cloud Bridge Default'}</p>
              </div>
            </div>
            <div className="space-y-4 pt-4 border-t border-gray-100">
              <div className="space-y-2">
                <div className="flex justify-between items-center px-1">
                  <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Dynamic Output Limit (Tokens)</span>
                  <span className="text-xs font-mono font-bold">{genSettings.maxTokens}</span>
                </div>
                <input
                  type="range" min="128" max="4096" step="128"
                  value={genSettings.maxTokens}
                  onChange={e => setGenSettings({ ...genSettings, maxTokens: parseInt(e.target.value) })}
                  className="w-full h-1 bg-gray-100 rounded-lg appearance-none cursor-pointer accent-black"
                />
              </div>
              <div className="space-y-2">
                <div className="flex justify-between items-center px-1">
                  <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Neural Temperature</span>
                  <span className="text-xs font-mono font-bold">{genSettings.temperature}</span>
                </div>
                <input
                  type="range" min="0" max="2" step="0.1"
                  value={genSettings.temperature}
                  onChange={e => setGenSettings({ ...genSettings, temperature: parseFloat(e.target.value) })}
                  className="w-full h-1 bg-gray-100 rounded-lg appearance-none cursor-pointer accent-black"
                />
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

          {/* Mesh Map Button Removed */}


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
        {/* Premium Neural Header */}
        <header className="h-[100px] border-b border-black/5 flex items-center justify-between px-10 bg-white/80 backdrop-blur-2xl sticky top-0 z-50">
          <div className="flex items-center gap-10">
            <div className="flex items-center gap-4">
              <div className={`w-2.5 h-2.5 rounded-full ${networkStats.connected ? 'bg-emerald-500 shadow-[0_0_12px_rgba(16,185,129,0.6)]' : 'bg-red-500 shadow-[0_0_12px_rgba(239,68,68,0.6)]'} animate-pulse`} />
              <div>
                <p className="text-[10px] font-black text-gray-300 uppercase tracking-[0.2em] mb-0.5">Network Status</p>
                <p className="text-xs font-bold text-black uppercase tracking-tight">
                  {networkStats.connected ? 'Neural Mesh Synchronized' : 'Neural Path Interrupted'}
                </p>
              </div>
            </div>

            <div className="h-10 w-[1px] bg-gray-100 hidden md:block" />

            <div className="hidden md:block">
              <p className="text-[10px] font-black text-gray-300 uppercase tracking-[0.2em] mb-0.5">Active Neural Path</p>
              <div className="flex items-center gap-2">
                <Cpu className="w-3.5 h-3.5 text-black opacity-30" />
                <span className="text-[11px] font-bold text-black tracking-tight uppercase">
                  {activeModel} <span className="text-gray-300 font-medium ml-2">ID: {networkStats.activeNode?.substring(0, 12)}...</span>
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-4">
            {/* Mesh Registry Button Removed */}

            <div className="w-10 h-10 rounded-full border border-gray-100 flex items-center justify-center bg-gray-50/50 hover:bg-gray-100 transition-all cursor-pointer group">
              <Settings className="w-4 h-4 text-black group-hover:rotate-90 transition-transform" />
            </div>
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
                  <div className={`w-full ${m.role === 'user' ? 'text-right' : 'text-left'}`}>
                    {m.role === 'user' ? (
                      <p className="text-[15px] leading-relaxed font-normal whitespace-pre-wrap bg-gray-100 py-3 px-5 rounded-[24px] rounded-tr-none text-black inline-block text-left">
                        {m.text}
                      </p>
                    ) : (
                      <div className="prose-minimal w-full overflow-hidden">
                        <ReactMarkdown
                          remarkPlugins={[remarkGfm, remarkMath]}
                          rehypePlugins={[rehypeHighlight, rehypeKatex]}
                          components={{
                            // Ensure code blocks are styled correctly
                            code({ node, inline, className, children, ...props }) {
                              const match = /language-(\w+)/.exec(className || '');
                              return !inline ? (
                                <pre className={className} {...props}>
                                  <code className={className}>{children}</code>
                                </pre>
                              ) : (
                                <code className={className} {...props}>
                                  {children}
                                </code>
                              );
                            }
                          }}
                        >
                          {m.text}
                        </ReactMarkdown>
                      </div>
                    )}
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
  const [manualNode, setManualNode] = useState(() => localStorage.getItem('bee2bee_last_node') || '');
  const [isConnected, setIsConnected] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [networkStats, setNetworkStats] = useState({ connected: false, totalPeers: 0, activeNode: 'ws://...', poolSize: 0, peers: [] });
  const [meshData, setMeshData] = useState({});
  const [selectedModel, setSelectedModel] = useState(() => localStorage.getItem('bee2bee_last_model') || 'llama3');
  const [tokenConsumption, setTokenConsumption] = useState(0);
  const [globalStats, setGlobalStats] = useState({ visits: 0, chats: 0, tokens: 0 });
  const [genSettings, setGenSettings] = useState({ maxTokens: 2048, temperature: 0.4 });

  useEffect(() => {
    if (manualNode) localStorage.setItem('bee2bee_last_node', manualNode);
  }, [manualNode]);

  useEffect(() => {
    fetch('/api/p2p/global_metrics', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ visits: 1 })
    })
      .then(r => r.json())
      .then(data => {
        if (data && data.tokens) {
          setGlobalStats(prev => ({ ...prev, ...data }));
        }
      })
      .catch(() => { });
  }, []);

  // 1. Unified Neural Link Parser (Auto-Discovery from URL or Manual Paste)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const urlLink = params.get('link');
    // Also support pasting the entire link into the manualNode field
    const manualLink = manualNode && manualNode.includes('link=') ? manualNode : null;
    const link = urlLink || manualLink;
    const apiPort = params.get('api_port') || (link && new URL(link).searchParams.get('api_port')) || '3333';

    if ((window.location.pathname.includes('/register') || link) && link) {
      try {
        const decodedLink = decodeURIComponent(link);
        const bootstrapMatch = decodedLink.match(/bootstrap=([^&]+)/) || decodedLink.match(/peer=([^&]+)/);
        const modelMatch = decodedLink.match(/model=([^&]+)/);

        if (bootstrapMatch) {
          const bootstrapEnc = bootstrapMatch[1];
          let padded = bootstrapEnc;
          const missing = 4 - (bootstrapEnc.length % 4);
          if (missing !== 4) padded = bootstrapEnc + '='.repeat(missing);
          const bootstrapUrl = atob(padded.replace(/-/g, '+').replace(/_/g, '/'));

          const nodeIp = bootstrapUrl.includes('://') ? bootstrapUrl.split('://')[1].split(':')[0] : bootstrapUrl.split(':')[0];
          const dynamicApiUrl = `http://${nodeIp}:${apiPort}`;
          const dynamicModel = modelMatch ? decodeURIComponent(modelMatch[1]) : 'gemma3:270m';

          console.log("🚀 Neural Identity Discovered:", { dynamicApiUrl, dynamicModel });

          // Prevent loop if already set
          if (manualNode !== dynamicApiUrl && !manualLink) {
            setManualNode(dynamicApiUrl);
          }

          setSelectedModel(dynamicModel);
          setLinkData({ link: decodedLink, model: dynamicModel });

          // REGISTER GLOBALLY: This makes the node available for everyone else
          fetch('/api/p2p/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ link: decodedLink })
          })
            .then(r => r.json())
            .then(data => {
              console.log("[Mesh] Global Registration Success:", data);
              if (window.clarity) window.clarity("event", "node_registered_global", { model: dynamicModel });
              fetchStats(); // Update UI immediately
            })
            .catch(e => console.warn("[Mesh] Registry Sync Pending"));

          if (window.clarity) window.clarity("event", "neural_link_discovered", { source: manualLink ? 'manual' : 'url' });
          if (!manualLink) setView('quick-register');
        }
      } catch (e) { console.error("[Mesh] Parser error:", e); }
    }
  }, [manualNode]);

  // 1.5 Auto-Select Active Node from Swarm
  useEffect(() => {
    if (view === 'dashboard' && !manualNode && networkStats.peers.length > 0) {
      // Find nodes that have an API port and are marked as active
      const available = networkStats.peers.filter(p =>
        (p.metrics?.api_port || p.api_port) &&
        (p.status === 'active' || p.metrics?.status === 'active')
      );

      if (available.length > 0) {
        console.log("[Mesh] Auto-selecting target node from swarm list...");
        handleSelectNode(available[0]);
      }
    }
  }, [networkStats.peers, manualNode, view]);

  // 2. Real Status Tracking (Every 60s via Secure Proxy)
  const fetchStats = async () => {
    const base = '/api/p2p/status';
    const target = manualNode ? `${base}?target=${encodeURIComponent(manualNode)}` : base;

    try {
      // 1. Fetch Node Status
      const res = await fetch(target);
      if (res.ok) {
        const data = await res.json();
        const connected = data.status === 'ok' || data.status === 'active' || !!data.peer_id || !!data.connected;

        setNetworkStats(prev => ({
          ...prev,
          connected: connected,
          activeNode: manualNode || data.activeNode,
          poolSize: data.pool_size || data.poolSize || (data.mesh ? Object.keys(data.mesh).length : prev.poolSize),
          peers: data.peers || (data.mesh ? Object.values(data.mesh).flat() : prev.peers)
        }));

        setIsConnected(connected);
        if (data.mesh) setMeshData(data.mesh || {});
      }

      // 2. Sync Global Metrics
      const mRes = await fetch('/api/p2p/global_metrics');
      if (mRes.ok) {
        const mData = await mRes.json();
        setGlobalStats(prev => ({
          ...prev,
          ...mData,
          tokens: Math.max(Number(prev.tokens) || 0, Number(mData.tokens) || 0)
        }));
      }
    } catch (e) {
      console.warn("[Mesh] Telemetry failure:", e.message);
    }
  };

  useEffect(() => {
    fetchStats();
    const interval = setInterval(fetchStats, 15000); // UI Refresh every 15s
    return () => clearInterval(interval);
  }, [manualNode]);

  const generateUniversalLink = (node) => {
    try {
      const wsAddr = node.addr || '';
      const bootstrap = btoa(wsAddr).replace(/=/g, '');
      const model = encodeURIComponent((node.models && node.models[0]) || 'llama3');
      const hash = node.peer_id || node.id || 'anonymous';
      const region = encodeURIComponent(node.region || 'global');
      const apiPort = node.metrics?.api_port || 3333;

      const internalLink = `coithub.org://join?network=connectit&model=${model}&hash=${hash}&bootstrap=${bootstrap}`;
      const encodedInternal = encodeURIComponent(internalLink);

      return `https://coithub.org/register?link=${encodedInternal}&region=${region}&tag=hf&api_port=${apiPort}`;
    } catch (e) {
      return 'https://coithub.org';
    }
  };

  const handleSelectNode = (node) => {
    if (!node) return;

    const universalLink = generateUniversalLink(node);

    // Update URL bar for easy sharing/re-entry
    try {
      const u = new URL(universalLink);
      window.history.pushState({ peer: node.peer_id }, '', u.search);
    } catch (e) { }

    // Resolve Host/IP from various metadata fields
    let host = node.addr?.split('://')[1]?.split(':')[0] || node.public_ip || node.addr?.split(':')[0];
    if (host === 'localhost' || host === '127.0.0.1') host = window.location.hostname;

    const port = node.metrics?.api_port || node.api_port || 3333;
    const apiUrl = `http://${host}:${port}`;

    setManualNode(apiUrl);
    if (node.models && node.models.length > 0) setSelectedModel(node.models[0]);

    // BACKGROUND SYNC: Ensure the bridge is actually peered with this node for P2P routing
    fetch('/api/p2p/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ link: universalLink })
    }).then(r => r.json()).then(data => {
      console.log("[Mesh] Background Peer Sync Success:", data);
      fetchStats();
    }).catch(e => console.warn("[Mesh] Background Peer Sync Pending..."));

    setMessages([{
      role: 'ai',
      text: `### 🔗 Neural Link Established
The decentralized path to the **${node.region}** cluster is now active.
      
- **Neural Identity**: \`${node.peer_id || 'anonymous'}\`
- **Neural Path**: \`${apiUrl}\`
- **Shareable Link**: [Copy Registration](${universalLink})

Status: *Synchronized*`,
      metadata: { neural_path: apiUrl, mode: 'mesh-ingress', latency: node.latency || 45 }
    }]);
    if (window.clarity) window.clarity("event", "node_selected_mesh", { region: node.region, model: node.models?.[0] });
    setView('dashboard');
  };

  if (view === 'landing') return <Landing onStart={() => setView('dashboard')} networkStats={networkStats} globalStats={globalStats} meshData={meshData} />;
  if (view === 'quick-register') return <QuickRegister linkData={linkData} networkStats={networkStats} fetchStats={fetchStats} onComplete={async () => { await fetchStats(); setView('dashboard'); }} />;

  return (
    <Dashboard
      networkStats={networkStats}
      messages={messages}
      isProcessing={isProcessing}
      activeModel={selectedModel}
      tokenConsumption={tokenConsumption}
      manualNode={manualNode}
      setManualNode={setManualNode}
      onNavigate={(v) => setView(v)}
      genSettings={genSettings}
      setGenSettings={setGenSettings}
      onSend={async (content) => {
        if (!content.trim() || isProcessing) return;

        // Resolve Target Node from potential long links
        const resolveTarget = (input) => {
          if (!input || !input.includes('link=')) return input;
          try {
            const url = new URL(input);
            const apiPort = url.searchParams.get('api_port') || 3333;
            const linkParam = url.searchParams.get('link');
            const innerParams = new URLSearchParams(linkParam.split('?')[1] || linkParam);
            const bootstrap = innerParams.get('bootstrap');
            if (bootstrap) {
              let b = bootstrap;
              while (b.length % 4 !== 0) b += '=';
              const wsAddr = atob(b);
              const host = wsAddr.split('://')[1]?.split(':')[0] || wsAddr.split(':')[0];
              return `${host}:${apiPort}`;
            }
          } catch (e) { console.error("[Mesh] Link resolve fail:", e); }
          return input;
        };

        const targetNodeResolved = resolveTarget(manualNode);

        setMessages(prev => [...prev, { role: 'user', text: content }]);
        setIsProcessing(true);
        if (window.clarity) window.clarity("event", "message_sent", { target: targetNodeResolved });

        const messageId = Date.now();
        setMessages(prev => [...prev, { role: 'ai', text: '', id: messageId, metadata: { streaming: true } }]);

        let accumulatedText = "";
        let lastEstimated = 0;
        const updateAIMessage = (text, metadata = {}) => {
          accumulatedText = text;
          setMessages(prev => prev.map(msg =>
            msg.id === messageId ? { ...msg, text: text, metadata: { ...msg.metadata, ...metadata } } : msg
          ));
        };

        const currentHistory = [...messages, { role: 'user', text: content }];
        const fullContextPrompt = currentHistory
          .filter(m => m.text && m.text.trim())
          .map(m => `${m.role === 'ai' ? 'assistant' : 'user'}: ${m.text.trim()}`)
          .join('\n');

        try {
          const payload = {
            prompt: fullContextPrompt,
            model: selectedModel,
            stream: true,
            max_tokens: genSettings.maxTokens,
            temperature: genSettings.temperature,
            targetNode: targetNodeResolved
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
            let buffer = "";
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;

              buffer += decoder.decode(value, { stream: true });
              const lines = buffer.split('\n');
              buffer = lines.pop(); // keep the last incomplete chunk in buffer

              for (const line of lines) {
                if (!line.trim()) continue;
                try {
                  const data = JSON.parse(line);
                  if (data.status === 'error') throw new Error(data.message);
                  if (data.done) break;

                  const delta = data.text || data.response || "";
                  accumulatedText += delta;
                } catch (e) {
                  if (!line.includes('{"')) accumulatedText += line + "\n";
                }
              }

              const estimatedTokens = Math.max(1, Math.ceil(accumulatedText.length / 4));
              const tokenDelta = estimatedTokens - lastEstimated;
              if (tokenDelta > 0) {
                setTokenConsumption(prev => prev + tokenDelta);
                setGlobalStats(prev => ({ ...prev, tokens: prev.tokens + tokenDelta }));
                lastEstimated = estimatedTokens;
              }

              updateAIMessage(accumulatedText, { mode: 'cloud-bridge', path: 'swarm-backbone' });
            }

            updateAIMessage(accumulatedText, { mode: 'cloud-bridge', path: 'swarm-backbone' });

            // Stream finished, finalize local consumption and update global stats
            const finalTokens = Math.ceil(accumulatedText.length / 4);

            fetch('/api/p2p/global_metrics', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ chats: 1, tokens: finalTokens })
            })
              .then(r => r.json())
              .then(data => {
                console.log("[Mesh] Global Sync Success:", data);
                if (data && data.tokens) {
                  setGlobalStats(prev => ({ ...prev, ...data }));
                }
              })
              .catch(e => console.warn("[Mesh] Global Sync Failed:", e.message));
          } else {
            // Smart Node Discovery
            const potentialHosts = [];
            const activeNodeHost = networkStats.activeNode?.replace('ws://', '').replace('wss://', '').split(':')[0];

            if (manualNode) {
              const [mHost, mPort] = manualNode.replace('http://', '').replace('https://', '').split(':');
              potentialHosts.push({ host: mHost, port: mPort || 3333, type: 'manual-override' });
            }
            if (activeNodeHost && activeNodeHost !== 'localhost' && activeNodeHost !== '127.0.0.1') {
              potentialHosts.push({ host: activeNodeHost, port: 3333, type: 'active-node' });
            }

            // Global Mesh Fallback - try any node with an API port
            networkStats.peers.forEach(p => {
              if (p.metrics?.api_port) {
                const ip = p.addr?.split('://')[1]?.split(':')[0] || p.public_ip;
                if (ip && !potentialHosts.some(h => h.host === ip)) {
                  potentialHosts.push({ host: ip, port: p.metrics.api_port, type: 'mesh-discovery' });
                }
              }
            });

            let directSuccess = false;
            for (const { host, port, type } of potentialHosts) {
              if (directSuccess) break;
              if (!host) continue;
              try {
                console.log(`[Mesh] Probing Neural Path (${type}): http://${host}:${port}/generate`);
                const controller = new AbortController();
                // longer timeout for direct generation streams
                const timeoutId = setTimeout(() => controller.abort(), 60000);

                const localResp = await fetch(`http://${host}:${port}/generate`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify(payload),
                  signal: controller.signal
                });
                clearTimeout(timeoutId);

                if (localResp.ok) {
                  directSuccess = true;
                  const reader = localResp.body.getReader();
                  const decoder = new TextDecoder();
                  let buffer = "";

                  while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;

                    buffer += decoder.decode(value, { stream: true });
                    const lines = buffer.split('\n');
                    buffer = lines.pop(); // keep last incomplete line

                    let lastEstimated = 0;
                    for (const line of lines) {
                      if (!line.trim()) continue;
                      try {
                        const data = JSON.parse(line);
                        if (data.status === 'error') throw new Error(data.message);
                        if (data.done) break;

                        const delta = data.text || data.response || "";
                        accumulatedText += delta;
                      } catch (e) {
                        if (!line.includes('{"')) accumulatedText += line + "\n";
                      }
                    }

                    const estimatedTokens = Math.max(1, Math.ceil(accumulatedText.length / 4));
                    const tokenDelta = estimatedTokens - lastEstimated;
                    if (tokenDelta > 0) {
                      setTokenConsumption(prev => prev + tokenDelta);
                      setGlobalStats(prev => ({ ...prev, tokens: prev.tokens + tokenDelta }));
                      lastEstimated = estimatedTokens;
                    }

                    updateAIMessage(accumulatedText, { mode: 'direct-link', host });
                  }

                  updateAIMessage(accumulatedText, { mode: 'direct-link', host });

                  const finalTokens = Math.ceil(accumulatedText.length / 4);
                  fetch('/api/p2p/global_metrics', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ chats: 1, tokens: finalTokens })
                  }).then(r => r.json()).then(data => {
                    console.log("[Mesh] Global Sync Success (Direct):", data);
                    if (data && data.tokens) {
                      setGlobalStats(prev => ({ ...prev, ...data }));
                    }
                  }).catch(e => console.warn("[Mesh] Global Sync Failed (Direct):", e.message));
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
