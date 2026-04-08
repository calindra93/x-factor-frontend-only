/**
 * NEWS GENERATION MODULE v2 — TMZ-style zesty clickbait journalism
 * Covers: fan wars, merch scandals, limited sellouts, chart debuts, career trends,
 *         collab signings, tour completions, era phases, viral moments, revenue milestones
 */

// ─── Types ──────────────────────────────────────────────────────────────────

interface NewsEvent {
  type: string;
  artist_name: string;
  genre?: string;
  region?: string;
  metrics?: any;
  context?: any;
  priority: number; // higher = more newsworthy
}

interface Article {
  headline: string;
  body: string;
  category: string;
  impact_score: number;
  source: string;
}

interface RuntimeTurnEvent {
  type?: string;
  event_type?: string;
  player_id?: string;
  global_turn_id?: number;
  turn?: number;
  city_name?: string;
  milestone?: number;
  artifact?: any;
  deltas?: Record<string, any>;
}

// ─── Sources ────────────────────────────────────────────────────────────────

const SOURCES = [
  'TMZ Music', 'The Shade Room', 'Complex', 'XXL Mag',
  'HotNewHipHop', 'Pitchfork Insider', 'Billboard Breaking',
  'NME Wire', 'Variety Music', 'Rolling Stone Live'
];

function pickSource(seed: number): string {
  return SOURCES[seed % SOURCES.length];
}

// ─── Headline + Body templates per event ────────────────────────────────────

function pick<T>(arr: T[], seed: number): T {
  return arr[seed % arr.length];
}

function buildArticle(event: NewsEvent, seed: number): Article {
  const n = event.artist_name;
  const m = event.metrics || {};
  const c = event.context || {};

  switch (event.type) {

    // ── Fan War ──────────────────────────────────────────────────────────────
    case 'fan_war': {
      const headlines = [
        `${n}'s Fandom Is At WAR With Itself — And We Have the Receipts 🍿`,
        `CHAOS: ${n} Fans Are Absolutely Losing It Online Right Now`,
        `The ${n} Stan Community Has Officially Imploded — Here's Everything`,
        `It's Getting UGLY: ${n} Superfans vs. Casuals Is Breaking the Internet`,
        `${n}'s Fanbase Just Went Full Civil War And Nobody Is Safe`,
      ];
      const bodies = [
        `Drama erupted across multiple platforms this week as factions of ${n}'s fanbase squared off in what insiders are calling "the messiest fan beef in recent memory." The flashpoint? A now-deleted post that set off a chain reaction of callouts, canceled streams, and group chat leaks. Sources close to the situation say the tension has been building for weeks. ${n}'s team has not yet commented, but the numbers don't lie — engagement is through the roof.`,
        `A full-scale fan war broke out in ${n}'s community over the weekend, spilling across Xpress, LoopTok, and every corner of the internet. Multiple fan accounts have been doxxed, stans are threatening mass unfollows, and at least three "official" fan clubs claim they're the real one. Industry observers note that this level of chaos, while exhausting, almost always signals a viral moment is coming. Stay tuned.`,
        `Things got messy in the ${n} fandom this week as a disagreement over the artist's recent direction spiraled into an all-out war. Multiple top fan accounts have gone private, a petition is circulating, and someone leaked a group chat. We reached out to ${n}'s management — they declined to comment, which is somehow making things worse.`,
      ];
      return {
        headline: pick(headlines, seed),
        body: pick(bodies, seed + 1),
        category: 'controversy',
        impact_score: -12,
        source: pick(SOURCES, seed),
      };
    }

    // ── Merch Scandal ────────────────────────────────────────────────────────
    case 'merch_scandal': {
      const headlines = [
        `${n}'s Merch Line Is Under FIRE — Questionable Sourcing Allegations Emerge`,
        `EXPOSED? ${n}'s New Drop Faces Serious Supply Chain Scrutiny`,
        `Fans Are Asking Hard Questions About ${n}'s Merch After Insider Tip`,
        `${n}'s Merch Empire May Have a Problem — And It Just Leaked Online`,
        `The Internet Is NOT Happy With ${n} Right Now — Merch Scandal Explained`,
      ];
      const bodies = [
        `${n} is facing uncomfortable questions today after an anonymous industry source flagged concerns about the supply chain behind their merch operation. While the specifics remain unconfirmed, screenshots circulating online show alleged sourcing documentation that fans aren't pleased about. Authenticity-first supporters are especially vocal, with several prominent fan accounts calling for a full audit. ${n}'s team has not issued a statement as of press time.`,
        `A merch scandal is brewing around ${n} after reports surfaced questioning the sourcing practices behind their latest drop. The allegations, first shared via an anonymous LoopTok post that has since gone viral, point to cut-rate production that contradicts ${n}'s publicly stated brand values. Critics are calling it "performative" while defenders argue it's unverified. Either way, the PR damage is already mounting.`,
        `${n} woke up to a PR nightmare today as claims about their merch supply chain spread rapidly across social media. Industry watchdogs have weighed in, with one analyst calling it "a classic case of margins over morals." The backlash is particularly fierce among ${n}'s authenticity-driven core fanbase, who feel personally betrayed. We'll be watching for any official response closely.`,
      ];
      return {
        headline: pick(headlines, seed),
        body: pick(bodies, seed + 1),
        category: 'controversy',
        impact_score: -18,
        source: pick(SOURCES, seed),
      };
    }

    // ── Limited Sellout ──────────────────────────────────────────────────────
    case 'limited_sellout': {
      const edition = c.edition || 'Limited';
      const units = m.units || 0;
      const headlines = [
        `${n}'s ${edition} Drop SOLD OUT in Hours — Resellers Already Cashing In 💸`,
        `GONE IN MINUTES: ${n}'s Exclusive Merch Just Made History`,
        `${n} Just Proved Why They're Untouchable — ${edition} Drop Obliterated`,
        `We Called It: ${n}'s ${edition} Release Sold Out and the Resale Market Is Insane`,
        `${edition} AND GONE: ${n}'s New Drop Has Fans Refreshing Carts in Tears`,
      ];
      const bodies = [
        `${n}'s ${edition.toLowerCase()} drop officially sold out, and the secondary market has already gone feral. Within hours of launch, all ${units > 0 ? units.toLocaleString() : 'available'} units moved. Resale listings are already appearing at 3-4x retail, and fans who missed out are not taking it well. "I set 14 alarms and still got the W for nothing," one devastated buyer posted. Industry insiders say the speed of the sellout signals serious demand momentum heading into ${n}'s next campaign.`,
        `It's official — ${n}'s ${edition.toLowerCase()} merch drop is completely gone, and the internet has opinions. The sellout, which happened faster than most anticipated, has become its own viral moment, with fans posting unboxings while others spiral in the replies. A quick scan of resale sites shows markups already deep in the ugly zone. ${n}'s team is reportedly "thrilled" with the response — as they should be.`,
      ];
      return {
        headline: pick(headlines, seed),
        body: pick(bodies, seed + 1),
        category: 'trending',
        impact_score: 20,
        source: pick(SOURCES, seed),
      };
    }

    // ── Streaming Spike ──────────────────────────────────────────────────────
    case 'stream_spike': {
      const streams = m.streams_earned || 0;
      const kStreams = streams >= 1000 ? `${(streams / 1000).toFixed(0)}K` : String(streams);
      const headlines = [
        `${n} Is EATING Right Now — Streaming Numbers Just Went Insane`,
        `${kStreams} Streams in One Day? ${n} Is Not Playing Games`,
        `The Algorithm Found ${n} and It's Beautiful to Watch`,
        `${n}'s Numbers Don't Lie — This Is a Full-Blown Streaming Surge`,
        `Everyone Is Streaming ${n} Right Now and We Need to Talk About It`,
      ];
      const bodies = [
        `${n} is having a moment — and the streaming data is impossible to ignore. A surge of ${kStreams} new plays in a single reporting window has the artist trending across platforms, with playlist curators and algorithm listeners apparently discovering the catalog en masse. Sources say the spike may be tied to a viral social clip, but whatever the catalyst, ${n} is clearly finding new ears fast.`,
        `Streaming platforms are lighting up for ${n} this week, with a reported ${kStreams} plays driving the kind of numbers that get label executives on the phone. The surge is organic, cross-platform, and showing no signs of cooling. An insider with knowledge of the numbers told us: "This doesn't happen by accident. Something clicked." ${n} has yet to comment, but the charts are speaking plenty loud on their own.`,
      ];
      return {
        headline: pick(headlines, seed),
        body: pick(bodies, seed + 1),
        category: 'trending',
        impact_score: 14,
        source: pick(SOURCES, seed),
      };
    }

    // ── Follower Surge ───────────────────────────────────────────────────────
    case 'follower_surge': {
      const gained = m.fan_growth || 0;
      const kGained = gained >= 1000 ? `${(gained / 1000).toFixed(1)}K` : `${gained}`;
      const headlines = [
        `${n} Just Gained ${kGained} Followers and the Industry Is Paying Attention`,
        `WHO IS ${n.toUpperCase()}?? The Rest of the Internet Is Finally Finding Out`,
        `${kGained} New Followers and Counting — ${n}'s Breakout Moment Is Here`,
        `${n}'s Growth Is Giving Viral Moment Energy and We're Here For It`,
        `The Algorithm Is Pushing ${n} Hard Right Now — ${kGained} Followers Don't Lie`,
      ];
      const bodies = [
        `${n} picked up ${kGained} new followers in a single turn — a growth spike that has industry observers taking notice. Whether driven by a viral clip, algorithmic push, or sheer word of mouth, the momentum is undeniable. Long-time fans are saying "we told you so" while a wave of new converts is flooding the comment sections with that very specific "just discovered this artist" energy.`,
        `It's happening fast for ${n}. A ${kGained}-follower surge in one reporting window has the emerging artist trending on multiple platforms simultaneously. Sources say a combination of consistent posting and an uptick in playlist pickups created the perfect viral conditions. One thing's for sure: ${n}'s name is in a lot more conversations today than it was yesterday.`,
      ];
      return {
        headline: pick(headlines, seed),
        body: pick(bodies, seed + 1),
        category: 'trending',
        impact_score: 12,
        source: pick(SOURCES, seed),
      };
    }

    // ── Era Triumph ──────────────────────────────────────────────────────────
    case 'era_triumph': {
      const era = c.era_name || 'current era';
      const headlines = [
        `${n}'s "${era}" Era Is the Most Talked-About Rollout of the Season`,
        `Critics Are Running Out of Adjectives for ${n}'s ${era} Era — It's THAT Good`,
        `${n} Is Locked IN: The "${era}" Era Just Hit Peak Momentum`,
        `The "${era}" Era Might Be ${n}'s Magnum Opus and the Data Agrees`,
        `${n}'s "${era}" Has the Industry on Its Knees — Here's Why`,
      ];
      const bodies = [
        `${n}'s "${era}" campaign has officially entered its peak phase, and the momentum is palpable across every metric that matters. Playlist placements are up, fan sentiment is euphoric, and critics who were skeptical early are quietly revising their takes. Industry insiders are already calling it a potential career-defining moment. The only question is how long the peak can be sustained.`,
        `There's a word for what ${n} is doing with the "${era}" era right now, and that word is "dominating." Streaming numbers, social engagement, and fan energy are all converging at a level the artist hasn't seen before. PR teams across the industry are studying the rollout as a case study in how to do a campaign right. ${n}'s team, for their part, seems to be enjoying every second of it.`,
      ];
      return {
        headline: pick(headlines, seed),
        body: pick(bodies, seed + 1),
        category: 'industry',
        impact_score: 16,
        source: pick(SOURCES, seed),
      };
    }

    // ── Era Flop ─────────────────────────────────────────────────────────────
    case 'era_flop': {
      const era = c.era_name || 'latest era';
      const headlines = [
        `Is ${n}'s "${era}" Era Already Over? The Numbers Are Concerning`,
        `We Need to Talk About What's Happening With ${n}'s "${era}" Rollout`,
        `${n}'s "${era}" Era Is Not Going the Way Anyone Expected`,
        `Insiders Are Worried About ${n}'s "${era}" Momentum — And They Should Be`,
        `The "${era}" Era Had So Much Promise. What Happened, ${n}?`,
      ];
      const bodies = [
        `${n}'s "${era}" campaign, once projected as a potential career peak, is showing troubling signs of stall. Momentum metrics have dipped sharply, and the fan energy that characterized the early rollout has cooled considerably. Whether it's a timing issue, creative misalignment, or just bad luck, the result is the same: ${n} has work to do. Sources say the team is "regrouping" and evaluating next steps.`,
        `The numbers are in and they're not pretty for ${n}'s "${era}" rollout. Engagement is down, playlist drops are happening, and the critical reception that started warm has turned lukewarm at best. It's not a catastrophe — careers have survived worse — but the trajectory is clearly not what was intended. What ${n} does next will define whether this is a blip or something more serious.`,
      ];
      return {
        headline: pick(headlines, seed),
        body: pick(bodies, seed + 1),
        category: 'industry',
        impact_score: -10,
        source: pick(SOURCES, seed),
      };
    }

    // ── Career Trend: Comeback ────────────────────────────────────────────────
    case 'trend_comeback': {
      const headlines = [
        `${n} Is BACK and They Came to Collect What's Theirs`,
        `The Comeback Nobody Saw Coming: ${n} Is On a Full Redemption Arc`,
        `Don't Look Now, But ${n} Just Flipped the Script Completely`,
        `${n}'s Return Is the Music Industry Story of the Month — Period`,
        `Everyone Counted ${n} Out. Everyone Was Wrong.`,
      ];
      const bodies = [
        `${n} has officially entered comeback territory, and the momentum behind it is real. After a stretch of quiet, the artist has re-emerged with the kind of numbers and energy that turns doubters into believers fast. Streaming is up, fan sentiment has done a full reversal, and the chart activity is hard to ignore. Industry veterans are calling it "the classic recalibration." ${n} might be calling it something less polite.`,
        `The music industry loves a comeback story, and ${n} is giving them one. Following a period that had critics writing premature eulogies, ${n}'s metrics have pivoted hard — follower growth is back, streams are climbing, and the fan engagement is vibrating at a frequency not seen in recent memory. One manager who declined to be named called it "one of the cleaner turnarounds I've watched in years." The redemption arc is real.`,
      ];
      return {
        headline: pick(headlines, seed),
        body: pick(bodies, seed + 1),
        category: 'trending',
        impact_score: 18,
        source: pick(SOURCES, seed),
      };
    }

    // ── Career Trend: One Hit Wonder Warning ─────────────────────────────────
    case 'trend_one_hit_wonder': {
      const headlines = [
        `Is ${n} a One-Hit Wonder? The Internet Has Opinions.`,
        `${n}'s Big Moment Was MASSIVE — But Can They Follow It Up?`,
        `The One-Hit Wonder Trap: Is ${n} Walking Right Into It?`,
        `Everyone Knows ${n}'s Hit. Nobody Knows What Comes Next.`,
        `Pressure Is Mounting on ${n} to Prove the Breakthrough Wasn't a Fluke`,
      ];
      const bodies = [
        `${n} is sitting on one of the year's biggest breakout tracks — and the pressure to follow it up is becoming very, very public. Multiple industry sources say the label is "watching closely" while fans are caught between excitement and anxiety. The trajectory is undeniably upward, but the pattern is familiar: massive single, quiet catalog, a fandom waiting to see if this is a career or a moment. ${n} has the attention. The question is what they do with it.`,
        `The spotlight found ${n} through a runaway hit, and now the real test begins. While the streaming numbers on that breakthrough track are genuinely impressive, observers note a thin catalog behind it — a classic setup for the one-hit-wonder narrative to take hold. ${n}'s team is reportedly accelerating new material to counter the story, but in the court of public opinion, timing is everything.`,
      ];
      return {
        headline: pick(headlines, seed),
        body: pick(bodies, seed + 1),
        category: 'industry',
        impact_score: -5,
        source: pick(SOURCES, seed),
      };
    }

    // ── Career Trend: Career Slump ────────────────────────────────────────────
    case 'trend_slump': {
      const headlines = [
        `${n}'s Numbers Are Down and the Industry Is Noticing`,
        `SOURCES: ${n}'s Team Is "Deeply Concerned" About Recent Trajectory`,
        `What Is Happening With ${n}? A Closer Look at a Troubling Trend`,
        `${n} Has Had Better Months — Inside the Slump Nobody's Talking About`,
        `The Quiet Crisis: ${n}'s Recent Metrics Are Raising Eyebrows Everywhere`,
      ];
      const bodies = [
        `${n} is navigating a rough stretch, and the data tells the story clearly. Consecutive decline turns, cooling fan sentiment, and an absence from the charts have put the artist in unfamiliar territory. Sources close to the camp describe the mood as "focused but tense." New material is reportedly in progress, but in this industry, momentum waits for no one. The next few turns will be defining.`,
        `Multiple metrics are pointing in the wrong direction for ${n} right now, and industry observers aren't sugarcoating it. Follower growth has stalled, hype is in decay, and the once-buzzing fan community has noticeably quieted. Whether this is a temporary plateau or something more serious depends heavily on what ${n} does next. The window for a correction is open — but it won't stay open forever.`,
      ];
      return {
        headline: pick(headlines, seed),
        body: pick(bodies, seed + 1),
        category: 'industry',
        impact_score: -14,
        source: pick(SOURCES, seed),
      };
    }

    // ── New Release Drop ──────────────────────────────────────────────────────
    case 'release_drop': {
      const title = c.release_name || 'new project';
      const type = c.project_type || 'release';
      const headlines = [
        `${n} Just DROPPED "${title}" and the Reactions Are Pouring In`,
        `SURPRISE: ${n} Releases "${title}" With Zero Warning — Fans Shook`,
        `"${title}" Is Out Now and ${n}'s Fans Are Already Unhinged About It`,
        `${n} Said "Take This" and Dropped "${title}" — First Listen Reactions Inside`,
        `${n}'s New ${type} "${title}" Is Here and the Internet Is Processing`,
      ];
      const bodies = [
        `${n} dropped "${title}" without much warning, and the initial fan response is exactly what you'd expect: chaotic, emotional, and extremely online. First-listen reaction threads are already miles long, with clips surfacing across every platform simultaneously. Industry insiders are noting the rollout strategy — lean and fast — as a calculated flex. Whether the music lives up to the hype is a conversation that will play out over the next 48 hours.`,
        `The wait is over. ${n}'s new ${type} "${title}" is officially out in the world, and streaming platforms are registering the impact in real time. Early commentary from fans ranges from "career best" to "give it time," which is honestly pretty standard for anything ${n} puts out. Critics are sharpening their pens. The conversation is just getting started.`,
      ];
      return {
        headline: pick(headlines, seed),
        body: pick(bodies, seed + 1),
        category: 'trending',
        impact_score: 15,
        source: pick(SOURCES, seed),
      };
    }

    // ── Tour Complete ─────────────────────────────────────────────────────────
    case 'tour_complete': {
      const tourName = c.tour_name || 'World Tour';
      const stops = m.stops || 0;
      const headlines = [
        `${n}'s ${tourName} Is a WRAP — Here's the Full Post-Mortem`,
        `${n} Just Finished the ${tourName} and the Numbers Are STAGGERING`,
        `${stops} Cities, ${stops} Shows, Zero Chill: ${n}'s ${tourName} Ends in Triumph`,
        `The ${tourName} Is Over — And ${n} Has Officially Leveled Up`,
        `${n} Closed Out the ${tourName} Last Night and the Crowd Was UNREAL`,
      ];
      const bodies = [
        `${n}'s ${tourName} wrapped last night and the final numbers are already generating serious industry buzz. Across ${stops > 0 ? stops : 'multiple'} stops, ${n} proved that their live show is more than just a concert — it's an event. Ticket revenue reportedly exceeded projections, merchandise lines were routinely selling out before the encore, and more than a few of those shows trended locally. The tour will be talked about for a while.`,
        `It's a wrap on ${n}'s ${tourName}, and the vibe in the camp is reportedly celebratory. Fan footage from the final show has been circulating all morning, and the consensus is clear: ${n} delivers live. Revenue from the run is expected to be a significant career milestone, and the experience base of ${stops > 0 ? stops : 'those'} shows will inform everything that comes next. Rest up, because the demand for a sequel is already loud.`,
      ];
      return {
        headline: pick(headlines, seed),
        body: pick(bodies, seed + 1),
        category: 'milestone',
        impact_score: 20,
        source: pick(SOURCES, seed),
      };
    }

    // ── Collaboration ─────────────────────────────────────────────────────────
    case 'collab': {
      const partner = c.partner_name || 'another artist';
      const headlines = [
        `${n} x ${partner}?? The Collaboration Nobody Saw Coming Just Got Confirmed`,
        `THE COLLAB IS REAL: ${n} and ${partner} Are Making Music Together`,
        `Sources Confirm: ${n} and ${partner} Are in the Studio — Fans Are Spiraling`,
        `${n} and ${partner} Just Announced a Joint Project and the Internet Broke`,
        `We've Been Waiting for This: ${n} and ${partner} Officially Linked Up`,
      ];
      const bodies = [
        `The collaboration rumor mill just paid out in a big way: ${n} and ${partner} have officially confirmed they're working together, and fans of both artists are in a collective spiral of excitement. Neither party has revealed what form the project will take, but a joint session photo posted overnight has done enough to send imaginations running wild. Industry observers are already calling it one of the more interesting artistic pairings of the current cycle.`,
        `It started as a rumor. Then it became a credible whisper. Now it's confirmed: ${n} and ${partner} are collaborating, and the music industry is paying close attention. The creative overlap between the two artists has been a topic of fan discussion for months, making this pairing feel both surprising and inevitable. Details remain sparse, but the teaser content that's already leaked suggests something genuinely unexpected is coming.`,
      ];
      return {
        headline: pick(headlines, seed),
        body: pick(bodies, seed + 1),
        category: 'industry',
        impact_score: 16,
        source: pick(SOURCES, seed),
      };
    }

    // ── Revenue Milestone ─────────────────────────────────────────────────────
    case 'revenue_milestone': {
      const income = m.income || 0;
      const formatted = income >= 1000 ? `$${(income / 1000).toFixed(1)}K` : `$${income}`;
      const headlines = [
        `${n} Is Getting PAID: ${formatted} Day Just Happened`,
        `The Bag Is Secured: ${n} Just Had a Career Revenue Milestone`,
        `${formatted} in a Single Turn? ${n} Is Playing a Different Game Now`,
        `${n}'s Revenue Numbers Are Out and They're Hard to Argue With`,
        `Not Just the Music: ${n}'s Business Is Making Serious Noise`,
      ];
      const bodies = [
        `${n} just put up ${formatted} in a single reporting window, and the financial implications are significant. Between streaming, merchandise, and ancillary income streams, the artist is building something that looks less like a music career and more like a genuine entertainment enterprise. Sources close to the team say this trajectory, if sustained, puts ${n} in a different conversation entirely within the next few cycles.`,
        `The numbers are speaking for themselves: ${n} generated ${formatted} in revenue recently, and the breakdown tells an interesting story. Multiple income streams are firing simultaneously — exactly what sustainable careers look like at this stage. Industry analysts are noting the diversification as a sign of sophisticated strategy, whether intentional or not. The bag is being secured, methodically.`,
      ];
      return {
        headline: pick(headlines, seed),
        body: pick(bodies, seed + 1),
        category: 'milestone',
        impact_score: 18,
        source: pick(SOURCES, seed),
      };
    }

    // ── Beef Started (Diss Track Dropped) ────────────────────────────────────
    case 'beef_started': {
      const target = c.target_name || 'another artist';
      const trackTitle = c.track_title || 'a new track';
      const headlines = [
        `SHOTS FIRED: ${n} Just Came For ${target} on "${trackTitle}" — Fans Are LOSING IT 🔥`,
        `IT'S ON: ${n} Drops Diss Track Targeting ${target} and the Internet Is SHOOK`,
        `${n} vs ${target}?? The Beef Is REAL and "${trackTitle}" Has ALL the Receipts`,
        `DRAMA ALERT: ${n} Just Declared WAR on ${target} — Here's Everything We Know`,
        `${n} Said ${target}'s Name Out LOUD on "${trackTitle}" — The Gloves Are OFF`,
        `BEEF SEASON: ${n} Drops "${trackTitle}" Aimed Directly at ${target} — Fans Pick Sides`,
      ];
      const bodies = [
        `The music industry woke up to chaos today as ${n} released "${trackTitle}" — a full-blown diss track targeting ${target}. The track, which dropped with zero warning, includes multiple direct references that leave absolutely no room for interpretation. Within minutes, both fanbases mobilized across every platform, with trending hashtags, leaked DMs, and at least three different "explained" videos already circulating. Industry insiders say ${target} has approximately 5 turns to respond or risk looking like they're dodging smoke. Sources close to ${n}'s camp describe the mood as "locked in and ready for whatever." This is about to get messy.`,
        `${n} just threw the first punch in what's shaping up to be one of the messiest beefs of the year. "${trackTitle}," released earlier today, is a direct shot at ${target} — and it's not subtle. Fans have already dissected every bar, with multiple lyric breakdowns trending across social media. The fandoms are at war, ${target}'s mentions are a warzone, and the pressure to respond is mounting by the hour. One music journalist called it "the kind of beef that defines careers." ${target} has 5 turns to clap back or take the L. The clock is ticking.`,
        `It's officially beef season. ${n} dropped "${trackTitle}" targeting ${target}, and the fallout is already nuclear. The track includes specific callouts, alleged receipts, and the kind of disrespect that demands a response. Fans are flooding timelines with reaction clips, side-by-side comparisons, and hot takes so spicy they're getting flagged. Multiple industry sources confirm ${target} is "aware" and "considering options," which is PR-speak for "scrambling." The response window is 5 turns. After that, the narrative writes itself. This is the content the internet was built for.`,
      ];
      return {
        headline: pick(headlines, seed),
        body: pick(bodies, seed + 1),
        category: 'controversy',
        impact_score: 25,
        source: pick(SOURCES, seed),
      };
    }

    // ── Beef Response (Clap Back Track) ──────────────────────────────────────
    case 'beef_response': {
      const aggressor = c.aggressor_name || 'their rival';
      const trackTitle = c.track_title || 'a response track';
      const headlines = [
        `${n} CLAPS BACK: "${trackTitle}" Is the Response ${aggressor} Didn't Want to Hear`,
        `THE RESPONSE IS HERE: ${n} Fires Back at ${aggressor} on "${trackTitle}" — It's BRUTAL`,
        `${n} Just Responded to ${aggressor} and the Bars Are DEVASTATING 💀`,
        `ROUND 2: ${n} Drops "${trackTitle}" — ${aggressor} Fans Are in SHAMBLES`,
        `${n} Said "BET" and Dropped "${trackTitle}" — This Beef Just Got REAL`,
        `THE CLAP BACK: ${n} vs ${aggressor} Escalates With "${trackTitle}" — Who Won?`,
      ];
      const bodies = [
        `${n} just entered the chat — and ${aggressor} might regret starting this. "${trackTitle}," the highly anticipated response track, dropped moments ago and it's every bit as vicious as fans hoped. The bars are surgical, the production is menacing, and the internet is already declaring a winner. ${aggressor}'s fanbase is scrambling to defend their artist while ${n}'s supporters are doing victory laps across every platform. Multiple lyric breakdowns are trending, and at least one line is already being called "career-ending." This beef has officially escalated, and neither side is backing down. The culture is eating.`,
        `The response is here, and it's exactly as brutal as promised. ${n} dropped "${trackTitle}" in direct retaliation to ${aggressor}'s recent diss, and the gloves are fully off. Industry insiders are calling it "one of the hardest clap backs in recent memory," with bars so specific that fans are pulling up old interviews for context. The beef, which started as a one-sided attack, is now a full-scale war. Both fanbases are mobilized, the memes are relentless, and the pressure is on ${aggressor} to respond again or concede. This is the kind of drama that defines eras.`,
        `${n} wasted no time. "${trackTitle}" is the response ${aggressor} was dreading, and it's every bit as disrespectful as the original diss warranted. The track includes alleged receipts, personal callouts, and production choices clearly designed to maximize damage. Fans are losing their minds, critics are writing think pieces, and the beef has officially reached the point where both artists' legacies are on the line. ${aggressor} started it, but ${n} just raised the stakes considerably. The next move will define how this ends.`,
      ];
      return {
        headline: pick(headlines, seed),
        body: pick(bodies, seed + 1),
        category: 'controversy',
        impact_score: 28,
        source: pick(SOURCES, seed),
      };
    }

    // ── Default fallback ──────────────────────────────────────────────────────
    // ── Festival: Legendary set ───────────────────────────────────────────────
    case 'festival_legendary': {
      const fest = c.festival_name || 'the festival';
      const headlines = [
        `${n} SHUT DOWN ${fest.toUpperCase()} and the Internet Is Still Not Okay`,
        `Everyone Who Was at ${fest} Watched ${n} Make History Last Night`,
        `${n}'s ${fest} Set Is Being Called the Performance of the Year. Already.`,
        `${n} Just Delivered a FESTIVAL-DEFINING Set at ${fest} — Here's What You Missed`,
      ];
      const bodies = [
        `The crowd lost it. The socials lost it. Frankly, we lost it. ${n}'s performance at ${fest} was the kind of set that people will be talking about long after the wristbands fade. Multiple moment cards landed. The crowd heat was off the charts. If you weren't there, you'll be telling people you were.`,
        `${n} arrived at ${fest} with something to prove and left with a legacy moment. Industry insiders are already re-evaluating their tier lists. Brand teams are making calls. This is what a festival-defining set looks like.`,
        `Not everyone delivers when the pressure is on. ${n} delivered, then delivered some more, then closed with something that broke the algorithm. ${fest} will be measuring sets against this one for years.`,
      ];
      return {
        headline: pick(headlines, seed),
        body: pick(bodies, seed + 1),
        category: 'festival',
        impact_score: 28,
        source: pick(SOURCES, seed),
      };
    }

    // ── Festival: Solid set ───────────────────────────────────────────────────
    case 'festival_solid': {
      const fest = c.festival_name || 'the festival';
      const headlines = [
        `${n} Showed the ${fest} Crowd Why the Hype Is Real`,
        `Solid Run: ${n} Delivers at ${fest} and Earns New Fans in the Process`,
        `${n} at ${fest} — A Respectable Performance That Did Exactly What It Needed To`,
      ];
      return {
        headline: pick(headlines, seed),
        body: `${n}'s slot at ${fest} was a well-executed performance that checked all the boxes. The crowd was into it, the material landed, and the artist walked away with a net positive on their industry standing. Not the ceiling, but firmly above the floor.`,
        category: 'festival',
        impact_score: 12,
        source: pick(SOURCES, seed),
      };
    }

    // ── Festival: Weak set ────────────────────────────────────────────────────
    case 'festival_weak': {
      const fest = c.festival_name || 'the festival';
      const headlines = [
        `${n}'s ${fest} Set Left the Crowd Cold — What Went Wrong?`,
        `Rough Night at ${fest}: ${n} Struggles to Connect with a Tough Crowd`,
        `${n} at ${fest} Was… Not It. Industry Watchers Are Asking Questions.`,
      ];
      return {
        headline: pick(headlines, seed),
        body: `It was a difficult watch. ${n}'s set at ${fest} failed to generate the energy the stage demanded. The crowd was polite at best, disengaged at worst, and the industry chatter after the show was not kind. This is the kind of performance that requires a strong follow-up to course-correct.`,
        category: 'festival',
        impact_score: 15,
        source: pick(SOURCES, seed),
      };
    }

    // ── Festival: Controversy ─────────────────────────────────────────────────
    case 'festival_controversy': {
      const fest = c.festival_name || 'a recent festival';
      const headlines = [
        `${n}'s ${fest} Appearance Is Already Trending for the Wrong Reasons`,
        `Credibility Watch: ${n}'s Festival Behavior Is Raising Eyebrows Industry-Wide`,
        `What Exactly Happened with ${n} at ${fest}? We Have Some Thoughts.`,
      ];
      return {
        headline: pick(headlines, seed),
        body: `The performance itself may be up for debate, but the conversation around ${n}'s conduct at ${fest} is not. Sources close to the festival's production team are talking. Social clips are circulating. The PR team has not responded. This is the kind of credibility hit that takes multiple strong runs to undo.`,
        category: 'festival',
        impact_score: 22,
        source: pick(SOURCES, seed),
      };
    }

    // ── Scene milestone ───────────────────────────────────────────────────────
    case 'scene_milestone': {
      const city = c.city_name || 'a local scene';
      const milestone = Number(c.milestone || m.milestone || 0);
      const headlines = [
        `${n} Just Hit a Major Scene Milestone in ${city}`,
        `${city} Is Officially Paying Attention to ${n}`,
        `${n}'s Reputation in ${city} Just Reached a New Tier`,
      ];
      return {
        headline: pick(headlines, seed),
        body: `${n} just crossed a meaningful reputation milestone in ${city}, a signal that the local scene is no longer treating the artist like a visitor. Promoters, tastemakers, and scene regulars are starting to recognize the name, and that kind of cultural footing tends to compound fast once it sticks.${milestone > 0 ? ` The new benchmark: ${milestone}.` : ''}`,
        category: 'milestone',
        impact_score: 14,
        source: pick(SOURCES, seed),
      };
    }

    // ── Artifact discovered ───────────────────────────────────────────────────
    case 'artifact_discovered': {
      const city = c.city_name || 'the scene';
      const artifactName = c.artifact_name || c.artifact?.name || 'a rare cultural artifact';
      const artifactRarity = c.artifact_rarity || c.artifact?.rarity || 'rare';
      return {
        headline: `${n} Unearthed ${artifactName} in ${city} — Scene Lore Is Getting Deep`,
        body: `${n} just uncovered ${artifactName} while moving through ${city}, and insiders are reading it as more than a collectible moment. In scenes where symbolism matters, discovering a ${artifactRarity} artifact can become part of an artist's myth-making arc — the kind of detail fans latch onto long after the show ends.`,
        category: 'culture',
        impact_score: 11,
        source: pick(SOURCES, seed),
      };
    }

    // ── Regional controversy ──────────────────────────────────────────────────
    case 'regional_controversy': {
      const city = c.city_name || c.epicenter_city_name || 'a key market';
      const controversyType = c.controversy_type || 'controversy';
      return {
        headline: `${n}'s Latest Controversy Is Hitting ${city} Especially Hard`,
        body: `${n} is dealing with fresh controversy fallout, but the impact isn't landing evenly. Sources tracking the blowback say ${city} has become the epicenter of the backlash, with local sentiment shifting faster than the national conversation. In practical terms, that means the artist's standing in one of their active scenes may take the hardest hit while the story is still developing. The trigger being discussed most: ${String(controversyType).replace(/_/g, ' ')}.`,
        category: 'controversy',
        impact_score: -16,
        source: pick(SOURCES, seed),
      };
    }

    default: {
      return {
        headline: `${n} Is Making Moves and the Industry Is Taking Notes`,
        body: `Activity is picking up around ${n}, with multiple data points converging to signal a meaningful moment in the artist's trajectory. Whether this is the beginning of a larger arc or a singular spike remains to be seen, but the name is coming up in conversations it wasn't in before. Watch this space.`,
        category: 'industry',
        impact_score: 5,
        source: pick(SOURCES, seed),
      };
    }
  }
}

function detectSceneAwareRuntimeEvents(
  player: any,
  runtimeTurnEvents: RuntimeTurnEvent[],
  globalTurnId: number,
): NewsEvent[] {
  const artistName: string = player.artist_name || player.name || 'Unknown Artist';
  const genre: string = player.genre || 'pop';
  const region: string = player.region || 'Global';
  const playerId = String(player.id || '');
  const newsEvents: NewsEvent[] = [];

  for (const rawEvent of runtimeTurnEvents || []) {
    const eventPlayerId = String(rawEvent?.player_id || '');
    if (eventPlayerId && playerId && eventPlayerId !== playerId) continue;

    if (rawEvent?.type === 'scene_milestone') {
      newsEvents.push({
        type: 'scene_milestone',
        artist_name: artistName,
        genre,
        region,
        metrics: { milestone: Number(rawEvent.milestone || 0) },
        context: {
          turn_id: globalTurnId,
          city_name: rawEvent.city_name || 'a local scene',
          milestone: Number(rawEvent.milestone || 0),
        },
        priority: 16 + Math.min(6, Math.floor((Number(rawEvent.milestone || 0)) / 25)),
      });
    }

    if (rawEvent?.type === 'artifact_discovered') {
      const artifact = rawEvent.artifact || {};
      newsEvents.push({
        type: 'artifact_discovered',
        artist_name: artistName,
        genre,
        region,
        metrics: {},
        context: {
          turn_id: globalTurnId,
          city_name: rawEvent.city_name || 'the scene',
          artifact_name: artifact.name || 'an artifact',
          artifact_rarity: artifact.rarity || 'rare',
          artifact,
        },
        priority: artifact.rarity === 'legendary' ? 21 : artifact.rarity === 'rare' ? 18 : 14,
      });
    }

    const eventType = String(rawEvent?.event_type || '');
    const deltas = rawEvent?.deltas || {};
    if (
      eventType.startsWith('controversy_')
      && deltas.epicenter_city_name
      && eventType !== 'controversy_tick'
    ) {
      newsEvents.push({
        type: 'regional_controversy',
        artist_name: artistName,
        genre,
        region,
        metrics: {
          local_reputation_delta: Number(deltas.local_reputation_delta || 0),
          brand_trust_delta: Number(deltas.brand_trust_delta || 0),
          fan_morale_delta: Number(deltas.fan_morale_delta || 0),
        },
        context: {
          turn_id: globalTurnId,
          city_name: deltas.epicenter_city_name,
          epicenter_city_name: deltas.epicenter_city_name,
          controversy_type: deltas.controversy_type || 'controversy',
          phase: deltas.phase || null,
        },
        priority: 23,
      });
    }
  }

  return newsEvents;
}

// ─── Event detection ─────────────────────────────────────────────────────────

export async function processNewsForPlayer(moduleCtx: any, player: any) {
  const { entities, globalTurnId } = moduleCtx;
  const newsItems: any[] = [];

  try {
    const artistName: string = player.artist_name || player.name || 'Unknown Artist';
    const genre: string = player.genre || 'pop';
    const region: string = player.region || 'Global';
    const turnMetrics = moduleCtx.turn_metrics || {};
    const runtimeTurnEvents: RuntimeTurnEvent[] = Array.isArray(moduleCtx.turn_events) ? moduleCtx.turn_events : [];
    const seed = (globalTurnId + (player.id?.charCodeAt(0) || 0)) % 997;

    const newsEvents: NewsEvent[] = [];
    newsEvents.push(...detectSceneAwareRuntimeEvents(player, runtimeTurnEvents, globalTurnId));

    // ── Fan war ──────────────────────────────────────────────────────────────
    // fan_war_intensity comes from fanWarTickModule via turn_metrics
    const fanWarIntensity = Number(turnMetrics.fan_war_intensity || turnMetrics.fandom_war_intensity || 0);
    if (fanWarIntensity > 0.65) {
      newsEvents.push({
        type: 'fan_war',
        artist_name: artistName, genre, region,
        metrics: { intensity: fanWarIntensity },
        context: { turn_id: globalTurnId },
        priority: Math.floor(fanWarIntensity * 20),
      });
    }

    // ── Merch scandal ─────────────────────────────────────────────────────────
    if (turnMetrics.merch_scandal_triggered) {
      newsEvents.push({
        type: 'merch_scandal',
        artist_name: artistName, genre, region,
        metrics: {},
        context: { turn_id: globalTurnId },
        priority: 25,
      });
    }

    // ── Limited edition sellout ───────────────────────────────────────────────
    // merch_limited_sellout_hype_boost > 0 means a Limited/Exclusive item sold out this turn
    const selloutBoost = Number(turnMetrics.merch_limited_sellout_hype_boost || 0);
    if (selloutBoost > 0) {
      const edition = selloutBoost >= 6 ? 'Exclusive' : 'Limited';
      newsEvents.push({
        type: 'limited_sellout',
        artist_name: artistName, genre, region,
        metrics: { units: turnMetrics.merch_units_sold || 0 },
        context: { turn_id: globalTurnId, edition },
        priority: 22,
      });
    }

    // ── Streaming spike ───────────────────────────────────────────────────────
    // streams_earned is per-turn streams (correct key)
    const streamsEarned = Number(turnMetrics.streams_earned || 0);
    if (streamsEarned > 5000) {
      newsEvents.push({
        type: 'stream_spike',
        artist_name: artistName, genre, region,
        metrics: { streams_earned: streamsEarned },
        context: { turn_id: globalTurnId },
        priority: Math.min(20, Math.floor(streamsEarned / 1000)),
      });
    }

    // ── Follower surge ────────────────────────────────────────────────────────
    // fan_growth is the signed delta (correct key, not follower_growth which doesn't exist)
    const fanGrowth = Number(turnMetrics.fan_growth || 0);
    if (fanGrowth > 500) {
      newsEvents.push({
        type: 'follower_surge',
        artist_name: artistName, genre, region,
        metrics: { fan_growth: fanGrowth, total: (player.fans || player.followers || 0) + fanGrowth },
        context: { turn_id: globalTurnId },
        priority: Math.min(18, Math.floor(fanGrowth / 200)),
      });
    }

    // ── New release drop ──────────────────────────────────────────────────────
    if (Number(turnMetrics.releases_activated || 0) > 0 && turnMetrics.latest_release_name) {
      newsEvents.push({
        type: 'release_drop',
        artist_name: artistName, genre, region,
        metrics: {},
        context: {
          turn_id: globalTurnId,
          release_name: turnMetrics.latest_release_name,
          project_type: turnMetrics.latest_release_type || 'Single',
        },
        priority: 17,
      });
    }

    // ── Era triumph / flop ────────────────────────────────────────────────────
    // era_momentum_change is the per-turn delta; era_phase is the current phase string
    const eraMomentumChange = Number(turnMetrics.era_momentum_change || 0);
    const eraPhase = turnMetrics.era_phase || '';
    if (eraMomentumChange > 15) {
      newsEvents.push({
        type: 'era_triumph',
        artist_name: artistName, genre, region,
        metrics: { momentum: eraMomentumChange },
        context: { turn_id: globalTurnId, era_phase: eraPhase, era_name: turnMetrics.era_name || 'current era' },
        priority: 14,
      });
    } else if (eraMomentumChange < -10 && eraPhase !== '') {
      newsEvents.push({
        type: 'era_flop',
        artist_name: artistName, genre, region,
        metrics: { momentum: eraMomentumChange },
        context: { turn_id: globalTurnId, era_phase: eraPhase, era_name: turnMetrics.era_name || 'latest era' },
        priority: 12,
      });
    }

    // ── Career trend changes ──────────────────────────────────────────────────
    const trendAdded: string[] = turnMetrics.career_trend_added || [];
    if (trendAdded.includes('COMEBACK')) {
      newsEvents.push({ type: 'trend_comeback', artist_name: artistName, genre, region, metrics: {}, context: { turn_id: globalTurnId }, priority: 19 });
    }
    if (trendAdded.includes('ONE_HIT_WONDER')) {
      newsEvents.push({ type: 'trend_one_hit_wonder', artist_name: artistName, genre, region, metrics: {}, context: { turn_id: globalTurnId }, priority: 16 });
    }
    if (trendAdded.includes('CAREER_SLUMP') || trendAdded.includes('CAREER_FLOP')) {
      newsEvents.push({ type: 'trend_slump', artist_name: artistName, genre, region, metrics: {}, context: { turn_id: globalTurnId }, priority: 13 });
    }

    // ── Tour complete ─────────────────────────────────────────────────────────
    if (turnMetrics.tour_completed) {
      newsEvents.push({
        type: 'tour_complete',
        artist_name: artistName, genre, region,
        metrics: { stops: turnMetrics.tour_stops_completed || 0, revenue: turnMetrics.touring_revenue || 0 },
        context: { turn_id: globalTurnId, tour_name: turnMetrics.tour_name || 'World Tour' },
        priority: 21,
      });
    }

    // ── Collab confirmed ──────────────────────────────────────────────────────
    if (turnMetrics.new_collab_partner) {
      newsEvents.push({
        type: 'collab',
        artist_name: artistName, genre, region,
        metrics: {},
        context: { turn_id: globalTurnId, partner_name: turnMetrics.new_collab_partner },
        priority: 18,
      });
    }

    // ── Revenue milestone ─────────────────────────────────────────────────────
    const netIncome = Number(turnMetrics.net_income_applied || turnMetrics.income_gained || 0);
    if (netIncome >= 500) {
      newsEvents.push({
        type: 'revenue_milestone',
        artist_name: artistName, genre, region,
        metrics: { income: netIncome },
        context: { turn_id: globalTurnId },
        priority: Math.min(15, Math.floor(netIncome / 200)),
      });
    }

    // ── Beef started (diss track dropped) ─────────────────────────────────────
    if (turnMetrics.beef_started) {
      newsEvents.push({
        type: 'beef_started',
        artist_name: artistName, genre, region,
        metrics: {},
        context: {
          turn_id: globalTurnId,
          target_name: turnMetrics.beef_target_name || 'another artist',
          track_title: turnMetrics.beef_track_title || 'a diss track',
        },
        priority: 30,
      });
    }

    // ── Beef response (clap back track) ───────────────────────────────────────
    if (turnMetrics.beef_response) {
      newsEvents.push({
        type: 'beef_response',
        artist_name: artistName, genre, region,
        metrics: {},
        context: {
          turn_id: globalTurnId,
          aggressor_name: turnMetrics.beef_aggressor_name || 'their rival',
          track_title: turnMetrics.beef_track_title || 'a response track',
        },
        priority: 32,
      });
    }

    // ── Festival events (Phase 3) ─────────────────────────────────────────────
    // Flags injected by turnScheduler.runNewsGenerationModule from recent festival_performance_results
    if (turnMetrics.festival_legendary_set) {
      newsEvents.push({
        type: 'festival_legendary',
        artist_name: artistName, genre, region,
        metrics: {},
        context: { turn_id: globalTurnId, festival_name: turnMetrics.festival_name || 'the festival' },
        priority: 28,
      });
    } else if (turnMetrics.festival_solid_set) {
      newsEvents.push({
        type: 'festival_solid',
        artist_name: artistName, genre, region,
        metrics: {},
        context: { turn_id: globalTurnId, festival_name: turnMetrics.festival_name || 'the festival' },
        priority: 12,
      });
    } else if (turnMetrics.festival_weak_set) {
      newsEvents.push({
        type: 'festival_weak',
        artist_name: artistName, genre, region,
        metrics: {},
        context: { turn_id: globalTurnId, festival_name: turnMetrics.festival_name || 'the festival' },
        priority: 15,
      });
    }
    if (turnMetrics.festival_controversy) {
      newsEvents.push({
        type: 'festival_controversy',
        artist_name: artistName, genre, region,
        metrics: {},
        context: { turn_id: globalTurnId, festival_name: turnMetrics.festival_name || 'a recent festival' },
        priority: 22,
      });
    }

    // ── Pick the single most newsworthy event ─────────────────────────────────
    if (newsEvents.length > 0) {
      newsEvents.sort((a, b) => b.priority - a.priority);
      const event = newsEvents[0];
      const article = buildArticle(event, seed);

      newsItems.push({
        id: crypto.randomUUID(),
        headline: article.headline,
        body: article.body,
        category: article.category,
        region,
        artist_id: player.id,
        impact_score: article.impact_score,
        source: article.source,
        metadata: {
          event_type: event.type,
          turn_id: globalTurnId,
          generated_by: 'news_module_v2',
          priority: event.priority,
        },
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
    }

    return { success: true, deltas: { news_items_to_create: newsItems } };

  } catch (error) {
    console.error('[NewsModule] Error:', (error as Error).message);
    return { success: false, error: (error as Error).message };
  }
}
