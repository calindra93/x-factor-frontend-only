export const TOUR_STOPS = [
  {
    city: "Los Angeles, CA",
    venue: "Nova Fieldhouse",
    status: "On Sale",
    dates: [
      { day: "Aug 22, 2024", note: "Night Market Sessions", time: "8:00 PM" },
      { day: "Aug 23, 2024", note: "After-hours soundcheck", time: "10:30 PM" },
    ],
  },
  {
    city: "Chicago, IL",
    venue: "Skyline Vault",
    status: "Limited",
    dates: [
      { day: "Sep 05, 2024", note: "Main showcase", time: "7:30 PM" },
      { day: "Sep 06, 2024", note: "Pop-up listening lounge", time: "6:00 PM" },
    ],
  },
  {
    city: "New York, NY",
    venue: "Pierlight Room",
    status: "Waitlist",
    dates: [
      { day: "Sep 20, 2024", note: "Brooklyn headline night", time: "9:00 PM" },
      { day: "Sep 21, 2024", note: "Creator Q&A + panel", time: "4:00 PM" },
    ],
  },
];

export const UPCOMING_PROJECTS = [
  {
    type: "EP",
    title: "Glasslight: Midnight Cuts",
    releaseDate: "Oct 11, 2024",
    status: "In Final Mix",
    description: "Five-track EP with ambient interludes and a guest vocal feature.",
    highlights: ["5 tracks", "Guest feature", "Spatial audio"],
  },
  {
    type: "Album",
    title: "Neon Drift: The Long Way",
    releaseDate: "Dec 06, 2024",
    status: "Mastering",
    description: "Full-length album capturing the tour diaries with cinematic synth textures.",
    highlights: ["12 tracks", "Vinyl-ready", "Documentary visuals"],
  },
  {
    type: "Single",
    title: "Signal Bloom",
    releaseDate: "Nov 01, 2024",
    status: "In Production",
    description: "High-energy single built for Streamify playlists and radio rotation.",
    highlights: ["Radio edit", "Dance remix", "Live visualizer"],
  },
  {
    type: "Single",
    title: "Quiet Sparks",
    releaseDate: "Out Now",
    status: "Out Now",
    description: "Acoustic-led release highlighted for AppleCore editorial playlists.",
    highlights: ["Live session", "Hi-res master", "Limited merch"],
  },
];

export const ARTISTS_PICK = {
  type: "Single",
  title: "Glasslight (Extended Mix)",
  releaseDate: "Featured: Aug 02, 2024",
  description:
    "A deep-cut version built for late-night playlists with new stems and a cinematic outro.",
  tags: ["Streamify Featured", "Soundburst Premiere", "AppleCore Hi-Res"],
  image:
    "https://images.unsplash.com/photo-1485579149621-3123dd979885?auto=format&fit=crop&w=600&q=80",
  stats: [
    { label: "Streams", value: "38.4M", detail: "+12% WoW" },
    { label: "Saves", value: "1.2M", detail: "Top 5% catalog" },
    { label: "Playlist Adds", value: "9.6K", detail: "Global momentum" },
  ],
};
