import { useState, useRef } from "react";
import { REGIONS, catColors, EVENT_TYPES, typeNameToKey } from "./soundburstData";

// ─── DATA ─────────────────────────────────────────────────────────────────────

const VENUES = {
  "New York":     [{name:"The Loft",cap:120,cost:300},{name:"Baby's All Right",cap:350,cost:800},{name:"Brooklyn Steel",cap:1800,cost:2500}],
  "Los Angeles":  [{name:"The Smell",cap:250,cost:400},{name:"Lodge Room",cap:350,cost:900},{name:"The Wiltern",cap:1850,cost:3000}],
  "Atlanta":      [{name:"Basement ATL",cap:100,cost:250},{name:"Aisle 5",cap:300,cost:700},{name:"Buckhead Theatre",cap:1000,cost:2000}],
  "Chicago":      [{name:"Empty Bottle",cap:200,cost:350},{name:"Thalia Hall",cap:750,cost:1500}],
  "Miami":        [{name:"The Ground",cap:300,cost:600},{name:"Electric Pickle",cap:400,cost:900}],
  "Houston":      [{name:"Rudyard's",cap:150,cost:300},{name:"White Oak",cap:1000,cost:1800}],
  "Nashville":    [{name:"The Basement",cap:130,cost:300},{name:"Exit/In",cap:500,cost:1000}],
  "Toronto":      [{name:"The Garrison",cap:250,cost:500},{name:"Rebel",cap:2500,cost:3500}],
  "Montreal":     [{name:"Bar Le Ritz",cap:300,cost:500},{name:"L'Olympia",cap:2500,cost:3000}],
  "Vancouver":    [{name:"Fortune Sound Club",cap:400,cost:700},{name:"Rickshaw Theatre",cap:600,cost:1200}],
  "London":       [{name:"Brilliant Corners",cap:100,cost:300},{name:"Jazz Cafe",cap:440,cost:1200},{name:"Fabric",cap:2500,cost:4000}],
  "Manchester":   [{name:"Band on the Wall",cap:500,cost:900},{name:"Albert Hall",cap:1600,cost:2500}],
  "Glasgow":      [{name:"King Tut's",cap:300,cost:600},{name:"SWG3",cap:1500,cost:2200}],
  "Birmingham":   [{name:"Hare & Hounds",cap:400,cost:700},{name:"O2 Institute",cap:1200,cost:2000}],
  "Berlin":       [{name:"Suicide Circus",cap:300,cost:600},{name:"Berghain",cap:1500,cost:3000}],
  "Paris":        [{name:"Le Batofar",cap:350,cost:700},{name:"La Cigale",cap:1100,cost:2000}],
  "Amsterdam":    [{name:"Shelter",cap:300,cost:600},{name:"Paradiso",cap:1500,cost:2500}],
  "Barcelona":    [{name:"BARTS",cap:800,cost:1500},{name:"Sala Apolo",cap:1000,cost:1800}],
  "Stockholm":    [{name:"Debaser Strand",cap:500,cost:900},{name:"Nalen",cap:1100,cost:2000}],
  "Tokyo":        [{name:"WWW",cap:400,cost:900},{name:"Shibuya O-East",cap:1300,cost:2500}],
  "Seoul":        [{name:"Club Helios",cap:300,cost:700},{name:"Yes24 Live Hall",cap:2400,cost:3500}],
  "Mumbai":       [{name:"Blue Frog",cap:400,cost:800},{name:"Dome NSCI",cap:8000,cost:5000}],
  "Bangkok":      [{name:"De Bar",cap:200,cost:400},{name:"Moonbar",cap:500,cost:900}],
  "Shanghai":     [{name:"The Shelter",cap:200,cost:500},{name:"MAO Livehouse",cap:700,cost:1500}],
  "Sao Paulo":    [{name:"A Lôca",cap:150,cost:300},{name:"Audio",cap:3000,cost:3500}],
  "Mexico City":  [{name:"El Imperial",cap:300,cost:600},{name:"El Plaza Condesa",cap:800,cost:1500}],
  "Buenos Aires": [{name:"Niceto Club",cap:900,cost:1500},{name:"La Trastienda",cap:1200,cost:2200}],
  "Bogota":       [{name:"Armando Records",cap:600,cost:1000},{name:"El Teatrón",cap:2000,cost:3000}],
  "Lagos":        [{name:"The Warehouse",cap:300,cost:600},{name:"Eko Hotels Expo",cap:5000,cost:4000}],
  "Johannesburg": [{name:"The Owl's Parlour",cap:200,cost:400},{name:"Bassline",cap:800,cost:1500}],
  "Nairobi":      [{name:"Alchemist",cap:300,cost:500},{name:"KICC",cap:4000,cost:3000}],
  "Accra":        [{name:"Republic Bar",cap:250,cost:400},{name:"National Theatre",cap:1500,cost:2000}],
  "Sydney":       [{name:"The Lansdowne",cap:400,cost:700},{name:"Metro Theatre",cap:1000,cost:2000}],
  "Melbourne":    [{name:"The Tote",cap:400,cost:700},{name:"Forum Melbourne",cap:2000,cost:3000}],
  "Auckland":     [{name:"Whammy Bar",cap:200,cost:400},{name:"Powerstation",cap:1000,cost:1800}],
};
const getVenues = (city) => VENUES[city] || [{name:"The Underground",cap:150,cost:300},{name:"City Stage",cap:500,cost:1000}];

const NPC_CONTACTS = {
  "United States":    [{name:"Ray-D",genre:"Hip-Hop",city:"New York",rel:72,fee:800},{name:"Selena Vox",genre:"R&B",city:"Atlanta",rel:45,fee:600},{name:"DJ Chuco",genre:"Electronic",city:"Miami",rel:30,fee:400},{name:"Lil Dagger",genre:"Drill",city:"Chicago",rel:20,fee:350}],
  "United Kingdom":   [{name:"Grime86",genre:"Grime",city:"London",rel:60,fee:900},{name:"Mila Frost",genre:"Indie",city:"Manchester",rel:35,fee:500},{name:"Static J",genre:"Electronic",city:"Glasgow",rel:20,fee:300}],
  "Europe":           [{name:"T3chno",genre:"Techno",city:"Berlin",rel:55,fee:800},{name:"La Maison",genre:"Electronic",city:"Paris",rel:40,fee:700},{name:"VLAD",genre:"Hip-Hop",city:"Stockholm",rel:25,fee:450}],
  "Asia":             [{name:"YK Sol",genre:"K-Pop",city:"Seoul",rel:65,fee:1000},{name:"Akira B",genre:"J-Pop",city:"Tokyo",rel:50,fee:900},{name:"Mango",genre:"Electronic",city:"Bangkok",rel:20,fee:300}],
  "Latin America":    [{name:"Kumbia Kween",genre:"Reggaeton",city:"Mexico City",rel:55,fee:700},{name:"Br4zuca",genre:"Funk Carioca",city:"Sao Paulo",rel:40,fee:600}],
  "Africa":           [{name:"Amapiano Kid",genre:"Amapiano",city:"Johannesburg",rel:60,fee:800},{name:"Afro G",genre:"Afrobeats",city:"Lagos",rel:45,fee:700}],
  "Canada":           [{name:"North6ix",genre:"Hip-Hop",city:"Toronto",rel:50,fee:700},{name:"MNTRL",genre:"Electronic",city:"Montreal",rel:30,fee:400}],
  "Oceania":          [{name:"Harbour Kid",genre:"Hip-Hop",city:"Sydney",rel:40,fee:500},{name:"MelbTrack",genre:"Electronic",city:"Melbourne",rel:25,fee:350}],
};

const PROMO = [{name:"Word of Mouth",cost:0,att:"+5%",heat:"+0%"},{name:"Street Team",cost:200,att:"+15%",heat:"+8%"},{name:"Social Blast",cost:500,att:"+30%",heat:"+20%"},{name:"Exclusive Invite",cost:800,att:"+10%",heat:"—"}];
const SOCIAL_PLATFORMS = [{id:"instavirus",name:"InstaVibe",cost:150,reach:"+18%"},{id:"looptok",name:"LoopTok",cost:200,reach:"+25%"},{id:"xpress",name:"Xpress",cost:100,reach:"+12%"}];
const SECURITY = [{k:"none",l:"None",s:"No security.",cost:0,risk:"+5%"},{k:"bouncer",l:"Hired Bouncer",s:"Basic door control.",cost:150,risk:"-3%"},{k:"lookout",l:"Lookout Posted",s:"Early warning system.",cost:200,risk:"-5%"},{k:"maximum",l:"Maximum Security",s:"Full lockdown.",cost:800,risk:"-15%"}];
const TIMING = [{label:"Tonight",sub:"Max hype, high risk",t:"T+1"},{label:"This Week",sub:"Balanced",t:"T+2"},{label:"Next Week",sub:"Build anticipation",t:"T+3"},{label:"Building Hype",sub:"More promo time",t:"T+4"},{label:"Long Game",sub:"Max preparation",t:"T+5"}];
const FOCUS_MAP = {
  "Open Mic":[{k:"networking",l:"Networking",b:["Higher NPC chance","Build relationships","Subtle vibe"]},{k:"performance",l:"Performance",b:["+Clout gain","Higher streams","More visibility"]},{k:"vibe",l:"Vibe",b:["Lower detection","Chill crowd","Community love"]}],
  "Showcase":[{k:"opener",l:"Opener",b:["Lower cost","Warm up crowd","Build buzz"]},{k:"co-headliner",l:"Co-Headliner",b:["Balanced cost","Peak energy","Good exposure"]},{k:"headliner",l:"Headliner",b:["Maximum attention","Higher cost","Pressure to deliver"]}],
  "Battle":[{k:"cypher",l:"Cypher",b:["Networking boost","Lower controversy","Shared spotlight"]},{k:"1v1",l:"1v1",b:["Higher clout gain","Beef potential","Winner takes all"]},{k:"exhibition",l:"Exhibition",b:["Pure performance","Showcase vibe","Low risk"]}],
  "Collab Night":[{k:"networking",l:"Networking",b:["Higher NPC chance","Build relationships","Subtle vibe"]},{k:"performance",l:"Performance",b:["+Clout gain","Higher streams","More visibility"]},{k:"vibe",l:"Vibe",b:["Team energy","Feel-good collab","Collab boost"]}],
  "Block Party":[{k:"low-key",l:"Low-key",b:["Lower cost","Chill crowd","Less risk"]},{k:"hype",l:"Hype",b:["Balanced cost","Bigger attendance","Normal risk"]},{k:"all-out",l:"All-out",b:["Highest cost","Max attendance","High raid risk"]}],
  "Listening Party":[],
};
const COMPLIANCE = [{k:"stealth",l:"Stealth",s:"Low risk, word-of-mouth"},{k:"balanced",l:"Balanced",s:"Standard risk/reward"},{k:"permitted",l:"Permitted",s:"Best vibe (requires permit)"}];


const F = "'Interstate','Lucida Grande',sans-serif";

export default function UndergroundEventWizard({ initRegion, onConfirm, onClose, loading = false }) {
  const [step,setStep]=useState(0);
  const [w,setW]=useState({type:"",callType:"open",region:initRegion||"United States",city:null,venue:null,focus:"",slots:4,invitedArtists:[],thumbnail:null,name:"",promo:null,socials:[],security:"none",timing:null,compliance:"balanced"});
  const up=(k,v)=>setW(p=>({...p,[k]:v}));
  const toggleSocial=(id)=>setW(p=>({...p,socials:p.socials.includes(id)?p.socials.filter(s=>s!==id):[...p.socials,id]}));
  const toggleArtist=(npc)=>setW(p=>({...p,invitedArtists:p.invitedArtists.find(a=>a.name===npc.name)?p.invitedArtists.filter(a=>a.name!==npc.name):[...p.invitedArtists,npc]}));
  const fileRef=useRef(null);
  const handleThumb=(e)=>{
    const file=e.target.files[0]; if(!file) return;
    const reader=new FileReader();
    reader.onload=ev=>up("thumbnail",ev.target.result);
    reader.readAsDataURL(file);
  };
  const venues=w.city?getVenues(w.city.name):[];
  const focusOpts=FOCUS_MAP[w.type]||[];
  const npcs=NPC_CONTACTS[w.region]||[];
  const cc=catColors[w.type]||"#ff5500";
  const STEPS=["What's the night?","Location & Venue","Focus","Lineup","Artwork & Identity","Promotion","Timing","Review"];
  const TOTAL=STEPS.length;

  function handleConfirm() {
    const turnsAhead = w.timing ? parseInt(w.timing.t.replace("T+", ""), 10) : 2;
    onConfirm({
      eventType: typeNameToKey[w.type] || w.type,
      city: w.city?.name || null,
      eventName: w.name.trim(),
      scheduledTurnsAhead: turnsAhead,
      complianceMode: w.compliance,
      promoStrategy: w.promo?.name?.toLowerCase().replace(/ /g, "_") || "word_of_mouth",
      eventSpecificChoice: w.focus || null,
      eventSpecificIntensity: null,
      callType: w.callType,
      focusChoice: w.focus || null,
      securityMode: w.security,
      socialPlatforms: w.socials,
      slots: w.slots,
      invitedPlayerIds: [],
      invitedNpcIds: w.invitedArtists.map((a) => a.name),
      venue: w.venue?.name || null,
      venueCost: w.venue?.cost || 0,
      region: w.region,
      thumbnail: w.thumbnail || null,
    });
  }

  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.92)",zIndex:400,display:"flex",alignItems:"flex-end",justifyContent:"center"}}>
      <div style={{background:"#0d0d0d",border:"1px solid #1e1e1e",borderRadius:"14px 14px 0 0",width:"100%",maxWidth:480,maxHeight:"92vh",overflow:"auto"}}>
        <div style={{position:"sticky",top:0,background:"#0d0d0d",padding:"16px 16px 0",zIndex:1,borderBottom:"1px solid #111"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
            <div style={{fontSize:10,color:"#444",textTransform:"uppercase",letterSpacing:"0.12em"}}>Step {step+1} of {TOTAL}</div>
            <button onClick={onClose} style={{background:"none",border:"none",color:"#444",fontSize:22,cursor:"pointer",lineHeight:1,padding:0}}>×</button>
          </div>
          <div style={{fontSize:17,fontWeight:700,color:"#f0f0f0",marginBottom:10,fontFamily:F}}>{STEPS[step]}</div>
          <div style={{height:2,background:"#1a1a1a",borderRadius:2,marginBottom:0}}>
            <div style={{height:"100%",background:cc,borderRadius:2,width:`${((step+1)/TOTAL)*100}%`,transition:"width 0.3s"}}/>
          </div>
        </div>

        <div style={{padding:"16px 16px 28px"}}>

          {step===0&&(
            <>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:16}}>
                {EVENT_TYPES.map(t=>{const tc=catColors[t]||"#ff5500";const sel=w.type===t;return(
                  <button key={t} onClick={()=>{up("type",t);up("focus","");}} style={{padding:"16px 10px",borderRadius:6,background:sel?`${tc}22`:"#111",border:`1px solid ${sel?tc:"#222"}`,color:sel?tc:"#aaa",fontSize:13,fontWeight:700,cursor:"pointer",textAlign:"left",fontFamily:F}}>{t}</button>
                );})}
              </div>
              {w.type&&w.type!=="Listening Party"&&(
                <>
                  <div style={{fontSize:10,color:"#444",textTransform:"uppercase",letterSpacing:"0.1em",marginBottom:8}}>Lineup Type</div>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                    {[{k:"open",l:"Open Call",s:"Anyone can apply. Fill slots organically."},{k:"invite_only",l:"Private Invite",s:"Handpick artists and set their pay."}].map(ct=>{const sel=w.callType===ct.k;return(
                      <button key={ct.k} onClick={()=>up("callType",ct.k)} style={{padding:"14px",borderRadius:6,background:sel?`${cc}22`:"#111",border:`1px solid ${sel?cc:"#222"}`,cursor:"pointer",textAlign:"left"}}>
                        <div style={{fontSize:13,fontWeight:700,color:sel?cc:"#f0f0f0",marginBottom:4,fontFamily:F}}>{ct.l}</div>
                        <div style={{fontSize:11,color:"#555"}}>{ct.s}</div>
                      </button>
                    );})}
                  </div>
                </>
              )}
            </>
          )}

          {step===1&&(
            <>
              <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:14}}>
                {Object.keys(REGIONS).map(r=>(
                  <button key={r} onClick={()=>{up("region",r);up("city",null);up("venue",null);}} style={{fontSize:10,padding:"5px 10px",borderRadius:3,background:w.region===r?"#ff5500":"#111",border:`1px solid ${w.region===r?"#ff5500":"#222"}`,color:w.region===r?"#000":"#888",cursor:"pointer",fontWeight:700,textTransform:"uppercase",letterSpacing:"0.06em"}}>{r}</button>
                ))}
              </div>
              <div style={{fontSize:10,color:"#444",textTransform:"uppercase",letterSpacing:"0.1em",marginBottom:8}}>City</div>
              <div style={{display:"flex",flexDirection:"column",gap:6,marginBottom:14}}>
                {(REGIONS[w.region]?.cities||[]).map(c=>{const tc=c.tier>=5?"#22c55e":c.tier>=3?"#f59e0b":"#6b7280";const sel=w.city?.name===c.name;return(
                  <button key={c.name} onClick={()=>{up("city",c);up("venue",null);}} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"12px 14px",borderRadius:6,background:sel?"#ff550011":"#111",border:`1px solid ${sel?"#ff5500":"#222"}`,cursor:"pointer"}}>
                    <div style={{textAlign:"left"}}>
                      <div style={{fontSize:13,fontWeight:700,color:sel?"#ff5500":"#f0f0f0",fontFamily:F}}>{c.name}</div>
                      <div style={{fontSize:10,color:"#555",marginTop:2}}>{c.genres.slice(0,3).join(" · ")}</div>
                    </div>
                    <div style={{background:`${tc}22`,border:`1px solid ${tc}`,borderRadius:4,padding:"3px 8px",fontSize:11,fontWeight:700,color:tc}}>T{c.tier}</div>
                  </button>
                );})}
              </div>
              {w.city&&(
                <>
                  <div style={{fontSize:10,color:"#444",textTransform:"uppercase",letterSpacing:"0.1em",marginBottom:8}}>Venue in {w.city.name}</div>
                  <div style={{display:"flex",flexDirection:"column",gap:6}}>
                    {venues.map(v=>{const sel=w.venue?.name===v.name;return(
                      <button key={v.name} onClick={()=>up("venue",v)} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"12px 14px",borderRadius:6,background:sel?"#ff550011":"#111",border:`1px solid ${sel?"#ff5500":"#222"}`,cursor:"pointer"}}>
                        <div style={{textAlign:"left"}}>
                          <div style={{fontSize:13,fontWeight:700,color:sel?"#ff5500":"#f0f0f0",fontFamily:F}}>{v.name}</div>
                          <div style={{fontSize:10,color:"#555",marginTop:2}}>Cap: {v.cap.toLocaleString()}</div>
                        </div>
                        <div style={{fontSize:12,color:"#f59e0b",fontWeight:700}}>${v.cost.toLocaleString()}</div>
                      </button>
                    );})}
                  </div>
                </>
              )}
            </>
          )}

          {step===2&&(w.type==="Listening Party"?(
            <div style={{background:"#111",border:"1px solid #222",borderRadius:8,padding:"24px",textAlign:"center",color:"#444"}}>
              <div style={{color:"#666",fontSize:14}}>No releases to debut yet.</div>
              <div style={{fontSize:12,color:"#333",marginTop:6}}>Release tracks first to host a Listening Party.</div>
            </div>
          ):(
            <div style={{display:"flex",flexDirection:"column",gap:8}}>
              {focusOpts.map(f=>{const sel=w.focus===f.k;return(
                <button key={f.k} onClick={()=>up("focus",f.k)} style={{padding:"14px",borderRadius:6,background:sel?`${cc}11`:"#111",border:`1px solid ${sel?cc:"#222"}`,cursor:"pointer",textAlign:"left"}}>
                  <div style={{fontSize:13,fontWeight:700,color:sel?cc:"#f0f0f0",marginBottom:6,fontFamily:F}}>{f.l}</div>
                  <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>{f.b.map(b=><span key={b} style={{fontSize:10,color:"#666",background:"#1a1a1a",padding:"2px 7px",borderRadius:3}}>{b}</span>)}</div>
                </button>
              );})}
            </div>
          ))}

          {step===3&&(w.callType==="open"?(
            <>
              <div style={{background:"#111",border:"1px solid #222",borderRadius:8,padding:"16px",marginBottom:16}}>
                <div style={{fontSize:13,fontWeight:700,color:"#f0f0f0",marginBottom:4}}>Open Call Active</div>
                <div style={{fontSize:12,color:"#666"}}>Artists in {w.city?.name||"the selected city"} can discover and apply to your event. Slots fill based on your scene tier and promo.</div>
              </div>
              <div style={{fontSize:10,color:"#444",textTransform:"uppercase",letterSpacing:"0.1em",marginBottom:8}}>Performer Slots</div>
              <div style={{display:"flex",gap:8}}>
                {[2,4,6,8].map(n=>(
                  <button key={n} onClick={()=>up("slots",n)} style={{flex:1,padding:"12px 0",borderRadius:6,background:w.slots===n?`${cc}22`:"#111",border:`1px solid ${w.slots===n?cc:"#222"}`,color:w.slots===n?cc:"#888",fontSize:14,fontWeight:700,cursor:"pointer"}}>{n}</button>
                ))}
              </div>
            </>
          ):(
            <>
              <div style={{fontSize:10,color:"#444",textTransform:"uppercase",letterSpacing:"0.1em",marginBottom:8}}>Contacts in {w.region}</div>
              {npcs.length===0?(
                <div style={{background:"#111",border:"1px solid #222",borderRadius:8,padding:"20px",textAlign:"center",color:"#444",fontSize:13}}>No contacts in this region yet. Discover events to meet artists.</div>
              ):(
                <div style={{display:"flex",flexDirection:"column",gap:6}}>
                  {npcs.map(npc=>{
                    const invited=w.invitedArtists.find(a=>a.name===npc.name);
                    const rc=npc.rel>=60?"#22c55e":npc.rel>=30?"#f59e0b":"#666";
                    return(
                      <div key={npc.name} style={{display:"flex",alignItems:"center",gap:12,padding:"12px 14px",background:invited?`${cc}11`:"#111",border:`1px solid ${invited?cc:"#222"}`,borderRadius:6}}>
                        <div style={{width:36,height:36,borderRadius:"50%",background:`${cc}22`,border:`1px solid ${cc}44`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                          <div style={{fontSize:13,fontWeight:700,color:cc}}>{npc.name.charAt(0)}</div>
                        </div>
                        <div style={{flex:1,minWidth:0}}>
                          <div style={{fontSize:13,fontWeight:700,color:"#f0f0f0",fontFamily:F}}>{npc.name}</div>
                          <div style={{fontSize:10,color:"#555",marginTop:1}}>{npc.genre} · {npc.city}</div>
                          <div style={{fontSize:10,color:rc,marginTop:2}}>Rel: {npc.rel}%</div>
                        </div>
                        <div style={{textAlign:"right"}}>
                          <div style={{fontSize:12,color:"#f59e0b",fontWeight:700,marginBottom:4}}>${npc.fee}</div>
                          <button onClick={()=>toggleArtist(npc)} style={{padding:"5px 10px",borderRadius:4,fontSize:11,fontWeight:700,cursor:"pointer",background:invited?cc:"transparent",border:`1px solid ${invited?cc:"#333"}`,color:invited?"#000":"#888"}}>{invited?"Invited":"Invite"}</button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
              {w.invitedArtists.length>0&&(
                <div style={{marginTop:12,padding:"10px 12px",background:"#111",border:"1px solid #222",borderRadius:6}}>
                  <div style={{fontSize:11,color:"#555"}}>Artist fees: <span style={{color:"#f59e0b",fontWeight:700}}>${w.invitedArtists.reduce((a,b)=>a+b.fee,0).toLocaleString()}</span> · {w.invitedArtists.length} invited</div>
                </div>
              )}
            </>
          ))}

          {step===4&&(
            <>
              <div style={{marginBottom:16}}>
                <div style={{fontSize:10,color:"#444",textTransform:"uppercase",letterSpacing:"0.1em",marginBottom:8}}>Event Thumbnail</div>
                <input type="file" accept="image/*" onChange={handleThumb} ref={fileRef} style={{display:"none"}}/>
                <div onClick={()=>fileRef.current?.click()} style={{width:"100%",height:180,borderRadius:8,background:w.thumbnail?"transparent":"#111",border:w.thumbnail?"none":"2px dashed #2a2a2a",cursor:"pointer",position:"relative",overflow:"hidden",display:"flex",alignItems:"center",justifyContent:"center"}}>
                  {w.thumbnail?(
                    <>
                      <img src={w.thumbnail} style={{width:"100%",height:"100%",objectFit:"cover",display:"block"}} alt="thumb"/>
                      <div style={{position:"absolute",inset:0,background:"rgba(0,0,0,0.55)",display:"flex",alignItems:"center",justifyContent:"center"}}>
                        <span style={{color:"#fff",fontSize:12,fontWeight:700,background:"rgba(0,0,0,0.5)",padding:"6px 14px",borderRadius:4}}>Change</span>
                      </div>
                    </>
                  ):(
                    <div style={{textAlign:"center",padding:20}}>
                      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#333" strokeWidth="1.5" style={{display:"block",margin:"0 auto 10px"}}>
                        <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>
                      </svg>
                      <div style={{fontSize:12,color:"#555"}}>Tap to upload thumbnail</div>
                      <div style={{fontSize:10,color:"#333",marginTop:4}}>JPG, PNG or GIF</div>
                    </div>
                  )}
                </div>
              </div>
              <div style={{fontSize:10,color:"#444",textTransform:"uppercase",letterSpacing:"0.1em",marginBottom:8}}>Event Name</div>
              <input value={w.name} onChange={e=>up("name",e.target.value)} placeholder="Optional — leave blank to auto-generate" maxLength={48}
                style={{width:"100%",background:"#111",border:"1px solid #222",borderRadius:6,padding:"10px 12px",color:"#f0f0f0",fontSize:13,boxSizing:"border-box",fontFamily:F}}/>
            </>
          )}

          {step===5&&(
            <>
              <div style={{marginBottom:16}}>
                <div style={{fontSize:10,color:"#444",textTransform:"uppercase",letterSpacing:"0.1em",marginBottom:8}}>Promo Strategy</div>
                <div style={{display:"flex",flexDirection:"column",gap:6}}>
                  {PROMO.map(p=>{const sel=w.promo?.name===p.name;return(
                    <button key={p.name} onClick={()=>up("promo",p)} style={{padding:"12px 14px",borderRadius:6,background:sel?`${cc}11`:"#111",border:`1px solid ${sel?cc:"#222"}`,cursor:"pointer",textAlign:"left",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                      <div>
                        <div style={{fontSize:13,fontWeight:700,color:sel?cc:"#f0f0f0",fontFamily:F}}>{p.name}</div>
                        <div style={{fontSize:10,color:"#555",marginTop:2}}>Att {p.att} · Heat {p.heat}</div>
                      </div>
                      <div style={{fontSize:12,color:p.cost===0?"#22c55e":"#f59e0b",fontWeight:700}}>{p.cost===0?"Free":`$${p.cost}`}</div>
                    </button>
                  );})}
                </div>
              </div>
              <div style={{marginBottom:16}}>
                <div style={{fontSize:10,color:"#444",textTransform:"uppercase",letterSpacing:"0.1em",marginBottom:8}}>Announce On</div>
                <div style={{display:"flex",gap:8}}>
                  {SOCIAL_PLATFORMS.map(p=>{const on=w.socials.includes(p.id);return(
                    <button key={p.id} onClick={()=>toggleSocial(p.id)} style={{flex:1,padding:"12px 8px",borderRadius:6,textAlign:"center",background:on?`${cc}22`:"#111",border:`1px solid ${on?cc:"#222"}`,cursor:"pointer"}}>
                      <div style={{fontSize:12,fontWeight:700,color:on?cc:"#f0f0f0",marginBottom:2,fontFamily:F}}>{p.name}</div>
                      <div style={{fontSize:10,color:"#555"}}>{p.reach}</div>
                      <div style={{fontSize:10,color:"#f59e0b",marginTop:2}}>${p.cost}</div>
                    </button>
                  );})}
                </div>
              </div>
              <div>
                <div style={{fontSize:10,color:"#444",textTransform:"uppercase",letterSpacing:"0.1em",marginBottom:8}}>Security</div>
                <div style={{display:"flex",flexDirection:"column",gap:6}}>
                  {SECURITY.map(s=>{const sel=w.security===s.k;return(
                    <button key={s.k} onClick={()=>up("security",s.k)} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"12px 14px",borderRadius:6,background:sel?`${cc}11`:"#111",border:`1px solid ${sel?cc:"#222"}`,cursor:"pointer"}}>
                      <div style={{textAlign:"left"}}>
                        <div style={{fontSize:13,fontWeight:700,color:sel?cc:"#f0f0f0",fontFamily:F}}>{s.l}</div>
                        <div style={{fontSize:10,color:"#555",marginTop:1}}>{s.s} · Risk {s.risk}</div>
                      </div>
                      <div style={{fontSize:12,color:s.cost===0?"#22c55e":"#f59e0b",fontWeight:700}}>{s.cost===0?"Free":`$${s.cost}`}</div>
                    </button>
                  );})}
                </div>
              </div>
            </>
          )}

          {step===6&&(
            <div style={{display:"flex",flexDirection:"column",gap:6}}>
              {TIMING.map(t=>{const sel=w.timing?.t===t.t;return(
                <button key={t.t} onClick={()=>up("timing",t)} style={{padding:"12px 14px",borderRadius:6,background:sel?`${cc}11`:"#111",border:`1px solid ${sel?cc:"#222"}`,cursor:"pointer",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <div style={{textAlign:"left"}}>
                    <div style={{fontSize:13,fontWeight:700,color:sel?cc:"#f0f0f0",fontFamily:F}}>{t.label}</div>
                    <div style={{fontSize:11,color:"#555"}}>{t.sub}</div>
                  </div>
                  <div style={{fontSize:12,color:"#333",fontWeight:700}}>{t.t}</div>
                </button>
              );})}
            </div>
          )}

          {step===7&&(
            <>
              {w.thumbnail&&<div style={{marginBottom:14,borderRadius:8,overflow:"hidden",height:90}}><img src={w.thumbnail} style={{width:"100%",height:"100%",objectFit:"cover",display:"block"}} alt="preview"/></div>}
              <div style={{background:"#111",border:"1px solid #1e1e1e",borderRadius:8,padding:"14px",marginBottom:14}}>
                {[
                  ["Type",w.type||"—"],
                  ["Lineup",w.type==="Listening Party"?"—":w.callType==="open"?`Open Call · ${w.slots} slots`:`Invite Only · ${w.invitedArtists.length} invited`],
                  ["City",w.city?`${w.city.name}, ${w.region}`:"—"],
                  ["Venue",w.venue?`${w.venue.name} (cap: ${w.venue.cap})`:"—"],
                  ["Focus",w.focus||"—"],
                  ["Promo",w.promo?.name||"—"],
                  ["Socials",w.socials.length>0?w.socials.join(", "):"None"],
                  ["Security",SECURITY.find(s=>s.k===w.security)?.l||"None"],
                  ["Timing",w.timing?.label||"—"],
                  ["Name",w.name||"(auto-generated)"],
                ].map(([k,v])=>(
                  <div key={k} style={{display:"flex",justifyContent:"space-between",padding:"7px 0",borderBottom:"1px solid #181818",fontSize:12}}>
                    <span style={{color:"#444",fontSize:9,textTransform:"uppercase",letterSpacing:"0.1em"}}>{k}</span>
                    <span style={{color:"#f0f0f0",fontWeight:700,fontFamily:F,maxWidth:"62%",textAlign:"right"}}>{v}</span>
                  </div>
                ))}
              </div>
              <div style={{fontSize:10,color:"#444",textTransform:"uppercase",letterSpacing:"0.1em",marginBottom:8}}>Compliance mode</div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:6,marginBottom:14}}>
                {COMPLIANCE.map(c=>{const sel=w.compliance===c.k;return(
                  <button key={c.k} onClick={()=>up("compliance",c.k)} style={{padding:"10px 8px",borderRadius:6,background:sel?`${cc}11`:"#111",border:`1px solid ${sel?cc:"#222"}`,cursor:"pointer",textAlign:"center"}}>
                    <div style={{fontSize:12,fontWeight:700,color:sel?cc:"#f0f0f0",fontFamily:F}}>{c.l}</div>
                    <div style={{fontSize:9,color:"#444",marginTop:3,lineHeight:1.3}}>{c.s}</div>
                  </button>
                );})}
              </div>
              <button onClick={handleConfirm} disabled={loading} style={{width:"100%",padding:"14px",borderRadius:6,background:loading?"rgba(255,255,255,0.08)":"#ff5500",border:"none",color:"#fff",fontSize:14,fontWeight:700,cursor:loading?"default":"pointer",fontFamily:F,letterSpacing:"0.04em",opacity:loading?0.5:1}}>
                {loading ? "Making it happen..." : "Launch Event"}
              </button>
            </>
          )}

          {step<TOTAL-1&&(()=>{
            const canContinue = step===0?!!w.type:step===1?!!(w.city&&w.venue):step===6?!!w.timing:true;
            return(
            <div style={{display:"flex",gap:8,marginTop:16}}>
              {step>0&&<button onClick={()=>setStep(s=>s-1)} style={{flex:1,padding:"12px",borderRadius:6,background:"#111",border:"1px solid #222",color:"#888",fontSize:13,cursor:"pointer",fontFamily:F}}>Back</button>}
              <button onClick={()=>canContinue&&setStep(s=>s+1)} disabled={!canContinue} style={{flex:2,padding:"12px",borderRadius:6,background:canContinue?cc:"#222",border:"none",color:canContinue?"#fff":"#555",fontSize:13,fontWeight:700,cursor:canContinue?"pointer":"default",fontFamily:F,opacity:canContinue?1:0.5}}>Continue</button>
            </div>
            );
          })()}
        </div>
      </div>
    </div>
  );
}
