// ─── SHARED EVENT CONSTANTS ──────────────────────────────────────────────────
export const REGIONS = {
  "United States":  { short:"US",   cities:[{name:"New York",genres:["Hip-Hop","R&B","Pop","Jazz","Indie"],tier:5},{name:"Los Angeles",genres:["Pop","Hip-Hop","R&B","Electronic","Indie"],tier:5},{name:"Atlanta",genres:["Hip-Hop","Trap","R&B","Pop"],tier:4},{name:"Chicago",genres:["Hip-Hop","Drill","House","Jazz","R&B"],tier:3},{name:"Miami",genres:["Reggaeton","Electronic","Latin Pop","Hip-Hop","Pop"],tier:3},{name:"Houston",genres:["Hip-Hop","R&B","Country","Pop"],tier:2},{name:"Nashville",genres:["Country","Americana","Indie","Rock","Pop"],tier:3}]},
  "Canada":         { short:"CA",   cities:[{name:"Toronto",genres:["Hip-Hop","R&B","Dancehall","Pop","Electronic"],tier:4},{name:"Montreal",genres:["Electronic","Indie","Pop","Hip-Hop"],tier:2},{name:"Vancouver",genres:["Indie","Electronic","Hip-Hop","Pop"],tier:2}]},
  "United Kingdom": { short:"UK",   cities:[{name:"London",genres:["Grime","R&B","Pop","Electronic","Hip-Hop","Drill"],tier:5},{name:"Manchester",genres:["Rock","Indie","Electronic","Hip-Hop"],tier:3},{name:"Glasgow",genres:["Rock","Post-Punk","Indie","Electronic"],tier:2},{name:"Birmingham",genres:["Grime","Jungle","R&B","Hip-Hop","Rock"],tier:2}]},
  "Europe":         { short:"EU",   cities:[{name:"Berlin",genres:["Electronic","Techno","Experimental","Hip-Hop","Indie"],tier:4},{name:"Paris",genres:["Hip-Hop","Electronic","Pop","R&B","Jazz"],tier:4},{name:"Amsterdam",genres:["Electronic","Hip-Hop","Pop","Indie"],tier:3},{name:"Barcelona",genres:["Electronic","Latin Pop","Indie","Rock","Reggaeton"],tier:3},{name:"Stockholm",genres:["Pop","Electronic","Indie","Hip-Hop"],tier:3}]},
  "Asia":           { short:"AS",   cities:[{name:"Tokyo",genres:["J-Pop","Hip-Hop","Electronic","Rock","R&B"],tier:4},{name:"Seoul",genres:["K-Pop","Hip-Hop","R&B","Electronic"],tier:4},{name:"Mumbai",genres:["Bollywood","Hip-Hop","Electronic","Pop","R&B"],tier:3},{name:"Bangkok",genres:["Electronic","Hip-Hop","Pop","Indie"],tier:2},{name:"Shanghai",genres:["Electronic","Hip-Hop","Pop","R&B"],tier:3}]},
  "Latin America":  { short:"LATAM",cities:[{name:"Sao Paulo",genres:["Funk Carioca","Hip-Hop","Pop","Electronic","Sertanejo"],tier:4},{name:"Mexico City",genres:["Reggaeton","Hip-Hop","Rock","Pop","Electronic"],tier:3},{name:"Buenos Aires",genres:["Electronic","Rock","Tango","Hip-Hop","Indie"],tier:2},{name:"Bogota",genres:["Reggaeton","Latin Pop","Hip-Hop","Cumbia","Electronic"],tier:2}]},
  "Africa":         { short:"AF",   cities:[{name:"Lagos",genres:["Afrobeats","Highlife","Amapiano","Hip-Hop","R&B"],tier:4},{name:"Johannesburg",genres:["Amapiano","Kwaito","Hip-Hop","House","R&B"],tier:3},{name:"Nairobi",genres:["Gengetone","Hip-Hop","Afro-Fusion","Electronic","R&B"],tier:2},{name:"Accra",genres:["Highlife","Afrobeats","Hip-Hop","Dancehall"],tier:2}]},
  "Oceania":        { short:"OC",   cities:[{name:"Sydney",genres:["Pop","Electronic","Hip-Hop","Rock","Indie"],tier:3},{name:"Melbourne",genres:["Indie","Electronic","Rock","Hip-Hop","Jazz"],tier:2},{name:"Auckland",genres:["Hip-Hop","R&B","Reggae","Pop","Electronic"],tier:1}]},
};

export const catColors = {"Open Mic":"#ff5500","Showcase":"#a855f7","Battle":"#ef4444","Collab Night":"#22c55e","Block Party":"#f59e0b","Listening Party":"#3b82f6"};
export const EVENT_TYPES = ["Open Mic","Showcase","Battle","Collab Night","Block Party","Listening Party"];
export const typeKeyToDisplay = {open_mic:"Open Mic",showcase:"Showcase",battle:"Battle",collab_night:"Collab Night",block_party:"Block Party",listening_party:"Listening Party"};
export const typeNameToKey = {"Open Mic":"open_mic","Showcase":"showcase","Battle":"battle","Collab Night":"collab_night","Block Party":"block_party","Listening Party":"listening_party"};

// ─── SOUNDBURST HOME DATA ────────────────────────────────────────────────────
export const LOCAL_SCENE_HIGHLIGHTS = [
  {
    region: "Oakland",
    vibe: "Warehouse-ready bass and breakbeat hybrids.",
    sceneLead: "Echo Yard Collective",
    spotlight: "Rae Tempo — “Midnight Transfer” EP release show",
  },
  {
    region: "Detroit",
    vibe: "Analog synth heat with DIY vocal stacks.",
    sceneLead: "Northern Loop Radio",
    spotlight: "J-Lin x Kuri — live tape swap showcase",
  },
  {
    region: "Berlin",
    vibe: "Low-lit techno corners and experimental drones.",
    sceneLead: "Spree Subculture",
    spotlight: "Kora Nox — “Concrete Bloom” listening room",
  },
];

export const GRASSROOTS_CHARTS = [
  {
    rank: 1,
    title: "Rust Signal",
    artist: "Mono Cult",
    change: "+3",
    tag: "Underground House",
  },
  {
    rank: 2,
    title: "Concrete Bloom",
    artist: "Kora Nox",
    change: "-1",
    tag: "Night Drone",
  },
  {
    rank: 3,
    title: "Streetlight Choir",
    artist: "June Vandal",
    change: "+5",
    tag: "Indie Pulse",
  },
  {
    rank: 4,
    title: "Cloudline Burner",
    artist: "Kai/Arc",
    change: "-2",
    tag: "Alt R&B",
  },
];

export const COLLECTIVE_SPOTLIGHTS = [
  {
    name: "Moonlit Exchange",
    focus: "Cross-reposting cassette drops and basement videos.",
    members: "12 artists · 4 cities",
  },
  {
    name: "Low Key Network",
    focus: "Collaborative cover art swaps and live room shares.",
    members: "18 artists · 7 collectives",
  },
  {
    name: "Ghostwire",
    focus: "Mutual shoutouts for micro-tours and community playlists.",
    members: "9 artists · 3 radio hosts",
  },
];
