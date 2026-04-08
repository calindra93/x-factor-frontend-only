import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { invokeEdgeFunction } from "@/lib/invokeEdgeFunction";
import { supabaseClient } from "@/lib/supabaseClient";
import UndergroundEventWizard from "./UndergroundEventWizard";
import PerformanceSequence from "./PerformanceSequence";
import PostEventAftermath from "./PostEventAftermath";
import { REGIONS, catColors, typeKeyToDisplay, typeNameToKey, EVENT_TYPES } from "./soundburstData";

// ─── SETLIST SIZE MAP ─────────────────────────────────────────────────────────
const EVENT_SETLIST_SIZE = {
  open_mic: 1, radio: 1,
  showcase: 2, battle: 2, collab_night: 2,
  block_party: 3, listening_party: 3, festival_slot: 3,
};

// ─── DESIGN CONSTANTS ────────────────────────────────────────────────────────
const F = "'Interstate','Lucida Grande',sans-serif";

// ─── HELPERS ──────────────────────────────────────────────────────────────────
function HScroll({ children, gap=12 }) {
  return <div style={{display:"flex",gap,overflowX:"auto",paddingBottom:6,scrollbarWidth:"none"}}>{children}</div>;
}
function GenrePill({ label, active, onClick }) {
  return <button onClick={onClick} style={{flexShrink:0,padding:"6px 14px",borderRadius:20,background:active?"#60a5fa":"transparent",border:`1px solid ${active?"#60a5fa":"#2a2a2a"}`,color:active?"#fff":"#666",fontSize:12,fontWeight:active?700:400,cursor:"pointer",fontFamily:F,whiteSpace:"nowrap"}}>{label}</button>;
}
function SectionHead({ title, count, accent }) {
  return (
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
      <div style={{display:"flex",alignItems:"center",gap:8}}>
        <div style={{width:3,height:16,borderRadius:2,background:accent}}/>
        <span style={{fontSize:15,fontWeight:700,color:"#fff",fontFamily:F}}>{title}</span>
        {count!=null&&<span style={{fontSize:11,color:"#555",background:"#1a1a1a",border:"1px solid #222",borderRadius:10,padding:"1px 7px"}}>{count}</span>}
      </div>
      <span style={{fontSize:12,color:"#555",cursor:"pointer"}}>See all</span>
    </div>
  );
}
function ListRow({ ev, badge, badgeColor, badgeBg }) {
  const display = typeKeyToDisplay[ev.event_type] || ev.event_type || "";
  const cc = catColors[display]||"#ff5500";
  return (
    <div style={{display:"flex",alignItems:"center",gap:12,padding:"10px 0",borderBottom:"1px solid #1a1a1a"}}>
      <div style={{width:44,height:44,borderRadius:4,background:`linear-gradient(135deg,${cc}44,#111)`,border:`1px solid ${cc}33`,flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center"}}>
        <div style={{width:10,height:10,borderRadius:"50%",background:cc}}/>
      </div>
      <div style={{flex:1,minWidth:0}}>
        <div style={{fontSize:13,fontWeight:600,color:"#e0e0e0",fontFamily:F,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{ev.title || ev.event_name}</div>
        <div style={{fontSize:11,color:"#555",marginTop:1}}>{ev.city}{ev.when?` · ${ev.when}`:""}{display?` · ${display}`:""}</div>
      </div>
      {badge&&<span style={{fontSize:10,fontWeight:700,padding:"3px 8px",borderRadius:3,background:badgeBg||"#222",color:badgeColor||"#888",flexShrink:0,textTransform:"uppercase",letterSpacing:"0.06em"}}>{badge}</span>}
      {(ev.compensation||ev.gross_revenue)!=null&&<span style={{fontSize:12,color:"#22c55e",fontWeight:700,flexShrink:0}}>${(ev.compensation||ev.gross_revenue||0).toLocaleString()}</span>}
    </div>
  );
}

// ─── AMBIENT CANVAS ───────────────────────────────────────────────────────────
function AmbientCanvas() {
  const ref = useRef(null);
  useEffect(() => {
    const c = ref.current; if(!c) return;
    const ctx = c.getContext("2d");
    let W, H, raf;
    const orbs = [
      {x:0.2,y:0.3,r:0.55,spd:0.00018,ang:0.4,hue:[260,200],sat:80,lit:18},
      {x:0.7,y:0.6,r:0.50,spd:0.00014,ang:2.1,hue:[15,340],sat:90,lit:16},
      {x:0.5,y:0.1,r:0.40,spd:0.00022,ang:1.0,hue:[180,220],sat:70,lit:14},
      {x:0.1,y:0.8,r:0.38,spd:0.00016,ang:3.5,hue:[300,260],sat:75,lit:15},
      {x:0.85,y:0.2,r:0.42,spd:0.00020,ang:5.2,hue:[20,50],sat:85,lit:17},
    ];
    const resize = () => { W = c.width = c.offsetWidth; H = c.height = c.offsetHeight; };
    const lerp = (a,b,t) => a+(b-a)*t;
    const draw = (ts) => {
      const t = ts*0.001;
      ctx.fillStyle="#060608"; ctx.fillRect(0,0,W,H);
      orbs.forEach(o=>{
        const cx=(o.x+Math.cos(o.ang+t*o.spd*1000)*0.22)*W;
        const cy=(o.y+Math.sin(o.ang*1.3+t*o.spd*800)*0.18)*H;
        const r=o.r*Math.max(W,H); const pulse=1+0.08*Math.sin(t*o.spd*3000);
        const hS=Math.sin(t*0.04)*20;
        const g=ctx.createRadialGradient(cx,cy,0,cx,cy,r*pulse);
        g.addColorStop(0,`hsla(${o.hue[0]+hS},${o.sat}%,${o.lit+8}%,0.55)`);
        g.addColorStop(0.4,`hsla(${lerp(o.hue[0],o.hue[1],0.5)+hS},${o.sat-10}%,${o.lit+4}%,0.3)`);
        g.addColorStop(1,`hsla(${o.hue[1]+hS},${o.sat}%,${o.lit}%,0)`);
        ctx.globalCompositeOperation="screen"; ctx.fillStyle=g;
        ctx.beginPath(); ctx.ellipse(cx,cy,r*pulse,r*pulse*0.75,o.ang*0.2+t*0.02,0,Math.PI*2); ctx.fill();
      });
      ctx.globalCompositeOperation="source-over";
      raf=requestAnimationFrame(draw);
    };
    resize(); window.addEventListener("resize",resize);
    raf=requestAnimationFrame(draw);
    return()=>{cancelAnimationFrame(raf);window.removeEventListener("resize",resize);};
  },[]);
  return <canvas ref={ref} style={{position:"absolute",inset:0,width:"100%",height:"100%",display:"block",zIndex:0}}/>;
}

// ─── CARD ART ─────────────────────────────────────────────────────────────────
function CardArt({ color, type, imageUrl, size=160, full=false }) {
  if (imageUrl) return <img src={imageUrl} alt="" style={{width:full?"100%":size,height:full?"100%":size,objectFit:"cover",display:"block",flexShrink:0}}/>;
  const bars = [18,28,22,35,20,30,16];
  const blocks = [20,32,45,28,15];
  const art = {
    "Battle":(<g><polygon points="50,14 87,80 13,80" fill="none" stroke={color} strokeWidth="1.5" strokeOpacity="0.4"/><polygon points="50,30 72,70 28,70" fill={color} fillOpacity="0.1"/><line x1="50" y1="18" x2="50" y2="78" stroke={color} strokeWidth="0.5" strokeOpacity="0.2"/></g>),
    "Showcase":(<g><circle cx="50" cy="50" r="35" fill="none" stroke={color} strokeWidth="0.8" strokeOpacity="0.25"/><circle cx="50" cy="50" r="24" fill="none" stroke={color} strokeWidth="1" strokeOpacity="0.3"/><circle cx="50" cy="50" r="10" fill={color} fillOpacity="0.2"/><circle cx="50" cy="50" r="4" fill={color} fillOpacity="0.5"/></g>),
    "Open Mic":(<g>{bars.map((h,i)=><rect key={i} x={16+i*10} y={56-h} width="7" height={h} fill={color} fillOpacity="0.3" rx="2"/>)}</g>),
    "Collab Night":(<g><circle cx="38" cy="50" r="22" fill="none" stroke={color} strokeWidth="1.5" strokeOpacity="0.3"/><circle cx="62" cy="50" r="22" fill="none" stroke={color} strokeWidth="1.5" strokeOpacity="0.3"/><path d="M50,30 Q64,50 50,70 Q36,50 50,30" fill={color} fillOpacity="0.12"/></g>),
    "Block Party":(<g>{blocks.map((h,i)=><rect key={i} x={13+i*16} y={72-h} width="12" height={h} fill={color} fillOpacity="0.25" rx="1"/>)}<line x1="8" y1="72" x2="92" y2="72" stroke={color} strokeWidth="0.5" strokeOpacity="0.2"/></g>),
    "Listening Party":(<g><circle cx="50" cy="50" r="34" fill="none" stroke={color} strokeWidth="0.8" strokeOpacity="0.2"/><circle cx="50" cy="50" r="24" fill="none" stroke={color} strokeWidth="1" strokeOpacity="0.25"/><circle cx="50" cy="50" r="14" fill="none" stroke={color} strokeWidth="1.5" strokeOpacity="0.35"/><circle cx="50" cy="50" r="5" fill={color} fillOpacity="0.5"/></g>),
  };
  const w = full ? "100%" : size, h = full ? "100%" : size;
  return (
    <div style={{width:w,height:h,borderRadius:full?0:4,flexShrink:0,background:`linear-gradient(155deg,${color}28 0%,#070707 75%,${color}0d 100%)`,position:"relative",overflow:"hidden"}}>
      <div style={{position:"absolute",inset:0,backgroundImage:`repeating-linear-gradient(-45deg,transparent,transparent 12px,${color}06 12px,${color}06 13px)`}}/>
      <svg viewBox="0 0 100 100" style={{position:"absolute",inset:0,width:"100%",height:"100%"}}>
        {art[type]||art["Showcase"]}
      </svg>
    </div>
  );
}

// ─── HERO BANNER ──────────────────────────────────────────────────────────────
function HeroBanner({ region, city, playerStats, onRegionClick, onTimeClick, timeLabel }) {
  return (
    <div style={{position:"relative",width:"100%",overflow:"hidden",minHeight:210}}>
      <AmbientCanvas/>
      <div style={{position:"absolute",inset:0,background:"linear-gradient(to bottom,rgba(0,0,0,0.1) 0%,rgba(0,0,0,0.65) 100%)",zIndex:1}}/>
      <div style={{position:"absolute",inset:0,backgroundImage:"repeating-linear-gradient(0deg,transparent,transparent 2px,rgba(0,0,0,0.06) 2px,rgba(0,0,0,0.06) 4px)",pointerEvents:"none",zIndex:2}}/>
      <div style={{position:"relative",padding:"28px 16px 22px",zIndex:3}}>
        <div style={{fontSize:11,letterSpacing:"0.18em",color:"rgba(255,255,255,0.5)",fontWeight:300,marginBottom:6,textTransform:"uppercase",fontFamily:F}}>● Signal detected</div>
        <h2 style={{fontSize:28,fontWeight:300,color:"#fff",margin:"0 0 4px",fontFamily:F,letterSpacing:"-0.01em",lineHeight:1.1}}>Events near you</h2>
        <p style={{fontSize:14,color:"rgba(255,255,255,0.7)",margin:"0 0 18px",fontFamily:F,fontWeight:300}}>
          Events in <strong style={{color:"#fff",fontWeight:600}}>{city||region}</strong>
        </p>
        <div style={{display:"flex",gap:8}}>
          <button onClick={onRegionClick} style={{background:"rgba(255,255,255,0.15)",border:"1px solid rgba(255,255,255,0.45)",borderRadius:4,padding:"7px 14px",color:"#fff",fontSize:11,fontWeight:700,letterSpacing:"0.1em",cursor:"pointer",textTransform:"uppercase",fontFamily:F}}>{REGIONS[region]?.short||region}</button>
          <button onClick={onTimeClick} style={{background:"rgba(255,255,255,0.15)",border:"1px solid rgba(255,255,255,0.45)",borderRadius:4,padding:"7px 14px",color:"#fff",fontSize:11,fontWeight:700,letterSpacing:"0.1em",cursor:"pointer",textTransform:"uppercase",fontFamily:F}}>{timeLabel}</button>
        </div>
        <div style={{display:"flex",gap:16,marginTop:18,paddingTop:14,borderTop:"1px solid rgba(255,255,255,0.1)"}}>
          {[["Scene",playerStats.sceneTier,"rgba(167,139,250,0.9)"],["Points",playerStats.scenePoints,"rgba(255,255,255,0.9)"],["Heat",`${playerStats.undergroundHeat}°`,"rgba(251,146,60,0.9)"],["Permit",playerStats.permitStatus,"rgba(34,197,94,0.9)"]].map(([l,v,c])=>(
            <div key={l}>
              <div style={{fontSize:9,color:"rgba(255,255,255,0.4)",textTransform:"uppercase",letterSpacing:"0.12em"}}>{l}</div>
              <div style={{fontSize:14,fontWeight:700,color:c,marginTop:2,textTransform:"capitalize"}}>{v}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── EVENT CARD ───────────────────────────────────────────────────────────────
function EventCard({ ev, onOpen }) {
  const display = typeKeyToDisplay[ev.event_type] || ev.event_type || "Showcase";
  const cc = catColors[display]||"#ff5500";
  const riskPct = Math.round((ev.metadata?.underground_projection?.detection_risk || 0) * 100);
  const pay = ev.compensation || ev.gross_revenue || 0;
  const clout = ev.clout_gained || ev.metadata?.underground_projection?.expected_attendance || 0;
  return (
    <div onClick={()=>onOpen(ev)} style={{flex:"0 0 auto",width:160,cursor:"pointer",transition:"opacity 0.15s"}}
      onMouseEnter={e=>e.currentTarget.style.opacity="0.8"} onMouseLeave={e=>e.currentTarget.style.opacity="1"}>
      <div style={{position:"relative",borderRadius:4,overflow:"hidden"}}>
        <CardArt color={cc} type={display} imageUrl={ev.thumbnail_url||null} size={160}/>
        <div style={{position:"absolute",top:8,right:8,background:"rgba(0,0,0,0.72)",borderRadius:3,padding:"2px 6px",fontSize:9,color:riskPct>5?"#ef4444":riskPct>2?"#f59e0b":"#22c55e",fontWeight:700}}>{riskPct}% risk</div>
        <div style={{position:"absolute",bottom:8,left:8,background:cc,borderRadius:3,padding:"2px 7px",fontSize:9,color:"#fff",fontWeight:700,textTransform:"uppercase",letterSpacing:"0.06em"}}>{display}</div>
      </div>
      <div style={{marginTop:8}}>
        <div style={{fontSize:13,fontWeight:600,color:"#fff",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",fontFamily:F}}>{ev.title || ev.event_name}</div>
        <div style={{fontSize:11,color:"#666",marginTop:2}}>{ev.venue}</div>
        <div style={{fontSize:11,color:"#555"}}>{ev.city}</div>
        <div style={{display:"flex",gap:8,marginTop:5,fontSize:11}}>
          {pay>0&&<span style={{color:"#22c55e",fontWeight:700}}>${pay.toLocaleString()}</span>}
          {clout>0&&<span style={{color:"#555"}}>★ {clout}</span>}
        </div>
      </div>
    </div>
  );
}

// ─── EVENT MODAL ──────────────────────────────────────────────────────────────
function EventModal({ ev, onClose, onAttend, onPerform, actionLoading }) {
  if(!ev) return null;
  const display = typeKeyToDisplay[ev.event_type] || ev.event_type || "Showcase";
  const cc=catColors[display]||"#ff5500";
  const proj = ev.metadata?.underground_projection || {};
  const pay = ev.compensation || ev.gross_revenue || 0;
  const att = proj.expected_attendance || ev.capacity || 0;
  const fame = ev.fame_gained || Math.floor(att * 0.15) || 0;
  const clout = ev.clout_gained || Math.floor(att * 0.25) || 0;
  const vibe = proj.vibe_score || 0;
  const riskPct = Math.round((proj.detection_risk || 0) * 100);
  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.88)",zIndex:300,display:"flex",alignItems:"flex-end",justifyContent:"center"}} onClick={onClose}>
      <div onClick={e=>e.stopPropagation()} style={{background:"#111",border:"1px solid #222",borderRadius:"14px 14px 0 0",padding:"0 0 32px",width:"100%",maxWidth:480,maxHeight:"88vh",overflow:"auto"}}>
        <div style={{width:36,height:4,borderRadius:2,background:"#2a2a2a",margin:"14px auto 0"}}/>
        <div style={{width:"100%",height:160,position:"relative",overflow:"hidden"}}>
          <CardArt color={cc} type={display} imageUrl={ev.thumbnail_url||null} size={480} full/>
          <div style={{position:"absolute",inset:0,background:"linear-gradient(to top,#111 0%,transparent 55%)"}}/>
          <div style={{position:"absolute",bottom:0,left:0,padding:"16px"}}>
            <div style={{fontSize:10,color:cc,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.12em",marginBottom:4}}>{display}</div>
            <div style={{fontSize:18,fontWeight:700,color:"#fff",fontFamily:F}}>{ev.title||ev.event_name}</div>
            <div style={{fontSize:12,color:"#888",marginTop:2}}>{ev.venue} · {ev.city}</div>
          </div>
        </div>
        <div style={{padding:"16px"}}>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr",gap:8,marginBottom:14}}>
            {[["Pay",`$${pay.toLocaleString()}`,"#22c55e"],["~Att",att,"#f0f0f0"],["Fame",`+${fame}`,"#a78bfa"],["Clout",`★${clout}`,"#f59e0b"]].map(([l,v,c])=>(
              <div key={l} style={{background:"#1a1a1a",borderRadius:6,padding:"10px 6px",textAlign:"center",border:"1px solid #222"}}>
                <div style={{fontSize:9,color:"#555",textTransform:"uppercase",letterSpacing:"0.1em"}}>{l}</div>
                <div style={{fontSize:15,fontWeight:700,color:c,marginTop:3}}>{v}</div>
              </div>
            ))}
          </div>
          <div style={{display:"flex",gap:8,marginBottom:14}}>
            <div style={{flex:1,background:"#1a1a1a",border:"1px solid #222",borderRadius:6,padding:"8px 10px"}}>
              <div style={{fontSize:9,color:"#555",textTransform:"uppercase",letterSpacing:"0.1em"}}>Vibe</div>
              <div style={{fontSize:13,color:"#aaa",marginTop:3}}>{vibe}</div>
            </div>
            <div style={{flex:1,background:"#1a1a1a",border:"1px solid #222",borderRadius:6,padding:"8px 10px"}}>
              <div style={{fontSize:9,color:"#555",textTransform:"uppercase",letterSpacing:"0.1em"}}>Risk</div>
              <div style={{fontSize:13,color:riskPct>5?"#ef4444":riskPct>2?"#f59e0b":"#22c55e",marginTop:3,fontWeight:700}}>{riskPct}%</div>
            </div>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
            <button onClick={()=>onAttend(ev.id)} disabled={!!actionLoading} style={{padding:"13px",borderRadius:6,background:"#1a1a1a",border:"1px solid #333",color:"#f0f0f0",fontSize:13,fontWeight:600,cursor:actionLoading?"default":"pointer",opacity:actionLoading?0.5:1}}>
              {actionLoading===`book-${ev.id}`?"Booking...":"Attend"}
            </button>
            <button onClick={()=>onPerform(ev.id)} disabled={!!actionLoading} style={{padding:"13px",borderRadius:6,background:cc,border:"none",color:"#fff",fontSize:13,fontWeight:700,cursor:actionLoading?"default":"pointer",opacity:actionLoading?0.5:1}}>
              {actionLoading===`perform-${ev.id}`?"Setting up...":"Perform"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── SONG PICKER MODAL ────────────────────────────────────────────────────────
function SongPickerModal({ event, songs, loading, onConfirm, onClose }) {
  const maxSongs = EVENT_SETLIST_SIZE[event?.event_type] || 1;
  const [selected, setSelected] = useState([]);
  const F2 = "'Interstate','Lucida Grande',sans-serif";

  const toggle = (song) => {
    setSelected(prev => {
      if (prev.find(s => s.id === song.id)) return prev.filter(s => s.id !== song.id);
      if (prev.length >= maxSongs) return [...prev.slice(1), song]; // replace oldest
      return [...prev, song];
    });
  };

  const typeLabel = event?.event_type?.replace(/_/g, ' ') || 'event';

  return (
    <div style={{position:"fixed",inset:0,zIndex:120,background:"rgba(0,0,0,0.85)",display:"flex",flexDirection:"column"}}>
      <div style={{position:"absolute",inset:0}} onClick={onClose}/>
      <div style={{marginTop:"auto",background:"#0d0d11",borderRadius:"12px 12px 0 0",padding:"20px 16px 32px",maxHeight:"80vh",display:"flex",flexDirection:"column",position:"relative",zIndex:1}}>
        {/* Header */}
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:16}}>
          <div>
            <div style={{fontSize:11,color:"#555",textTransform:"uppercase",letterSpacing:"0.12em",fontFamily:F2,marginBottom:4}}>
              {event?.event_name || 'Underground Event'} · {typeLabel}
            </div>
            <div style={{fontSize:17,fontWeight:800,color:"#e0e0e0",fontFamily:F2}}>
              Pick your set{maxSongs > 1 ? ` (up to ${maxSongs} songs)` : ""}
            </div>
          </div>
          <button onClick={onClose} style={{background:"none",border:"none",color:"#555",fontSize:20,cursor:"pointer",padding:4}}>×</button>
        </div>

        {/* Selected pills */}
        {selected.length > 0 && (
          <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:12}}>
            {selected.map((s, i) => (
              <span key={s.id} style={{background:"#60a5fa22",border:"1px solid #60a5fa44",borderRadius:20,padding:"3px 10px",fontSize:11,color:"#60a5fa",fontFamily:F2,fontWeight:700}}>
                {i+1}. {s.title || s.release_name}
              </span>
            ))}
          </div>
        )}

        {/* Song list */}
        <div style={{overflowY:"auto",flex:1,marginBottom:16}}>
          {loading ? (
            <div style={{color:"#444",fontSize:13,textAlign:"center",padding:"32px 0",fontFamily:F2}}>Loading your catalog...</div>
          ) : songs.length === 0 ? (
            <div style={{color:"#444",fontSize:13,textAlign:"center",padding:"32px 0",fontFamily:F2}}>No released songs yet.<br/>Drop something first.</div>
          ) : (
            songs.map(song => {
              const isSelected = !!selected.find(s => s.id === song.id);
              const idx = selected.findIndex(s => s.id === song.id);
              return (
                <div key={song.id} onClick={() => toggle(song)}
                  style={{display:"flex",alignItems:"center",gap:12,padding:"10px 12px",borderRadius:8,marginBottom:4,cursor:"pointer",background:isSelected?"#60a5fa14":"transparent",border:`1px solid ${isSelected?"#60a5fa33":"transparent"}`,transition:"all 0.15s"}}>
                  <div style={{width:40,height:40,borderRadius:6,background:"#1a1a1a",flexShrink:0,overflow:"hidden",display:"flex",alignItems:"center",justifyContent:"center",position:"relative"}}>
                    {song.cover_artwork_url
                      ? <img src={song.cover_artwork_url} alt="" style={{width:"100%",height:"100%",objectFit:"cover"}}/>
                      : <span style={{fontSize:18}}>🎵</span>}
                    {isSelected && (
                      <div style={{position:"absolute",inset:0,background:"#60a5fa99",display:"flex",alignItems:"center",justifyContent:"center"}}>
                        <span style={{fontSize:14,fontWeight:900,color:"#fff"}}>{idx+1}</span>
                      </div>
                    )}
                  </div>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:13,fontWeight:700,color:isSelected?"#93c5fd":"#e0e0e0",fontFamily:F2,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>
                      {song.title || song.release_name}
                    </div>
                    <div style={{fontSize:10,color:"#555",marginTop:1,textTransform:"capitalize"}}>{song.project_type || 'Single'} · {song.lifecycle_state}</div>
                  </div>
                  {isSelected && <div style={{width:20,height:20,borderRadius:"50%",background:"#60a5fa",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                    <span style={{fontSize:10,color:"#fff",fontWeight:900}}>✓</span>
                  </div>}
                </div>
              );
            })
          )}
        </div>

        {/* Confirm */}
        <button
          onClick={() => selected.length > 0 && onConfirm(event.id, selected)}
          disabled={selected.length === 0}
          style={{width:"100%",padding:"15px",borderRadius:8,background:selected.length>0?"#60a5fa":"#1a1a1a",border:"none",color:selected.length>0?"#fff":"#444",fontSize:14,fontWeight:800,cursor:selected.length>0?"pointer":"default",fontFamily:F2,letterSpacing:"0.04em",transition:"all 0.2s"}}>
          {selected.length === 0 ? "Select a song to perform" : `Hit the stage →`}
        </button>
      </div>
    </div>
  );
}

// ─── MAIN COMPONENT ───────────────────────────────────────────────────────────
export default function SoundburstEvents({ profile, selectedCity }) {
  const [tab,setTab]=useState("discover");
  const [region,setRegion]=useState(profile?.canonical_region||profile?.region||"United States");
  const [timeLabel,setTimeLabel]=useState("THIS WEEK");
  const [filterType,setFilterType]=useState("All");
  const [modal,setModal]=useState(null);
  const [wizard,setWizard]=useState(false);
  const [showPicker,setShowPicker]=useState(false);
  const [loading,setLoading]=useState(true);
  const [actionLoading,setActionLoading]=useState(null);
  const [toast,setToast]=useState(null);

  // Data state
  const [events,setEvents]=useState([]);
  const [sections,setSections]=useState([]);
  const [undergroundSummary,setUndergroundSummary]=useState(null);
  const [dashboard,setDashboard]=useState(null);
  const [contacts,setContacts]=useState([]);
  const [sceneData,setSceneData]=useState(null);

  // Performance sequence state
  const [activePerformEvent,setActivePerformEvent]=useState(null);
  const [aftermathEvent,setAftermathEvent]=useState(null);

  // Song picker state
  const [songPickerEvent, setSongPickerEvent] = useState(null);
  const [playerSongs, setPlayerSongs] = useState([]);
  const [songsLoading, setSongsLoading] = useState(false);

  const timeOptions=["TONIGHT","THIS WEEK","NEXT WEEK","ANYTIME"];

  const showToast = (msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 2600);
  };

  const callTouringAction = useCallback(async (action, payload = {}) => {
    const result = await invokeEdgeFunction("touring", {
      action,
      artistId: profile.id,
      ...payload,
    });
    if (!result.success) throw new Error(result.error || `Failed to execute ${action}`);
    return result.data || {};
  }, [profile?.id]);

  // Load discover events
  const loadEvents = useCallback(async () => {
    if (!profile?.id) { setLoading(false); return; }
    setLoading(true);
    try {
      const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 10000));
      const result = await Promise.race([
        invokeEdgeFunction("touring", {
          action: "getGigOpportunities",
          artistId: profile.id,
          region,
          city: selectedCity?.name || null,
        }),
        timeout,
      ]);
      if (!result.success) { showToast(result.error || "Failed to load events", "error"); setLoading(false); return; }
      const data = result.data || {};
      const mappedEvents = Array.isArray(data.opportunities) ? data.opportunities : Array.isArray(data.events) ? data.events : [];
      setEvents(mappedEvents);
      setSections(data.sections || []);
      setUndergroundSummary(data.undergroundSummary || null);
    } catch (err) {
      console.error("[SoundburstEvents] Load error:", err);
      showToast("Failed to sync events", "error");
    } finally {
      setLoading(false);
    }
  }, [profile?.id, region, selectedCity?.name]);

  // Load dashboard (My Gigs data)
  const loadDashboard = useCallback(async () => {
    if (!profile?.id) return;
    try {
      const data = await callTouringAction("getPlayerEventDashboard");
      setDashboard(data);
    } catch (err) {
      console.error("[SoundburstEvents] Dashboard error:", err);
    }
  }, [profile?.id, callTouringAction]);

  // Load scene contacts for Host tab
  const loadContacts = useCallback(async () => {
    if (!profile?.id) return;
    try {
      const data = await callTouringAction("getSceneContacts", { region });
      setContacts(data.contacts || []);
    } catch (err) {
      console.error("[SoundburstEvents] Contacts error:", err);
    }
  }, [profile?.id, region, callTouringAction]);

  // Load city scene data for Host tab
  const loadSceneData = useCallback(async () => {
    if (!profile?.id) return;
    try {
      const data = await callTouringAction("getCitySceneData", { region });
      setSceneData(data);
    } catch (err) {
      console.error("[SoundburstEvents] Scene data error:", err);
    }
  }, [profile?.id, region, callTouringAction]);

  const loadPlayerSongs = useCallback(async () => {
    if (!profile?.id) return;
    setSongsLoading(true);
    try {
      const { data } = await supabaseClient
        .from("releases")
        .select("id, title, release_name, cover_artwork_url, lifecycle_state, project_type")
        .eq("artist_id", profile.id)
        .in("lifecycle_state", ["Hot", "Warm", "Cool", "Archived"])
        .order("created_at", { ascending: false })
        .limit(30);
      setPlayerSongs(data || []);
    } catch (err) {
      console.error("[SoundburstEvents] loadPlayerSongs error:", err);
    } finally {
      setSongsLoading(false);
    }
  }, [profile?.id]);

  useEffect(() => { loadEvents(); }, [loadEvents]);
  useEffect(() => { loadDashboard(); }, [loadDashboard]);
  useEffect(() => { if (tab === "host") loadContacts(); }, [tab, loadContacts]);
  useEffect(() => { loadSceneData(); }, [loadSceneData]);

  const handleBookEvent = async (eventId) => {
    if (!profile?.id) return;
    setActionLoading(`book-${eventId}`);
    try {
      await callTouringAction("bookEvent", { eventId });
      showToast("Gig booked — you're attending");
      setModal(null);
      await loadEvents();
      await loadDashboard();
    } catch (err) {
      showToast(err.message || "Failed to book event", "error");
    } finally {
      setActionLoading(null);
    }
  };

  const handlePerformAtEvent = useCallback(async (eventId) => {
    if (!profile?.id) return;
    const ev = events.find((e) => e.id === eventId) || dashboard?.upcomingPerform?.find((e) => e.id === eventId);
    setModal(null);
    setSongPickerEvent(ev || { id: eventId });
    await loadPlayerSongs();
  }, [profile?.id, events, dashboard, loadPlayerSongs]);

  const handleSongPickerConfirm = useCallback(async (eventId, setlist) => {
    if (!profile?.id) return;
    setSongPickerEvent(null);
    setActionLoading(`perform-${eventId}`);
    const performingEvent = events.find((e) => e.id === eventId)
      || dashboard?.upcomingPerform?.find((e) => e.id === eventId)
      || { id: eventId };
    try {
      await callTouringAction("performAtEvent", { eventId, setlist });
      showToast("Set marked for immediate turn processing");
      if (performingEvent) setActivePerformEvent({ ...performingEvent, setlist });
      await loadEvents();
      await loadDashboard();
    } catch (err) {
      showToast(err.message || "Failed to perform event", "error");
    } finally {
      setActionLoading(null);
    }
  }, [profile?.id, events, dashboard, callTouringAction, loadEvents, loadDashboard]);

  const handleSequenceClose = useCallback(() => {
    const ev = activePerformEvent;
    setActivePerformEvent(null);
    if (ev) setAftermathEvent(ev);
  }, [activePerformEvent]);

  const handleAftermathClose = useCallback(() => {
    setAftermathEvent(null);
    // Refresh dashboard, contacts, and scene data so newly-met NPCs and scene changes appear immediately
    loadDashboard();
    loadContacts();
    loadSceneData();
  }, [loadDashboard, loadContacts, loadSceneData]);

  const handleWizardConfirm = async (config) => {
    if (!profile?.id) return;
    setActionLoading("wizard-host");
    try {
      await callTouringAction("organizeUndergroundShow", {
        eventType: config.eventType,
        eventName: config.eventName || "",
        city: config.city || selectedCity?.name || region,
        region: config.region || region,
        scheduledTurnsAhead: config.scheduledTurnsAhead,
        complianceMode: config.complianceMode,
        promoStrategy: config.promoStrategy,
        eventSpecificChoice: config.eventSpecificChoice,
        eventSpecificIntensity: config.eventSpecificIntensity,
        v: 2,
        callType: config.callType,
        focusChoice: config.focusChoice,
        securityMode: config.securityMode,
        socialPlatforms: config.socialPlatforms,
        slots: config.slots,
        invitedPlayerIds: config.invitedPlayerIds,
        invitedNpcIds: config.invitedNpcIds,
      });
      showToast("Underground show organized");
      setWizard(false);
      await loadEvents();
      await loadDashboard();
      setTab("mygigs");
    } catch (err) {
      showToast(err.message || "Failed to organize show", "error");
    } finally {
      setActionLoading(null);
    }
  };

  const handleSecurePermit = async () => {
    if (!profile?.id) return;
    setActionLoading("permit");
    try {
      await callTouringAction("securePermit", { permitTier: "standard" });
      showToast("Permit secured");
      await loadEvents();
    } catch (err) {
      showToast(err.message || "Failed to secure permit", "error");
    } finally {
      setActionLoading(null);
    }
  };

  // Group events by type for discover sections
  const filteredSections = useMemo(() => {
    if (filterType === "All") return sections.filter(s => s.events?.length > 0);
    // Map display name back to key
    const key = typeNameToKey[filterType];
    return sections.filter(s => s.type === key && s.events?.length > 0);
  }, [sections, filterType]);

  const playerStats = useMemo(() => ({
    sceneTier: undergroundSummary?.sceneTier || "Outsider",
    scenePoints: Math.floor(undergroundSummary?.scenePoints || 0),
    undergroundHeat: Math.floor(undergroundSummary?.undergroundHeat || 0),
    permitStatus: undergroundSummary?.permit?.tier || "none",
  }), [undergroundSummary]);

  if (loading) {
    return (
      <div style={{display:"flex",alignItems:"center",justifyContent:"center",padding:"80px 0",color:"#555",fontSize:14,fontFamily:F}}>
        Loading events...
      </div>
    );
  }

  return (
    <div style={{background:"#0a0a0a",color:"#f0f0f0",fontFamily:F,maxWidth:480,margin:"0 auto"}}>
      {/* Toast */}
      {toast&&(
        <div style={{position:"fixed",top:16,left:"50%",transform:"translateX(-50%)",zIndex:500,padding:"8px 18px",borderRadius:8,fontSize:13,fontWeight:600,boxShadow:"0 4px 20px rgba(0,0,0,0.5)",background:toast.type==="error"?"#dc2626":"#059669",color:"#fff"}}>
          {toast.msg}
        </div>
      )}

      {/* Hero */}
      <HeroBanner
        region={region}
        city={selectedCity?.name || REGIONS[region]?.cities[0]?.name}
        playerStats={playerStats}
        onRegionClick={()=>setShowPicker(v=>!v)}
        onTimeClick={()=>setTimeLabel(t=>timeOptions[(timeOptions.indexOf(t)+1)%timeOptions.length])}
        timeLabel={timeLabel}
      />

      {/* Region Picker */}
      {showPicker&&(
        <div style={{background:"#111",border:"1px solid #222",borderRadius:6,padding:"8px 0",margin:"0 16px",position:"relative",zIndex:50}}>
          {Object.keys(REGIONS).map(r=>(
            <button key={r} onClick={()=>{setRegion(r);setShowPicker(false);}} style={{display:"block",width:"100%",padding:"10px 16px",background:region===r?"#1a1a1a":"transparent",border:"none",color:region===r?"#60a5fa":"#888",fontSize:13,cursor:"pointer",textAlign:"left",fontWeight:region===r?700:400,fontFamily:F}}>{r}</button>
          ))}
        </div>
      )}

      {/* Tab Bar */}
      <div style={{display:"flex",borderBottom:"1px solid #1a1a1a",background:"#0a0a0a",position:"sticky",top:0,zIndex:40}}>
        {[["discover","Discover"],["host","Host"],["mygigs","My Gigs"]].map(([k,l])=>{
          const gigCount = (dashboard?.upcomingPerform?.length||0) + (dashboard?.upcomingHosted?.length||0);
          return (
            <button key={k} onClick={()=>setTab(k)} style={{flex:1,padding:"13px 8px",background:"transparent",border:"none",borderBottom:`2px solid ${tab===k?"#60a5fa":"transparent"}`,color:tab===k?"#fff":"#555",fontSize:13,fontWeight:tab===k?700:400,cursor:"pointer",fontFamily:F}}>
              {l}{k==="mygigs"&&gigCount>0&&<span style={{marginLeft:5,background:"#60a5fa",color:"#fff",borderRadius:10,padding:"1px 5px",fontSize:9,fontWeight:700}}>{gigCount}</span>}
            </button>
          );
        })}
      </div>

      {/* ═══ DISCOVER TAB ═══ */}
      {tab==="discover"&&(
        <div style={{padding:"16px 0 80px"}}>
          <div style={{padding:"0 16px",marginBottom:14}}>
            <HScroll gap={8}>{["All",...EVENT_TYPES].map(t=><GenrePill key={t} label={t} active={filterType===t} onClick={()=>setFilterType(t)}/>)}</HScroll>
          </div>
          {filteredSections.map(s=>{
            const display = typeKeyToDisplay[s.type] || s.type;
            return (
              <div key={s.type} style={{marginBottom:28}}>
                <div style={{padding:"0 16px"}}><SectionHead title={display} count={s.events.length} accent={catColors[display]||"#ff5500"}/></div>
                <div style={{paddingLeft:16}}><HScroll>{s.events.map(e=><EventCard key={e.id} ev={e} onOpen={setModal}/>)}</HScroll></div>
              </div>
            );
          })}
          {filteredSections.length===0&&<div style={{textAlign:"center",padding:"48px 16px",color:"#444",fontSize:14}}>No signals in {region} right now.</div>}
        </div>
      )}

      {/* ═══ HOST TAB ═══ */}
      {tab==="host"&&(
        <div style={{padding:"16px 16px 80px"}}>
          {/* Permit + secure button */}
          <div style={{display:"flex",gap:8,marginBottom:16}}>
            <div style={{flex:1,background:"#111",border:"1px solid #f59e0b33",borderRadius:6,padding:"12px 14px"}}>
              <div style={{fontSize:9,color:"#444",textTransform:"uppercase",letterSpacing:"0.12em",marginBottom:2}}>Venue Permit</div>
              <div style={{fontSize:14,fontWeight:700,color:"#f59e0b",textTransform:"capitalize"}}>{playerStats.permitStatus}</div>
            </div>
            <button onClick={handleSecurePermit} disabled={actionLoading==="permit"} style={{padding:"0 16px",background:"#1a1a1a",border:"1px solid #333",borderRadius:6,fontSize:11,color:"#f0f0f0",cursor:actionLoading==="permit"?"default":"pointer",fontWeight:700,textTransform:"uppercase",letterSpacing:"0.06em",whiteSpace:"nowrap",fontFamily:F,opacity:actionLoading==="permit"?0.5:1}}>
              {actionLoading==="permit"?"Securing...":"Secure Permit"}
            </button>
          </div>

          {/* Host button */}
          <button onClick={()=>setWizard(true)} style={{width:"100%",padding:"15px",borderRadius:6,background:"#60a5fa",border:"none",color:"#fff",fontSize:14,fontWeight:700,cursor:"pointer",marginBottom:20,fontFamily:F,letterSpacing:"0.04em"}}>+ Host Underground Event</button>

          {/* Scene rep summary */}
          {sceneData?.playerReps?.length > 0 && (
            <div style={{marginBottom:16,padding:"12px 14px",background:"#111",border:"1px solid #1a1a1a",borderRadius:8}}>
              <div style={{fontSize:10,color:"#555",textTransform:"uppercase",letterSpacing:"0.12em",fontFamily:F,marginBottom:8}}>Your Scene Standing · {region}</div>
              <div style={{display:"flex",gap:8,overflowX:"auto"}}>
                {sceneData.playerReps.slice(0,5).map(rep => {
                  const scene = sceneData.scenes?.find(s => s.id === rep.city_scene_id);
                  return (
                    <div key={rep.city_scene_id} style={{flexShrink:0,textAlign:"center",minWidth:60}}>
                      <div style={{fontSize:13,fontWeight:800,color:"#a78bfa"}}>{Math.round(rep.reputation_score || 0)}</div>
                      <div style={{fontSize:9,color:"#444",marginTop:1}}>{scene?.city_name || "City"}</div>
                      <div style={{fontSize:8,color:"#555",textTransform:"uppercase",letterSpacing:"0.08em"}}>{rep.tier || "—"}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Contacts from getSceneContacts — only show NPCs the player has actually met */}
          {contacts.filter(c=>c.relationship_level>0).length>0&&(
            <div style={{marginBottom:20}}>
              <SectionHead title={`Contacts · ${region}`} count={contacts.filter(c=>c.relationship_level>0).length} accent="#a78bfa"/>
              <div style={{display:"flex",flexDirection:"column",gap:6}}>
                {contacts.filter(c=>c.relationship_level>0).map(npc=>{
                  const rc=npc.relationship_level>=60?"#22c55e":npc.relationship_level>=30?"#f59e0b":"#666";
                  const rl=npc.relationship_level>=60?"Tight":npc.relationship_level>=30?"Cool":"Stranger";
                  return(
                    <div key={npc.id} style={{display:"flex",alignItems:"center",gap:12,padding:"10px 12px",background:"#111",border:"1px solid #1a1a1a",borderRadius:6}}>
                      <div style={{width:38,height:38,borderRadius:"50%",background:"#1a1a1a",border:"1px solid #2a2a2a",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                        <div style={{fontSize:14,fontWeight:700,color:"#a78bfa"}}>{npc.name.charAt(0)}</div>
                      </div>
                      <div style={{flex:1}}>
                        <div style={{fontSize:13,fontWeight:700,color:"#e0e0e0",fontFamily:F}}>{npc.name}</div>
                        <div style={{fontSize:10,color:"#555",marginTop:1}}>{npc.genre_preference || npc.role} · {npc.city_name}</div>
                      </div>
                      <div style={{textAlign:"right"}}>
                        <div style={{fontSize:10,fontWeight:700,color:rc,marginBottom:2}}>{rl}</div>
                        <div style={{fontSize:11,color:"#555"}}>Lvl {npc.relationship_level}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Past events */}
          {dashboard?.pastEvents?.length>0&&(
            <div style={{marginBottom:16}}>
              <SectionHead title="Past Events" accent="#ff5500"/>
              {dashboard.pastEvents.slice(0,5).map((pe)=><ListRow key={pe.id} ev={{...pe,title:pe.event_name,compensation:pe.outcome_summary?.payout}}/>)}
            </div>
          )}

          {/* Scheduled hosted */}
          {dashboard?.upcomingHosted?.length>0&&(
            <div>
              <SectionHead title="Scheduled" accent="#22c55e"/>
              {dashboard.upcomingHosted.map(h=><ListRow key={h.id} ev={{...h,title:h.event_name}} badge="Scheduled" badgeColor="#22c55e" badgeBg="#22c55e1a"/>)}
            </div>
          )}
        </div>
      )}

      {/* ═══ MY GIGS TAB ═══ */}
      {tab==="mygigs"&&(
        <div style={{padding:"16px 16px 80px"}}>
          {/* Signed up (performing at) */}
          {dashboard?.upcomingPerform?.length>0&&(
            <div style={{marginBottom:20}}>
              <SectionHead title="Signed Up" accent="#60a5fa"/>
              {dashboard.upcomingPerform.map(g=>{
                const display = typeKeyToDisplay[g.event_type] || g.event_type || "";
                const isPerformer = g.hosted_by !== profile?.id;
                const roleColor = isPerformer ? "#a855f7" : "#0891b2";
                const roleLabel = isPerformer ? "Performer" : "Attendee";
                return(
                  <div key={g.id} style={{display:"flex",alignItems:"center",gap:12,padding:"10px 0",borderBottom:"1px solid #1a1a1a"}}>
                    <div style={{width:44,height:44,borderRadius:4,background:`${roleColor}22`,border:`1px solid ${roleColor}44`,flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center"}}>
                      <div style={{width:12,height:12,borderRadius:"50%",background:roleColor}}/>
                    </div>
                    <div style={{flex:1}}>
                      <div style={{fontSize:13,fontWeight:700,color:"#e0e0e0",fontFamily:F}}>{g.event_name}</div>
                      <div style={{fontSize:11,color:"#555",marginTop:1}}>{g.city}{display?` · ${display}`:""}</div>
                    </div>
                    <span style={{fontSize:10,fontWeight:700,padding:"3px 8px",borderRadius:3,background:`${roleColor}22`,color:roleColor,textTransform:"uppercase",letterSpacing:"0.06em"}}>{roleLabel}</span>
                  </div>
                );
              })}
            </div>
          )}

          {/* Your hosted events */}
          {dashboard?.upcomingHosted?.length>0&&(
            <div>
              <SectionHead title="Your Events" accent="#22c55e"/>
              {dashboard.upcomingHosted.map(h=><ListRow key={h.id} ev={{...h,title:h.event_name}} badge="Hosting" badgeColor="#22c55e" badgeBg="#22c55e1a"/>)}
            </div>
          )}

          {/* Empty state */}
          {(!dashboard?.upcomingPerform?.length && !dashboard?.upcomingHosted?.length) && (
            <div style={{textAlign:"center",padding:"60px 0",color:"#444",fontSize:14}}>No gigs lined up yet.</div>
          )}
        </div>
      )}

      {/* Event Modal */}
      {modal&&<EventModal ev={modal} onClose={()=>setModal(null)} onAttend={handleBookEvent} onPerform={handlePerformAtEvent} actionLoading={actionLoading}/>}

      {/* Wizard */}
      {wizard&&<UndergroundEventWizard initRegion={region} onConfirm={handleWizardConfirm} onClose={()=>setWizard(false)} loading={actionLoading==="wizard-host"}/>}

      {/* Song Picker */}
      {songPickerEvent && (
        <SongPickerModal
          event={songPickerEvent}
          songs={playerSongs}
          loading={songsLoading}
          onConfirm={handleSongPickerConfirm}
          onClose={() => setSongPickerEvent(null)}
        />
      )}

      {/* Performance Sequence */}
      {activePerformEvent&&<PerformanceSequence event={activePerformEvent} onClose={handleSequenceClose} setlist={activePerformEvent?.setlist}/>}

      {/* Aftermath */}
      {aftermathEvent&&<PostEventAftermath event={aftermathEvent} onClose={handleAftermathClose}/>}
    </div>
  );
}
