import React, { useState, useEffect } from 'react';
import { Activity, MessageSquare, Server, Settings, Shield, RefreshCw, Send, Plus, Network, X, Link, Globe, Minus, Square, Wifi } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import { getCurrentWindow } from '@tauri-apps/api/window';

// Default to Local API, but allow override
const DEFAULT_API = "http://127.0.0.1:4002";

type View = 'admin' | 'chat';

interface Peer {
  peer_id: string;
  addr: string;
  latency_ms: number;
  health_status: string;
  last_audit: number;
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
function minimizeWindow() {
  getCurrentWindow().minimize();
}

function maximizeWindow() {
  getCurrentWindow().maximize();
}

function closeWindow() {
  getCurrentWindow().close();
}

function App() {
  const [activeView, setActiveView] = useState<View>('admin');
  const [showConfig, setShowConfig] = useState(false);

  // Dynamic API Configuration
  const [apiUrl, setApiUrl] = useState(() => localStorage.getItem("connectit_api_url") || DEFAULT_API);

  const updateApiUrl = (url: string) => {
    // Remove trailing slash
    const cleanUrl = url.replace(/\/$/, "");
    setApiUrl(cleanUrl);
    localStorage.setItem("connectit_api_url", cleanUrl);
  }

  return (
    <div className="flex flex-col h-screen bg-background text-foreground overflow-hidden font-sans selection:bg-primary/30">
      {/* Background Effects */}
      <div className="absolute inset-0 bg-grid opacity-[0.2] pointer-events-none" />
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[500px] h-[300px] bg-primary/20 blur-[100px] rounded-full pointer-events-none" />

      {/* Custom Title Bar */}
      <div className="h-8 bg-card/30 border-b border-border/50 flex items-center justify-between px-4 select-none backdrop-blur-xl z-30" style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}>
        <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
          <Network className="w-4 h-4 text-primary" />
          <span>ConnectIT</span>
        </div>
        <div className="flex items-center gap-1" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
          <button
            onClick={() => minimizeWindow()}
            className="w-8 h-8 hover:bg-secondary/50 rounded flex items-center justify-center transition-colors"
            title="Minimize"
          >
            <Minus className="w-3 h-3" />
          </button>
          <button
            onClick={() => maximizeWindow()}
            className="w-8 h-8 hover:bg-secondary/50 rounded flex items-center justify-center transition-colors"
            title="Maximize"
          >
            <Square className="w-3 h-3" />
          </button>
          <button
            onClick={() => closeWindow()}
            className="w-8 h-8 hover:bg-red-500/20 hover:text-red-400 rounded flex items-center justify-center transition-colors"
            title="Close"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      </div>

      {/* Main Content Container */}
      <div className="flex flex-1 relative z-10 overflow-hidden">
        {/* Sidebar */}
        <aside className="w-64 border-r border-border bg-card/50 flex flex-col backdrop-blur-xl z-20 select-none">
          <div className="p-6 border-b border-border flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary to-purple-600 flex items-center justify-center shadow-lg shadow-primary/25">
              <Network className="w-5 h-5 text-white" />
            </div>
            <span className="font-bold text-xl tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white to-white/70">ConnectIT</span>
          </div>

          <nav className="flex-1 p-4 space-y-2">
            <Button variant={activeView === 'admin' ? 'secondary' : 'ghost'} className="w-full justify-start gap-3 h-11" onClick={() => setActiveView('admin')} >
              <Shield className="w-4 h-4" /> Network Admin
            </Button>
            <Button variant={activeView === 'chat' ? 'secondary' : 'ghost'} className="w-full justify-start gap-3 h-11" onClick={() => setActiveView('chat')} >
              <MessageSquare className="w-4 h-4" /> AI Chat
            </Button>
          </nav>

          <div className="p-4 border-t border-border bg-black/40">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2 text-sm text-green-400">
                <Globe className="w-3 h-3" />
                <span className="font-medium">Online</span>
              </div>
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setShowConfig(true)}>
                <Settings className="w-3 h-3" />
              </Button>
            </div>
            <div className="text-[10px] text-muted-foreground font-mono truncate" title={apiUrl}>
              API: {apiUrl.replace(/http:\/\/|https:\/\//, "")}
            </div>
          </div>
        </aside>

        {/* Main Content */}
        <main className="flex-1 flex flex-col overflow-hidden">
          <AnimatePresence mode='wait'>
            {activeView === 'admin' && <AdminView key="admin" apiUrl={apiUrl} onConfigure={() => setShowConfig(true)} />}
            {activeView === 'chat' && <ChatView key="chat" apiUrl={apiUrl} />}
          </AnimatePresence>
        </main>
      </div>

      {/* Config Modal */}
      <AnimatePresence>
        {showConfig && <ConfigModal onClose={() => setShowConfig(false)} apiUrl={apiUrl} setApiUrl={updateApiUrl} />}
      </AnimatePresence>
    </div>
  );
}

const ConfigModal = ({ onClose, apiUrl, setApiUrl }: { onClose: () => void, apiUrl: string, setApiUrl: (u: string) => void }) => {
  const [entryPoint, setEntryPoint] = useState("");
  const [localApiInput, setLocalApiInput] = useState(apiUrl);
  const [status, setStatus] = useState("");

  const handleConnect = async () => {
    if (!entryPoint) return;
    setStatus("Connecting to Peer...");
    try {
      const res = await fetch(`${apiUrl}/connect?addr=${encodeURIComponent(entryPoint)}`);
      const data = await res.json();
      if (data.status === 'connected') {
        setStatus("Connected to Mesh!");
        setTimeout(() => setStatus(""), 2000);
      } else {
        setStatus(`Error: ${data.message || 'Failed'}`);
      }
    } catch (e) {
      setStatus("API Error: Backend Unreachable");
    }
  }

  const handleSaveApi = () => {
    setApiUrl(localApiInput);
    setStatus("API URL Updated");
    setTimeout(() => setStatus(""), 1000);
  }

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-card border border-border w-full max-w-lg rounded-xl shadow-2xl overflow-hidden"
      >
        <div className="p-6 border-b border-border flex justify-between items-center">
          <h3 className="font-bold text-lg">System Configuration</h3>
          <Button variant="ghost" size="icon" onClick={onClose}><X className="w-4 h-4" /></Button>
        </div>
        <div className="p-6 space-y-6">

          {/* Section 1: Backend API */}
          <div className="space-y-3 pb-4 border-b border-border/50">
            <div className="flex items-center gap-2 mb-1">
              <Globe className="w-4 h-4 text-primary" />
              <label className="text-sm font-bold">Backend API URL</label>
            </div>
            <p className="text-xs text-muted-foreground mb-2">
              Control where the app sends commands. Use <code className="bg-secondary px-1 rounded">http://127.0.0.1:4002</code> for local, or an Ngrok HTTP URL for cloud.
            </p>
            <div className="flex gap-2">
              <Input
                value={localApiInput}
                onChange={e => setLocalApiInput(e.target.value)}
                placeholder="http://127.0.0.1:4002"
                className="font-mono text-xs"
              />
              <Button variant="secondary" onClick={handleSaveApi}>Set</Button>
            </div>
          </div>

          {/* Section 2: P2P Connection */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 mb-1">
              <Link className="w-4 h-4 text-primary" />
              <label className="text-sm font-bold">P2P Entry Point (Bootstrap)</label>
            </div>
            <div className="flex gap-2">
              <Input
                placeholder="ws://192.168.1.X:4003"
                value={entryPoint}
                onChange={e => setEntryPoint(e.target.value)}
                className="font-mono text-xs"
              />
              <Button onClick={handleConnect} disabled={!entryPoint}>Connect</Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Enter the WebSocket address of a known peer (e.g., from Colab) to join the network.
            </p>
          </div>

          {status && (
            <div className={cn("text-xs p-3 rounded font-medium border", status.includes("Error") ? "bg-red-500/10 border-red-500/20 text-red-400" : "bg-green-500/10 border-green-500/20 text-green-400")}>
              {status}
            </div>
          )}
        </div>
      </motion.div>
    </div>
  )
}

const AdminView = ({ onConfigure, apiUrl }: { onConfigure: () => void, apiUrl: string }) => {
  const [peers, setPeers] = useState<Peer[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  const fetchPeers = async () => {
    setLoading(true);
    setError(false);
    try {
      const res = await fetch(`${apiUrl}/peers`);
      const data = await res.json();
      setPeers(data);
    } catch (e) {
      console.error("Failed to fetch peers", e);
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPeers();
    const interval = setInterval(fetchPeers, 5000);
    return () => clearInterval(interval);
  }, [apiUrl]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="flex flex-col h-full overflow-hidden"
    >
      <div className="p-8 space-y-8 flex-1 overflow-y-auto">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-3xl font-bold tracking-tight">Network Overview</h2>
            <div className="flex items-center gap-2 text-muted-foreground text-sm mt-1">
              <div className={cn("w-2 h-2 rounded-full", error ? "bg-red-500" : "bg-green-500")} />
              Connected to {apiUrl}
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onConfigure}>
              <Plus className="w-4 h-4 mr-2" /> System Config
            </Button>
            <Button variant="outline" size="icon" onClick={fetchPeers} disabled={loading}>
              <RefreshCw className={cn("w-4 h-4", loading && "animate-spin")} />
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4">
          <StatsCard title="Active Peers" value={peers.length} icon={<Server className="w-4 h-4 text-blue-400" />} />
          <StatsCard title="Avg Latency" value={`${Math.round(peers.reduce((acc, p) => acc + (p.latency_ms || 0), 0) / (peers.length || 1))}ms`} icon={<Activity className="w-4 h-4 text-green-400" />} />
          <StatsCard title="Network Status" value={!error && peers.length > 0 ? "Healthy" : "Isolated"} icon={<Shield className={cn("w-4 h-4", !error && peers.length > 0 ? "text-primary" : "text-red-400")} />} />
        </div>

        <Card className="flex-1 border-border bg-card/50 backdrop-blur-sm shadow-xl">
          <CardHeader>
            <CardTitle className="text-lg font-medium flex items-center gap-2">
              <Network className="w-4 h-4" /> Connected Peers
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {error ? (
              <div className="text-center py-12 space-y-2">
                <div className="text-red-400 font-bold">Connection Failed</div>
                <p className="text-sm text-muted-foreground">Could not connect to API at {apiUrl}</p>
                <Button variant="outline" size="sm" onClick={onConfigure}>Change API URL</Button>
              </div>
            ) : peers.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center space-y-4">
                <div className="w-16 h-16 rounded-full bg-secondary/50 flex items-center justify-center">
                  <Server className="w-8 h-8 text-muted-foreground/50" />
                </div>
                <div>
                  <h3 className="font-semibold text-lg">No Peers Connected</h3>
                  <p className="text-muted-foreground text-sm max-w-[250px] mx-auto">Your node is running in isolation. Connect to an entry point to join the mesh.</p>
                </div>
                <Button onClick={onConfigure}>Connect to Entry Point</Button>
              </div>
            ) : (
              peers.map(peer => (
                <div key={peer.peer_id} className="flex items-center justify-between p-4 rounded-xl bg-secondary/30 border border-border/50 hover:bg-secondary/50 transition-all group">
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-medium text-sm text-foreground">{peer.peer_id.slice(0, 12)}...</span>
                      <Badge variant="outline" className={cn("text-[10px] h-5 px-1.5 uppercase border-0", peer.health_status === 'online' ? "bg-green-500/10 text-green-400" : "bg-red-500/10 text-red-400")}>{peer.health_status}</Badge>
                    </div>
                    <span className="text-xs text-muted-foreground font-mono">{peer.addr}</span>
                  </div>
                  <div className="flex items-center gap-4 relative group/metrics">
                    {/* Hover Card for Metrics */}
                    <div className="absolute bottom-full right-0 mb-2 w-48 p-3 rounded-lg bg-popover/90 backdrop-blur-md border border-border shadow-xl opacity-0 translate-y-2 group-hover/metrics:opacity-100 group-hover/metrics:translate-y-0 transition-all pointer-events-none z-50">
                      <div className="space-y-2">
                        <div className="flex items-center justify-between text-xs text-muted-foreground border-b border-white/10 pb-1 mb-1">
                          <span>System Health</span>
                          {peer.metrics ? <span className="text-green-400">Live</span> : <span className="text-amber-400">Waiting...</span>}
                        </div>

                        {peer.metrics ? (
                          <>
                            {/* CPU Detail */}
                            <div className="space-y-1">
                              <div className="flex justify-between text-[10px] uppercase font-mono tracking-wider text-muted-foreground">
                                <span>CPU</span>
                                <span>{peer.metrics.cpu_percent.toFixed(1)}%</span>
                              </div>
                              <div className="w-full h-1 bg-secondary rounded-full overflow-hidden">
                                <div
                                  className={cn("h-full rounded-full transition-all", peer.metrics.cpu_percent > 80 ? "bg-red-500" : "bg-blue-500")}
                                  style={{ width: `${Math.min(peer.metrics.cpu_percent, 100)}%` }}
                                />
                              </div>
                            </div>

                            {/* RAM Detail */}
                            <div className="space-y-1">
                              <div className="flex justify-between text-[10px] uppercase font-mono tracking-wider text-muted-foreground">
                                <span>RAM</span>
                                <span>{peer.metrics.ram_percent.toFixed(1)}%</span>
                              </div>
                              <div className="w-full h-1 bg-secondary rounded-full overflow-hidden">
                                <div
                                  className={cn("h-full rounded-full transition-all", peer.metrics.ram_percent > 80 ? "bg-red-500" : "bg-purple-500")}
                                  style={{ width: `${Math.min(peer.metrics.ram_percent, 100)}%` }}
                                />
                              </div>
                            </div>

                            {/* GPU Detail (Optional) */}
                            {peer.metrics.gpu_percent !== undefined && (
                              <div className="space-y-1">
                                <div className="flex justify-between text-[10px] uppercase font-mono tracking-wider text-muted-foreground">
                                  <span>GPU</span>
                                  <span>{peer.metrics.gpu_percent.toFixed(1)}%</span>
                                </div>
                                <div className="w-full h-1 bg-secondary rounded-full overflow-hidden">
                                  <div
                                    className={cn("h-full rounded-full transition-all", peer.metrics.gpu_percent > 80 ? "bg-red-500" : "bg-orange-500")}
                                    style={{ width: `${Math.min(peer.metrics.gpu_percent, 100)}%` }}
                                  />
                                </div>
                              </div>
                            )}
                          </>
                        ) : (
                          <div className="text-center py-2 text-xs text-muted-foreground italic">
                            Collecting metrics...
                          </div>
                        )}

                        {/* Latency Detail */}
                        <div className="pt-1 mt-1 border-t border-white/10 flex justify-between text-xs">
                          <span className="text-muted-foreground">Latency</span>
                          <span className="font-mono">{peer.latency_ms ? peer.latency_ms.toFixed(0) : '-'}ms</span>
                        </div>
                      </div>

                      {/* Arrow */}
                      <div className="absolute -bottom-1 right-6 w-2 h-2 bg-popover rotate-45 border-r border-b border-border"></div>
                    </div>

                    <div className="text-xs text-muted-foreground hidden group-hover:block">last seen: {Math.round((Date.now() - (peer.last_audit || Date.now())) / 1000)}s ago</div>

                    {/* Trigger Icon */}
                    <div className="flex items-center gap-2 cursor-help">
                      <Wifi className={cn("w-4 h-4 transition-colors",
                        !peer.latency_ms ? "text-muted-foreground/30" :
                          peer.latency_ms < 100 ? "text-green-500" :
                            peer.latency_ms < 300 ? "text-yellow-500" : "text-red-500"
                      )} />
                      <span className="font-mono text-sm">{peer.latency_ms ? peer.latency_ms.toFixed(0) : '-'}ms</span>
                    </div>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </motion.div>
  );
}

const ChatView = ({ apiUrl }: { apiUrl: string }) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [providerId, setProviderId] = useState("");
  const [providers, setProviders] = useState<any[]>([]);

  useEffect(() => {
    // Fetch providers on mount or when API URL changes
    fetch(`${apiUrl}/providers`).then(r => r.json()).then(data => {
      setProviders(data);
      if (data.length > 0) setProviderId(data[0].peer_id);
    }).catch(e => console.error(e));
  }, [apiUrl]);

  const handleSend = async () => {
    if (!input.trim() || !providerId) return;

    const userMsg = { role: 'user', text: input, ts: Date.now() };
    // @ts-ignore
    setMessages(prev => [...prev, userMsg]);
    setInput("");
    setSending(true);

    try {
      const res = await fetch(`${apiUrl}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider_id: providerId,
          prompt: userMsg.text,
          max_new_tokens: 64
        })
      });
      const data = await res.json();

      if (data.status === 'ok') {
        const aiMsg = { role: 'ai', text: data.result.text, ts: Date.now() };
        // @ts-ignore
        setMessages(prev => [...prev, aiMsg]);
      } else {
        const errMsg = { role: 'ai', text: `Error: ${data.message}`, ts: Date.now() };
        // @ts-ignore
        setMessages(prev => [...prev, errMsg]);
      }
    } catch (e) {
      const errMsg = { role: 'ai', text: `Connection Error`, ts: Date.now() };
      // @ts-ignore
      setMessages(prev => [...prev, errMsg]);
    } finally {
      setSending(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="flex flex-col h-full"
    >
      <div className="p-4 border-b border-border flex items-center justify-between bg-card/20 backdrop-blur z-10 sticky top-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-primary to-purple-600 flex items-center justify-center shadow-lg shadow-purple-500/20">
            <span className="font-bold text-white text-lg">Ai</span>
          </div>
          <div>
            <h3 className="font-bold text-lg">ConnectIT Intelligence</h3>
            {providers.length > 0 ? (
              <div className="flex items-center gap-1 text-xs text-green-400">
                <div className="w-1.5 h-1.5 rounded-full bg-green-400 shadow-[0_0_8px_rgba(74,222,128,0.5)]" />
                Connected to Network ({providers.length} nodes)
              </div>
            ) : (
              <div className="flex items-center gap-1 text-xs text-yellow-500">
                Looking for providers...
              </div>
            )}
          </div>
        </div>

        <select
          className="bg-secondary/50 border border-input text-xs rounded-lg px-3 py-2 outline-none focus:ring-1 focus:ring-primary/50 min-w-[200px]"
          value={providerId}
          onChange={e => setProviderId(e.target.value)}
        >
          {providers.length === 0 && <option>No Providers Available</option>}
          {providers.map(p => (
            <option key={p.peer_id} value={p.peer_id}>
              {p.models[0] || 'Unknown Model'} ({p.peer_id.slice(0, 6)})
            </option>
          ))}
        </select>
      </div>

      <div className="flex-1 bg-gradient-to-b from-black/5 to-black/20 p-4 space-y-6 overflow-y-auto scroll-smooth">
        {messages.length === 0 && (
          <div className="flex justify-center mt-32">
            <div className="bg-card/50 border border-border/50 rounded-2xl p-8 max-w-md text-center backdrop-blur shadow-xl">
              <MessageSquare className="w-10 h-10 mx-auto text-primary mb-4" />
              <h4 className="font-bold text-xl mb-2">Welcome to the Grid</h4>
              <p className="text-sm text-muted-foreground leading-relaxed">Select a provider from the network and start chatting securely via P2P. Your messages are routed directly to the node.</p>
            </div>
          </div>
        )}

        {messages.map((m, i) => (
          <div key={i} className={cn("flex w-full animate-in fade-in slide-in-from-bottom-2", m.role === 'user' ? 'justify-end' : 'justify-start')}>
            <div className={cn(
              "max-w-[80%] rounded-2xl px-5 py-3 text-sm shadow-md",
              m.role === 'user' ? "bg-primary text-primary-foreground rounded-tr-sm" : "bg-secondary text-secondary-foreground rounded-tl-sm"
            )}>
              <p className="leading-relaxed">{m.text}</p>
              <div className="text-[10px] opacity-50 mt-1 text-right font-mono">{new Date(m.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
            </div>
          </div>
        ))}
        {sending && (
          <div className="flex w-full justify-start">
            <div className="bg-secondary text-secondary-foreground rounded-2xl rounded-tl-sm px-4 py-3 text-sm flex items-center gap-1.5">
              <div className="w-1.5 h-1.5 bg-foreground/50 rounded-full animate-bounce [animation-delay:-0.3s]" />
              <div className="w-1.5 h-1.5 bg-foreground/50 rounded-full animate-bounce [animation-delay:-0.15s]" />
              <div className="w-1.5 h-1.5 bg-foreground/50 rounded-full animate-bounce" />
            </div>
          </div>
        )}
      </div>

      <div className="p-4 border-t border-border bg-card/40 backdrop-blur-md pb-6">
        <form
          className="flex gap-2 max-w-4xl mx-auto"
          onSubmit={(e) => { e.preventDefault(); handleSend(); }}
        >
          <Input
            placeholder="Type your message..."
            className="flex-1 bg-secondary/50 border-0 focus-visible:ring-1 focus-visible:ring-primary/50 text-base px-4 h-12 rounded-xl shadow-inner"
            value={input}
            onChange={e => setInput(e.target.value)}
            disabled={sending}
          />
          <Button size="icon" className="h-12 w-12 rounded-xl shadow-lg shadow-primary/20" disabled={sending || !providerId}>
            <Send className="w-5 h-5" />
          </Button>
        </form>
      </div>
    </motion.div>
  );
}

const StatsCard = ({ title, value, icon }: any) => (
  <Card className="bg-card/50 backdrop-blur-sm border-border">
    <CardContent className="p-6 flex items-center justify-between">
      <div>
        <p className="text-sm font-medium text-muted-foreground">{title}</p>
        <div className="text-2xl font-bold mt-1 tracking-tight">{value}</div>
      </div>
      <div className="w-10 h-10 rounded-xl bg-secondary/50 flex items-center justify-center">
        {icon}
      </div>
    </CardContent>
  </Card>
)

export default App;
