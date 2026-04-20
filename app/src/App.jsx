import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
   MessageSquare, Settings, Send, Plus, ChevronRight, Cpu, Activity, Globe, Zap, Search,
   Command, Cloud, Layers, ArrowRight, Maximize2, Minimize2, X, Wifi, HardDrive,
   CheckCircle2, Users, Vote, ShieldCheck, CreditCard, History, Info
} from 'lucide-react';
import { Button } from './components/ui/button';
import { Input } from './components/ui/input';
import { Badge } from './components/ui/badge';
import { GlobeCdn } from './components/ui/globe-cdn';
import { supabase } from './lib/supabase';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import { b2b } from './api/index';

const TOKEN_COST_PER_1K = 0.002;

export default function App() {
   const [view, setView] = useState('landing');
   const [session, setSession] = useState(null);
   const [stats, setStats] = useState({ total_tokens: 0, total_chats: 0, total_users: 0 });
   const [peers, setPeers] = useState([]);
   const [selectedPeers, setSelectedPeers] = useState([]);
   const [userCountry, setUserCountry] = useState(localStorage.getItem("cohithub_country") || "");
   const [messages, setMessages] = useState([]);
   const [isBusy, setIsBusy] = useState(false);

   useEffect(() => {
      supabase.auth.getSession().then(({ data: { session } }) => setSession(session));
      supabase.auth.onAuthStateChange((_event, session) => setSession(session));

      const fetchStats = async () => {
         const { data } = await supabase.from('system_stats').select('*').single();
         if (data) setStats(data);
      };
      fetchStats();
      const interval = setInterval(fetchStats, 60000);
      return () => clearInterval(interval);
   }, []);

   const syncDiscovery = useCallback(async () => {
      try {
         // Use our complicated JS API to get the topology
         const data = await b2b.getTopology();
         
         if (data && data.mesh) {
            setPeers(data.mesh);
            
            // Auto-select optimal node if none selected
            if (selectedPeers.length === 0 && data.mesh.length > 0 && view !== 'landing') {
               const optimal = await b2b.findOptimalNode('phi3') || data.mesh[0];
               setSelectedPeers([optimal]);
            }
         }
      } catch (e) {
         console.warn("Registry sync pending via JS Bridge...");
      }
   }, [view, selectedPeers.length]);

   useEffect(() => {
      syncDiscovery();
   }, [syncDiscovery]);

   const handleSend = async (content) => {
      if (selectedPeers.length === 0) return;
      
      const userMsg = { role: 'user', text: content, ts: Date.now() };
      setMessages(prev => [...prev, userMsg]);
      setIsBusy(true);

      try {
         const node = selectedPeers[0];
         
         // Use the new JS Bridge for inference
         const data = await b2b.executeConsensus(content, {
            provider_id: node.peer_id,
            model: node.models[0]
         });

         const tokens = Math.ceil(data.result.text.length / 4);
         const aiMsg = {
            role: 'ai', 
            text: data.result.text, 
            ts: Date.now(), 
            tokens, 
            cost: (tokens / 1000) * TOKEN_COST_PER_1K,
            trust: data.metadata?.trust_score
         };
         
         setMessages(prev => [...prev, aiMsg]);

         if (session) {
            await supabase.from('messages').insert([
               { user_id: session.user.id, node_id: node.peer_id, content: userMsg.text, role: 'user' },
               { user_id: session.user.id, node_id: node.peer_id, content: aiMsg.text, role: 'assistant', tokens }
            ]);
         }
      } catch (e) {
         setMessages(prev => [...prev, { role: 'ai', text: `Consensus Error: ${e.message}`, ts: Date.now() }]);
      } finally {
         setIsBusy(false);
      }
   };

   const completeOnboarding = (country) => {
      setUserCountry(country);
      localStorage.setItem("cohithub_country", country);
      setView('map');
   };

   if (view === 'landing') return <Landing stats={stats} onStart={() => setView('onboarding')} />;
   if (view === 'onboarding') return <Onboarding onComplete={completeOnboarding} />;

   return (
      <div className="flex flex-col h-screen bg-white text-neutral-900 font-sans">
         <header className="h-16 px-8 flex items-center justify-between border-b border-neutral-100 bg-white/80 backdrop-blur-xl z-50">
            <div className="flex items-center gap-4 cursor-pointer" onClick={() => setView('map')}>
               <div className="w-8 h-8 rounded-lg bg-neutral-900 flex items-center justify-center shadow-sm">
                  <Layers className="w-4 h-4 text-white" />
               </div>
               <span className="font-medium tracking-tight text-neutral-800">CohitHub.org</span>
               {userCountry && <Badge variant="secondary" className="bg-neutral-50 text-neutral-500 font-normal border-transparent uppercase text-[9px] tracking-widest">{userCountry}</Badge>}
            </div>
            <div className="flex items-center gap-3">
               <div className="flex items-center gap-2 px-3 py-1 bg-green-50 rounded-full border border-green-100">
                  <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                  <span className="text-[10px] font-medium text-green-600 uppercase tracking-wider">JS-API Active</span>
               </div>
               <Button variant="ghost" size="sm" className="rounded-full text-neutral-400 hover:text-neutral-900">
                  <Settings className="w-4 h-4" />
               </Button>
               {session ? (
                  <div className="w-8 h-8 rounded-full bg-neutral-100 flex items-center justify-center text-[10px] font-medium uppercase border border-neutral-200">
                     {session.user.email?.[0]}
                  </div>
               ) : (
                  <Button size="sm" variant="outline" className="rounded-full px-4 h-8 text-[11px] font-medium">Log In</Button>
               )}
            </div>
         </header>

         <main className="flex-1 relative overflow-hidden bg-neutral-50/30">
            <AnimatePresence mode="wait">
               {view === 'map' ? (
                  <div className="h-full flex flex-col md:flex-row items-stretch">
                     <div className="w-full md:w-[400px] p-8 flex flex-col justify-center gap-6 border-r border-neutral-100 bg-white">
                        <div className="space-y-4">
                           <span className="text-[10px] font-medium uppercase tracking-[0.3em] text-neutral-300">P2P Network</span>
                           <h1 className="text-4xl font-light tracking-tight text-neutral-900 leading-tight">Decentralized<br />Compute Cluster</h1>
                           <p className="text-sm text-neutral-400 leading-relaxed font-light">Connected via Bee2Bee JS Bridge. Securely routing inference through the decentralized neural mesh.</p>
                        </div>
                        <div className="space-y-3">
                           <Button onClick={() => setView('chat')} className="w-full h-12 rounded-xl bg-neutral-900 text-white font-medium text-xs hover:bg-neutral-800 transition-colors shadow-sm">Initialize Session</Button>
                           <Button variant="outline" className="w-full h-12 rounded-xl text-neutral-400 text-xs border-neutral-100 font-medium bg-transparent" onClick={syncDiscovery}>Refresh Mesh</Button>
                        </div>
                        <div className="pt-6 border-t border-neutral-50">
                           <div className="text-[9px] font-medium text-neutral-200 uppercase tracking-widest mb-4">Optimized Node Selection</div>
                           <div className="space-y-2">
                              {selectedPeers.map(p => (
                                 <div key={p.peer_id} className="p-3 rounded-xl bg-neutral-50/50 border border-neutral-100 flex items-center justify-between group hover:bg-white hover:shadow-sm transition-all">
                                    <div className="flex flex-col">
                                       <div className="flex items-center gap-3">
                                          <Cpu className="w-3.5 h-3.5 text-neutral-300 group-hover:text-neutral-500" />
                                          <span className="text-[11px] font-medium text-neutral-900">{p.models?.[0] || 'Unknown'}</span>
                                       </div>
                                       <span className="text-[9px] text-neutral-300 mt-1 uppercase tracking-tight">{p.role || 'Peer'}</span>
                                    </div>
                                    <div className="flex flex-col items-end">
                                       <span className="text-[9px] font-mono text-neutral-400">{p.latency_ms?.toFixed(0)}ms</span>
                                       <span className="text-[8px] text-green-500 font-medium mt-1">{(p.reputation * 100).toFixed(1)}% Trust</span>
                                    </div>
                                 </div>
                              ))}
                           </div>
                        </div>
                     </div>
                     <div className="flex-1 relative bg-white">
                        <div className="absolute inset-0 grayscale opacity-20 pointer-events-none">
                           <GlobeCdn 
                              markers={peers.map(p => ({
                                 id: p.peer_id,
                                 location: p.location || [Math.random()*180-90, Math.random()*360-180],
                                 region: p.tag || 'Global'
                              }))} 
                           />
                        </div>
                        <div className="h-full w-full flex items-center justify-center p-20 pointer-events-none">
                           <div className="w-full max-w-lg aspect-square rounded-full border border-neutral-100 flex items-center justify-center relative">
                              <div className="absolute inset-0 rounded-full bg-neutral-50/10 blur-3xl animate-pulse" />
                              <div className="w-24 h-24 rounded-3xl bg-neutral-900 shadow-2xl flex items-center justify-center z-10 transition-transform hover:scale-110">
                                 <Activity className="w-8 h-8 text-white opacity-40" />
                              </div>
                           </div>
                        </div>
                     </div>
                  </div>
               ) : (
                  <Chat messages={messages} busy={isBusy} onSend={handleSend} />
               )}
            </AnimatePresence>
         </main>
      </div>
   );
}

const Landing = ({ stats, onStart }) => (
   <div className="h-screen bg-white flex flex-col font-sans overflow-hidden">
      <div className="h-20 flex items-center justify-center pt-8">
         <div className="flex items-center gap-3 py-2 px-4 rounded-full border border-neutral-100 bg-white/50 backdrop-blur-sm">
            <Layers className="w-4 h-4 text-neutral-900" />
            <span className="text-sm font-medium tracking-tight text-neutral-800">CohitHub.org</span>
         </div>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center px-12 text-center">
         <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }} className="max-w-xl">
            <h1 className="text-7xl font-light tracking-tight text-neutral-900 leading-[1.05] mb-8">
               Neural<br />Autonomous Cluster
            </h1>
            <p className="text-lg text-neutral-400 font-light leading-relaxed mb-12 px-12">
               Freemium-First inference routed through a modernized Javascript API bridge. 100% decentralized.
            </p>

            <div className="flex items-center justify-center gap-4 mb-20">
               <Button onClick={onStart} className="h-14 px-10 rounded-full bg-neutral-900 text-white font-medium text-xs tracking-widest uppercase hover:px-12 transition-all">Get Started</Button>
               <Button onClick={() => window.open('tel:+201211268396')} variant="ghost" className="h-14 px-8 rounded-full text-neutral-400 font-medium text-xs tracking-widest uppercase hover:bg-neutral-50">Contact Team</Button>
            </div>

            <div className="grid grid-cols-3 gap-12 pt-12 border-t border-neutral-50 px-8">
               <div className="flex flex-col">
                  <span className="text-2xl font-light text-neutral-900">{(stats.total_tokens / 1000).toFixed(1)}k</span>
                  <span className="text-[10px] font-medium uppercase tracking-widest text-neutral-300 mt-2">Tokens</span>
               </div>
               <div className="flex flex-col">
                  <span className="text-2xl font-light text-neutral-900">{stats.total_chats}</span>
                  <span className="text-[10px] font-medium uppercase tracking-widest text-neutral-300 mt-2">Chats</span>
               </div>
               <div className="flex flex-col">
                  <span className="text-2xl font-light text-neutral-900">{stats.total_users}</span>
                  <span className="text-[10px] font-medium uppercase tracking-widest text-neutral-300 mt-2">Users</span>
               </div>
            </div>
         </motion.div>
      </div>
   </div>
);

const Onboarding = ({ onComplete }) => (
   <div className="h-screen bg-white flex items-center justify-center p-12">
      <motion.div initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} className="w-full max-w-lg text-center">
         <h2 className="text-4xl font-light text-neutral-900 mb-4">Choose Your Proximity</h2>
         <p className="text-sm text-neutral-400 mb-12 font-light">Select a regional cluster for minimum latency and geographic compliance.</p>

         <div className="grid grid-cols-2 gap-3">
            {['EG', 'US', 'EU', ''].map(code => (
               <button key={code} onClick={() => onComplete(code)} className="p-8 rounded-3xl border border-neutral-100 bg-white hover:border-neutral-900 hover:shadow-xl hover:shadow-neutral-900/[0.03] transition-all group text-left">
                  <div className="text-xl font-medium text-neutral-900 mb-1 uppercase tracking-tight">{code || 'Global'}</div>
                  <div className="text-[10px] text-neutral-400 font-light uppercase tracking-widest">{code ? 'Local Hub' : 'Aggregated Mesh'}</div>
               </button>
            ))}
         </div>
      </motion.div>
   </div>
);

const Chat = ({ messages, busy, onSend }) => {
   const [input, setInput] = useState("");
   return (
      <div className="h-full flex flex-col bg-white">
         <div className="flex-1 overflow-y-auto px-12 py-16 space-y-12 max-w-3xl mx-auto w-full">
            {messages.length === 0 && (
               <div className="h-[40vh] flex flex-col items-center justify-center text-center space-y-4">
                  <div className="w-12 h-12 rounded-2xl bg-neutral-50 flex items-center justify-center mb-4"><Info className="w-5 h-5 text-neutral-300" /></div>
                  <h3 className="text-xl font-light text-neutral-400 tracking-tight">Active Neural Session</h3>
                  <p className="text-xs text-neutral-300 uppercase tracking-widest">Awaiting Direct Query</p>
               </div>
            )}
            {messages.map((m, i) => (
               <div key={i} className={cn("flex flex-col group", m.role === 'user' ? 'items-end' : 'items-start')}>
                  <div className={cn("text-2xl font-light leading-snug max-w-2xl px-2", m.role === 'user' ? 'text-neutral-900' : 'text-neutral-600')}>
                     {m.text}
                  </div>
                  {m.tokens && (
                    <div className="mt-4 flex gap-3">
                       <div className="px-4 py-1.5 rounded-full bg-neutral-50 text-[10px] font-medium text-neutral-300 uppercase tracking-widest opacity-0 group-hover:opacity-100 transition-opacity">
                         Generated {m.tokens} Tokens • ${m.cost?.toFixed(5)}
                       </div>
                       {m.trust && (
                         <div className="px-4 py-1.5 rounded-full bg-green-50 text-[10px] font-medium text-green-400 uppercase tracking-widest opacity-0 group-hover:opacity-100 transition-opacity">
                            {(m.trust * 100).toFixed(1)}% Consensus
                         </div>
                       )}
                    </div>
                  )}
               </div>
            ))}
            {busy && <div className="text-[10px] font-medium text-neutral-200 uppercase tracking-widest italic animate-pulse">Routing Consensus...</div>}
         </div>
         <div className="p-12 pt-0 max-w-3xl mx-auto w-full">
            <form className="relative" onSubmit={e => { e.preventDefault(); onSend(input); setInput(""); }}>
               <Input value={input} onChange={e => setInput(e.target.value)} placeholder="Send private message..." className="h-16 bg-neutral-50 border-transparent rounded-2xl px-6 text-sm font-light focus-visible:ring-1 focus-visible:ring-neutral-200" />
               <Button disabled={!input || busy} size="icon" className="absolute right-2 top-2 h-12 w-12 rounded-xl bg-neutral-900 text-white shadow-lg shadow-neutral-900/10 hover:scale-105"><Send className="w-4 h-4" /></Button>
            </form>
         </div>
      </div>
   );
}
