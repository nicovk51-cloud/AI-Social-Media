/**
 * AI Social Media - Debate Engine V4 - WEEKLY CYCLE
 * 
 * Schema:
 * - Maandag t/m Vrijdag: 08:00, 12:00, 18:00, 22:00 → Dialoog posts
 * - Zaterdag 09:00 → Referee samenvatting van de week
 * - Zondag 09:00 → Nieuw thema starten (4 opening posts)
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

// ES Module path setup
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Bestandspaden
const HTML_PATH = resolve(__dirname, 'public', 'index.html');
const TOPICS_PATH = resolve(__dirname, 'public', 'topics.json');

console.log(`📂 Script locatie: ${__dirname}`);
console.log(`📄 HTML pad: ${HTML_PATH}`);

// ============================================
// CONFIGURATIE
// ============================================

const nodeVersion = parseInt(process.version.slice(1).split('.')[0]);
if (nodeVersion < 18) {
  console.error(`❌ Node.js ${process.version} is te oud. Minimaal versie 18 vereist.`);
  process.exit(1);
}

const CONFIG = {
  model: 'claude-3-haiku-20240307',
  defaultMaxTokens: 150,
  apiDelay: 500,
  timezone: 'Europe/Amsterdam'
};

// ============================================
// TIJD & DATUM
// ============================================

function getAmsterdamTime() {
  const now = new Date();
  const amsterdamStr = now.toLocaleString('en-US', { timeZone: CONFIG.timezone });
  return new Date(amsterdamStr);
}

const amsterdamTime = getAmsterdamTime();
const DAY = amsterdamTime.getDay();
const HOUR = amsterdamTime.getHours();

console.log('═══════════════════════════════════════════');
console.log('🤖 AI SOCIAL MEDIA - WEEKLY CYCLE V4');
console.log('═══════════════════════════════════════════');
console.log(`📅 Amsterdam tijd: ${amsterdamTime.toLocaleString('nl-NL')}`);
console.log(`📆 Dag: ${DAY} (0=zo, 6=za) | Uur: ${HOUR}`);
console.log('───────────────────────────────────────────');

// ============================================
// FILE HELPERS
// ============================================

function loadHTML() {
  if (!existsSync(HTML_PATH)) {
    console.error(`❌ HTML bestand niet gevonden: ${HTML_PATH}`);
    process.exit(1);
  }
  return readFileSync(HTML_PATH, 'utf-8');
}

function saveHTML(html) {
  writeFileSync(HTML_PATH, html, 'utf-8');
  console.log(`💾 HTML opgeslagen: ${HTML_PATH}`);
}

function loadTopics() {
  if (!existsSync(TOPICS_PATH)) {
    console.error(`❌ Topics bestand niet gevonden: ${TOPICS_PATH}`);
    process.exit(1);
  }
  const data = readFileSync(TOPICS_PATH, 'utf-8');
  return JSON.parse(data);
}

// ============================================
// TOPIC BANNER UPDATE
// ============================================

function updateTopicBanner(html, topic) {
  console.log(`\n🏷️ Update topic banner: "${topic.title}"`);
  
  let newHtml = html;
  
  // Update topic-label (categorie)
  newHtml = newHtml.replace(
    /<div class="topic-label">[^<]*<\/div>/,
    `<div class="topic-label">${topic.category}</div>`
  );
  
  // Update topic-title
  newHtml = newHtml.replace(
    /<h1 class="topic-title">[^<]*<\/h1>/,
    `<h1 class="topic-title">${topic.title}</h1>`
  );
  
  // Update topic-week
  newHtml = newHtml.replace(
    /<div class="topic-week">[^<]*<\/div>/,
    `<div class="topic-week">Week ${topic.weekNumber} van 52</div>`
  );
  
  console.log(`   ✅ Banner bijgewerkt: ${topic.category} | ${topic.title} | Week ${topic.weekNumber}`);
  
  return newHtml;
}

// ============================================
// POST PARSING - LEES BESTAANDE POSTS
// ============================================

function extractExistingPosts(html) {
  const posts = [];
  
  // Match message-cards met hun ID
  const cardRegex = /<div class="message-card ([^"]+)"[^>]*id="([^"]+)"[^>]*>/g;
  
  let match;
  while ((match = cardRegex.exec(html)) !== null) {
    const classes = match[1];
    const id = match[2];
    
    // Extract perspective
    const perspectiveMatch = classes.match(/\b(north|east|south|west|referee)\b/);
    const perspective = perspectiveMatch ? perspectiveMatch[1].toUpperCase() : 'UNKNOWN';
    
    // Skip welkomst
    if (id === 'welcome-post' || classes.includes('welcome')) {
      continue;
    }
    
    // Zoek content voor deze specifieke post
    const postStart = match.index;
    const contentMatch = html.slice(postStart, postStart + 2000).match(/<div class="message-content">([\s\S]*?)<\/div>/);
    const timeMatch = html.slice(postStart, postStart + 1000).match(/<div class="message-time">([^<]+)/);
    
    const content = contentMatch ? contentMatch[1].trim() : '';
    const time = timeMatch ? timeMatch[1].trim() : '';
    
    // Bepaal parentPostId voor replies (kijk naar de replies-container waar dit in zit)
    let parentPostId = null;
    if (id.startsWith('reply-')) {
      // Zoek achterwaarts naar de parent's replies container
      const beforePost = html.slice(0, postStart);
      const repliesContainerMatch = beforePost.match(/id="replies-(post-[^"]+)"[^>]*>\s*(?:<!-- REPLIES -->)?\s*$/);
      if (repliesContainerMatch) {
        parentPostId = repliesContainerMatch[1];
      }
    }
    
    posts.push({
      perspective: perspective,
      time: time,
      content: content.replace(/<br>/g, '\n').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&'),
      id: id,
      parentPostId: parentPostId
    });
  }
  
  return posts;
}

// ============================================
// CLAUDE API CALL
// ============================================

async function callClaude(prompt, maxTokens = CONFIG.defaultMaxTokens) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('❌ ANTHROPIC_API_KEY environment variable niet ingesteld!');
  }

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: CONFIG.model,
        max_tokens: maxTokens,
        messages: [{ role: 'user', content: prompt }]
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`API fout ${response.status}: ${errText}`);
    }

    const data = await response.json();
    return data.content[0].text.trim();
  } catch (err) {
    console.error('❌ Claude API call mislukt:', err.message);
    throw err;
  }
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ============================================
// PERSONAS
// ============================================

const PERSONAS = {
  north: {
    name: 'NORTH AI',
    style: 'urgent, data-gedreven, pleit voor actie',
    focus: 'wetenschap, urgentie, overheidsbeleid'
  },
  east: {
    name: 'EAST AI', 
    style: 'pragmatisch, analytisch, economisch onderbouwd',
    focus: 'markt, innovatie, kosten-baten'
  },
  south: {
    name: 'SOUTH AI',
    style: 'verbindend, genuanceerd, zoekt balans',
    focus: 'systemen, gemeenschap, inclusiviteit'
  },
  west: {
    name: 'WEST AI',
    style: 'filosofisch, reflectief, vraagt naar waarden',
    focus: 'ethiek, lange termijn, innerlijke transformatie'
  }
};

// ============================================
// DATUM HELPERS
// ============================================

function formatDateString() {
  const now = new Date();
  return now.toLocaleDateString('nl-NL', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  });
}

function formatTimeString(hour) {
  return `${String(hour).padStart(2, '0')}:00`;
}

// ============================================
// POST CARD CREATION - REDDIT STYLE
// ============================================

function createPostCard(perspective, time, content, isReply = false) {
  const badge = '<span class="new-badge">NIEUW</span>';
  const dateStr = formatDateString();
  const perspectiveUpper = perspective.toUpperCase();
  const perspectiveLower = perspective.toLowerCase();
  
  const safeContent = content
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n/g, '<br>');
  
  const postId = `post-${perspectiveLower}-${time.replace(':', '')}`;
  const replyClass = isReply ? ' reply' : '';
  
  // Post MET replies container (voor toekomstige replies)
  return `
            <div class="message-card ${perspectiveLower}${replyClass}" id="${postId}">
                <div class="message-header">
                    <div class="avatar ${perspectiveLower}">
                        <img src="${perspectiveLower}-badge.jpg" alt="${perspectiveUpper} AI">
                    </div>
                    <div class="message-meta">
                        <div class="author-name">${perspectiveUpper} AI ${badge}</div>
                        <div class="message-time">${time} <span class="time-slot">• ${dateStr}</span></div>
                    </div>
                </div>
                <div class="message-content">
                    ${safeContent}
                </div>
                <div class="replies" id="replies-${postId}">
                    <!-- REPLIES -->
                </div>
            </div>`;
}

// Reply card (zonder eigen replies container - geen diepere nesting)
function createReplyCard(perspective, time, content) {
  const badge = '<span class="new-badge">NIEUW</span>';
  const dateStr = formatDateString();
  const perspectiveUpper = perspective.toUpperCase();
  const perspectiveLower = perspective.toLowerCase();
  
  const safeContent = content
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n/g, '<br>');
  
  const postId = `reply-${perspectiveLower}-${time.replace(':', '')}`;
  
  return `
                    <div class="message-card ${perspectiveLower} reply" id="${postId}">
                        <div class="message-header">
                            <div class="avatar ${perspectiveLower}">
                                <img src="${perspectiveLower}-badge.jpg" alt="${perspectiveUpper} AI">
                            </div>
                            <div class="message-meta">
                                <div class="author-name">${perspectiveUpper} AI ${badge}</div>
                                <div class="message-time">${time} <span class="time-slot">• ${dateStr}</span></div>
                            </div>
                        </div>
                        <div class="message-content">
                            ${safeContent}
                        </div>
                    </div>`;
}

// Referee samenvatting card
function createRefereeCard(time, content) {
  const badge = '<span class="new-badge">SAMENVATTING</span>';
  const dateStr = formatDateString();
  
  const safeContent = content
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n/g, '<br>');
  
  const postId = `post-referee-${time.replace(':', '')}`;
  
  return `
            <div class="message-card referee" id="${postId}">
                <div class="message-header">
                    <div class="avatar referee">
                        <img src="referee-badge.jpg" alt="REFEREE AI">
                    </div>
                    <div class="message-meta">
                        <div class="author-name">REFEREE AI ${badge}</div>
                        <div class="message-time">${time} <span class="time-slot">• ${dateStr}</span></div>
                    </div>
                </div>
                <div class="message-content">
                    ${safeContent}
                </div>
                <div class="replies" id="replies-${postId}">
                    <!-- REPLIES -->
                </div>
            </div>`;
}

// ============================================
// THEMA BEREKENING
// ============================================

function getCurrentTopic() {
  const topics = loadTopics();
  const startDate = new Date('2025-12-14T00:00:00');
  const now = new Date();
  
  const diffMs = now - startDate;
  const diffDays = Math.floor(diffMs / (24 * 60 * 60 * 1000));
  let weekNumber = Math.floor(diffDays / 7) + 1;
  
  if (weekNumber < 1) weekNumber = 1;
  
  let topic = topics.topics.find(t => t.week === weekNumber);
  
  if (!topic) {
    const cycledWeek = ((weekNumber - 1) % 52) + 1;
    topic = topics.topics.find(t => t.week === cycledWeek);
  }
  
  if (!topic) {
    topic = topics.topics[0];
  }
  
  console.log(`📌 Huidig thema: Week ${weekNumber} - "${topic.title}"`);
  
  return { ...topic, weekNumber };
}

function getNextTopic() {
  const topics = loadTopics();
  const startDate = new Date('2025-12-14T00:00:00');
  const now = new Date();
  
  const diffMs = now - startDate;
  const diffDays = Math.floor(diffMs / (24 * 60 * 60 * 1000));
  let weekNumber = Math.floor(diffDays / 7) + 2; // +2 voor volgende week
  
  if (weekNumber < 1) weekNumber = 1;
  
  let topic = topics.topics.find(t => t.week === weekNumber);
  
  if (!topic) {
    const cycledWeek = ((weekNumber - 1) % 52) + 1;
    topic = topics.topics.find(t => t.week === cycledWeek);
  }
  
  if (!topic) {
    topic = topics.topics[0];
  }
  
  console.log(`📌 Volgend thema: Week ${weekNumber} - "${topic.title}"`);
  
  return { ...topic, weekNumber };
}

// ============================================
// SELECTEER POST OM OP TE REAGEREN
// ============================================

function selectPostToReplyTo(perspective, existingPosts, newRepliesThisRound = []) {
  // Filter hoofdposts van ANDERE perspectieven
  const otherPosts = existingPosts.filter(p => 
    p.perspective.toLowerCase() !== perspective.toLowerCase() &&
    !p.id.startsWith('reply-') // Alleen reageren op hoofdposts, niet op replies
  );
  
  if (otherPosts.length === 0) return null;
  
  // Tel replies per post uit existingPosts EN nieuwe replies deze ronde
  const postsWithReplyCount = otherPosts.map(post => {
    // Tel bestaande replies in HTML (replies hebben parentId in hun ID structuur)
    const existingReplies = existingPosts.filter(p => 
      p.id.startsWith('reply-') &&
      p.parentPostId === post.id
    ).length;
    
    // Tel nieuwe replies die deze ronde al zijn toegevoegd
    const newReplies = newRepliesThisRound.filter(r => r.parentId === post.id).length;
    
    return {
      ...post,
      replyCount: existingReplies + newReplies
    };
  });
  
  // Sorteer op minste replies (laagste eerst)
  postsWithReplyCount.sort((a, b) => a.replyCount - b.replyCount);
  
  // Voorkeur voor bepaalde tegenstanders bij gelijke reply counts
  const opposites = {
    north: ['east', 'west'],
    east: ['north', 'south'],
    south: ['north', 'east'],
    west: ['north', 'east']
  };
  
  const preferredOpponents = opposites[perspective.toLowerCase()] || [];
  const minReplies = postsWithReplyCount[0].replyCount;
  
  // Filter posts met het minimum aantal replies
  const postsWithMinReplies = postsWithReplyCount.filter(p => p.replyCount === minReplies);
  
  // Probeer eerst een voorkeurs-tegenstander te vinden met min replies
  for (const opponent of preferredOpponents) {
    const opponentPost = postsWithMinReplies.find(p => 
      p.perspective.toLowerCase() === opponent
    );
    if (opponentPost) {
      console.log(`      📊 Gekozen: ${opponentPost.perspective} (${opponentPost.replyCount} replies, voorkeur)`);
      return opponentPost;
    }
  }
  
  // Anders de post met minste replies
  console.log(`      📊 Gekozen: ${postsWithMinReplies[0].perspective} (${postsWithMinReplies[0].replyCount} replies)`);
  return postsWithMinReplies[0];
}

// ============================================
// GENEREER CONTENT
// ============================================

async function generateDialogueReaction(perspective, topic, replyToPost, allRecentPosts) {
  const persona = PERSONAS[perspective.toLowerCase()];
  
  const recentContext = allRecentPosts
    .slice(0, 3)
    .map(p => `${p.perspective}: "${p.content.substring(0, 150)}..."`)
    .join('\n');
  
  const prompt = `Je bent ${persona.name} in een lopend debat.
Jouw stijl: ${persona.style}
Jouw focus: ${persona.focus}

THEMA: "${topic.title}"

Je reageert NU DIRECT op ${replyToPost.perspective} die zei:
"${replyToPost.content}"

RECENTE DISCUSSIE:
${recentContext}

INSTRUCTIES:
- Reageer DIRECT op wat ${replyToPost.perspective} zei
- Begin NIET met "Als ${persona.name}..." of een introductie
- Ga meteen in op hun argument
- Wees het eens OF oneens met specifieke punten
- Voeg 1 nieuw inzicht of vraag toe
- Max 60 woorden, Nederlands

Schrijf nu je reactie:`;

  const content = await callClaude(prompt, 150);
  
  return content
    .replace(/^Als \w+ AI[,:]?\s*/i, '')
    .replace(/^Vanuit (mijn|het) \w+ perspectief[,:]?\s*/i, '')
    .replace(/^Bedankt voor.*?\.\s*/i, '')
    .trim();
}

async function generateOpeningPost(perspective, topic) {
  const persona = PERSONAS[perspective.toLowerCase()];
  
  const prompt = `Je bent ${persona.name} en start een nieuw debat.
Jouw stijl: ${persona.style}
Jouw focus: ${persona.focus}

THEMA: "${topic.title}" (categorie: ${topic.category})

Geef je OPENINGSSTANDPUNT over dit thema.

INSTRUCTIES:
- Begin DIRECT met je standpunt, niet met introductie
- Noem 1-2 concrete punten
- Stel eventueel een vraag aan de anderen
- Max 60 woorden, Nederlands

Schrijf nu je opening:`;

  const content = await callClaude(prompt, 150);
  
  return content
    .replace(/^Als \w+ AI[,:]?\s*/i, '')
    .replace(/^Vanuit (mijn|het) \w+ perspectief[,:]?\s*/i, '')
    .trim();
}

async function generateRefereeSummaryContent(topic, existingPosts) {
  // Filter alleen posts van deze week (geen referee posts)
  const debatePosts = existingPosts.filter(p => 
    p.perspective !== 'REFEREE' && 
    !p.id.includes('welcome')
  );
  
  if (debatePosts.length === 0) {
    return "Deze week waren er geen discussies om samen te vatten. Volgende week starten we met een nieuw thema!";
  }
  
  // Groepeer posts per perspectief
  const byPerspective = {};
  for (const post of debatePosts) {
    if (!byPerspective[post.perspective]) {
      byPerspective[post.perspective] = [];
    }
    byPerspective[post.perspective].push(post.content);
  }
  
  // Maak samenvatting per perspectief
  const summaryParts = Object.entries(byPerspective)
    .map(([perspective, contents]) => {
      const combined = contents.slice(0, 3).join(' ').substring(0, 200);
      return `${perspective}: "${combined}..."`;
    })
    .join('\n');
  
  const prompt = `Je bent REFEREE AI en geeft een WEEKSAMENVATTING van het debat.

THEMA: "${topic.title}"

STANDPUNTEN DEZE WEEK:
${summaryParts}

INSTRUCTIES:
- Vat de belangrijkste argumenten van elke AI samen
- Benoem punten van overeenstemming
- Benoem punten van verschil
- Geef een neutrale conclusie
- Max 150 woorden, Nederlands
- Begin NIET met "Als Referee AI..." of introductie

Schrijf nu je samenvatting:`;

  const content = await callClaude(prompt, 300);
  
  return content
    .replace(/^Als Referee AI[,:]?\s*/i, '')
    .replace(/^Samenvatting[:\s]*/i, '')
    .trim();
}

// ============================================
// GENEREER POSTS - VERSCHILLENDE TYPES
// ============================================

async function generateDialoguePosts(topic, timeSlot, existingPosts) {
  const slotNames = { 8: 'ochtend', 12: 'middag', 18: 'avond', 22: 'late avond' };
  console.log(`\n📝 Genereer ${slotNames[timeSlot]} posts (dialoog)...`);
  
  const results = [];
  const perspectives = ['north', 'east', 'south', 'west'];
  
  // Sorteer bestaande posts (nieuwste eerst)
  const sortedPosts = [...existingPosts].sort((a, b) => b.time.localeCompare(a.time));
  
  // Filter alleen hoofdposts (geen replies) voor reactie-selectie
  const mainPosts = sortedPosts.filter(p => !p.id.startsWith('reply-'));
  
  // Track nieuwe replies deze ronde voor eerlijke verdeling
  const newRepliesThisRound = [];
  
  // 08:00 = opening posts (niemand reageert)
  // 12:00, 18:00, 22:00 = reacties op posts met minste replies
  const isOpeningSlot = (timeSlot === 8);
  
  for (const perspective of perspectives) {
    console.log(`   → ${perspective.toUpperCase()} AI...`);
    
    let content;
    let replyToPost = null;
    
    if (isOpeningSlot || mainPosts.length === 0) {
      // 08:00 OF geen bestaande posts -> opening post
      console.log(`      ↳ Opening post (${isOpeningSlot ? '08:00 slot' : 'geen posts'})`);
      content = await generateOpeningPost(perspective, topic);
      
      results.push({
        type: 'opening',
        html: createPostCard(perspective, formatTimeString(timeSlot), content, false),
        perspective: perspective
      });
      
    } else {
      // 12:00, 18:00, 22:00 -> reageer op post met minste replies
      replyToPost = selectPostToReplyTo(perspective, [...mainPosts, ...existingPosts], newRepliesThisRound);
      
      if (replyToPost) {
        content = await generateDialogueReaction(perspective, topic, replyToPost, sortedPosts);
        console.log(`      ↳ Reageert BINNEN ${replyToPost.perspective}'s post`);
        
        const replyResult = {
          type: 'reply',
          html: createReplyCard(perspective, formatTimeString(timeSlot), content),
          parentId: replyToPost.id,
          perspective: perspective
        };
        
        results.push(replyResult);
        
        // Track deze reply voor verdeling naar volgende AI's
        newRepliesThisRound.push(replyResult);
      } else {
        // Fallback: geen geschikte post gevonden om op te reageren
        console.log(`      ↳ Geen geschikte post om op te reageren, maak opening`);
        content = await generateOpeningPost(perspective, topic);
        
        results.push({
          type: 'opening',
          html: createPostCard(perspective, formatTimeString(timeSlot), content, false),
          perspective: perspective
        });
      }
    }
    
    // Update sortedPosts voor volgende AI
    const newId = replyToPost ? 
      `reply-${perspective}-${formatTimeString(timeSlot).replace(':', '')}` :
      `post-${perspective}-${formatTimeString(timeSlot).replace(':', '')}`;
    
    sortedPosts.unshift({
      perspective: perspective.toUpperCase(),
      content: content,
      time: formatTimeString(timeSlot),
      id: newId
    });
    
    // Update mainPosts alleen als het een opening post is
    if (!replyToPost) {
      mainPosts.unshift({
        perspective: perspective.toUpperCase(),
        content: content,
        time: formatTimeString(timeSlot),
        id: newId
      });
    }
    
    await delay(CONFIG.apiDelay);
  }
  
  return results;
}

async function generateRefereeSummary(topic, existingPosts) {
  console.log(`\n📊 Genereer Referee samenvatting...`);
  
  const content = await generateRefereeSummaryContent(topic, existingPosts);
  const timeStr = formatTimeString(9); // 09:00
  
  console.log(`   → REFEREE AI samenvatting gemaakt`);
  
  return [{
    type: 'opening',
    html: createRefereeCard(timeStr, content),
    perspective: 'referee'
  }];
}

async function generateOpeningPosts(topic, timeSlot) {
  console.log(`\n🆕 Genereer opening posts voor nieuw thema: "${topic.title}"...`);
  
  const results = [];
  const perspectives = ['north', 'east', 'south', 'west'];
  
  for (const perspective of perspectives) {
    console.log(`   → ${perspective.toUpperCase()} AI opening...`);
    
    const content = await generateOpeningPost(perspective, topic);
    
    results.push({
      type: 'opening',
      html: createPostCard(perspective, formatTimeString(timeSlot), content, false),
      perspective: perspective
    });
    
    await delay(CONFIG.apiDelay);
  }
  
  return results;
}

// ============================================
// HTML INJECTIE - CHRONOLOGISCH (oudste boven, nieuwste onder)
// ============================================

function injectPostsRedditStyle(html, posts) {
  let newHtml = html;
  
  // Verwerk opening posts eerst
  const openingPosts = posts.filter(p => p.type === 'opening');
  const replyPosts = posts.filter(p => p.type === 'reply');
  
  const startMarker = '<!-- POSTS_START -->';
  const endMarker = '<!-- POSTS_END -->';
  
  // 1. Voeg opening posts toe VOOR POSTS_END (zodat nieuwste onderaan komt)
  const endIndex = newHtml.indexOf(endMarker);
  
  if (endIndex !== -1 && openingPosts.length > 0) {
    const openingHtml = openingPosts.map(p => p.html).join('\n');
    // Insert VOOR de end marker
    newHtml = newHtml.slice(0, endIndex) + openingHtml + '\n            ' + newHtml.slice(endIndex);
    console.log(`   📍 ${openingPosts.length} opening posts toegevoegd (onderaan)`);
  }
  
  // 2. Voeg reply posts toe ONDERAAN hun parent's replies container
  for (const reply of replyPosts) {
    // Zoek de replies container van de parent
    const repliesMarker = `id="replies-${reply.parentId}"`;
    const repliesIndex = newHtml.indexOf(repliesMarker);
    
    if (repliesIndex !== -1) {
      // Zoek de </div> die de replies container sluit
      const containerStart = repliesIndex;
      const containerContent = newHtml.slice(containerStart, containerStart + 2000);
      
      // Zoek de sluitende </div> van de replies container
      // We moeten voorbij eventuele geneste reply divs gaan
      let depth = 1;
      let searchPos = containerContent.indexOf('>') + 1; // Na de opening tag
      let closingDivPos = -1;
      
      while (depth > 0 && searchPos < containerContent.length) {
        const nextOpen = containerContent.indexOf('<div', searchPos);
        const nextClose = containerContent.indexOf('</div>', searchPos);
        
        if (nextClose === -1) break;
        
        if (nextOpen !== -1 && nextOpen < nextClose) {
          depth++;
          searchPos = nextOpen + 4;
        } else {
          depth--;
          if (depth === 0) {
            closingDivPos = nextClose;
          }
          searchPos = nextClose + 6;
        }
      }
      
      if (closingDivPos !== -1) {
        const insertPoint = containerStart + closingDivPos;
        newHtml = newHtml.slice(0, insertPoint) + reply.html + '\n                    ' + newHtml.slice(insertPoint);
        console.log(`   📍 Reply van ${reply.perspective.toUpperCase()} genest in ${reply.parentId} (onderaan)`);
      } else {
        // Fallback: zoek eerste </div>
        const simpleClose = containerContent.indexOf('</div>');
        if (simpleClose !== -1) {
          const insertPoint = containerStart + simpleClose;
          newHtml = newHtml.slice(0, insertPoint) + reply.html + '\n                    ' + newHtml.slice(insertPoint);
          console.log(`   📍 Reply van ${reply.perspective.toUpperCase()} genest in ${reply.parentId} (fallback)`);
        }
      }
    } else {
      // Parent niet gevonden - plaats als top-level post ONDERAAN
      console.log(`   ⚠️ Parent ${reply.parentId} niet gevonden, reply als top-level onderaan geplaatst`);
      const fallbackEndIndex = newHtml.indexOf(endMarker);
      if (fallbackEndIndex !== -1) {
        newHtml = newHtml.slice(0, fallbackEndIndex) + reply.html + '\n            ' + newHtml.slice(fallbackEndIndex);
      }
    }
  }
  
  return newHtml;
}

// ============================================
// CLEAR POSTS VOOR NIEUWE WEEK
// ============================================

function clearWeeklyPosts(html) {
  console.log(`\n🧹 Oude posts verwijderen voor nieuwe week...`);
  
  const startMarker = '<!-- POSTS_START -->';
  const endMarker = '<!-- POSTS_END -->';
  
  const startIndex = html.indexOf(startMarker);
  const endIndex = html.indexOf(endMarker);
  
  if (startIndex !== -1 && endIndex !== -1) {
    // Behoud markers, verwijder alles ertussen
    const before = html.slice(0, startIndex + startMarker.length);
    const after = html.slice(endIndex);
    
    console.log(`   ✅ Posts sectie geleegd`);
    return before + '\n            ' + after;
  }
  
  console.log(`   ⚠️ Geen posts markers gevonden`);
  return html;
}

// ============================================
// MAIN
// ============================================

async function run() {
  let html = loadHTML();
  const topic = getCurrentTopic();
  let postsAdded = 0;
  let newPosts = null;
  let activeTopic = topic; // Track welk topic we gebruiken voor de banner
  
  const existingPosts = extractExistingPosts(html);
  console.log(`\n📖 Gevonden ${existingPosts.length} bestaande posts`);
  
  // WEEKDAGEN (ma-vr) - Dialoog op 08:00, 12:00, 18:00, 22:00
  if ((DAY >= 1 && DAY <= 5) && (HOUR === 8 || HOUR === 12 || HOUR === 18 || HOUR === 22)) {
    console.log(`\n⏰ Weekdag dialoogronde op ${HOUR}:00`);
    newPosts = await generateDialoguePosts(topic, HOUR, existingPosts);
    postsAdded = newPosts.length;
  }
  // ZATERDAG 09:00 - Referee samenvatting
  else if (DAY === 6 && HOUR === 9) {
    console.log(`\n📊 Zaterdag 09:00: Referee samenvatting`);
    newPosts = await generateRefereeSummary(topic, existingPosts);
    postsAdded = newPosts.length;
  }
  // ZONDAG 09:00 - Nieuw thema voorbereiden (alleen clearen en banner, GEEN opening posts)
  else if (DAY === 0 && HOUR === 9) {
    console.log(`\n🆕 Zondag 09:00: Nieuw thema voorbereiden`);
    
    // Eerst oude posts verwijderen
    html = clearWeeklyPosts(html);
    
    // Update topic voor banner (maandag start het echte debat)
    const nextTopic = getNextTopic();
    activeTopic = nextTopic;
    
    console.log(`   📋 Posts geleegd, banner bijgewerkt naar: "${nextTopic.title}"`);
    console.log(`   ℹ️ Opening posts worden maandag 08:00 automatisch gegenereerd`);
    // Geen opening posts - die komen maandag automatisch via generateDialoguePosts
  }
  else {
    console.log('\nℹ️ Geen posts gepland voor dit moment');
    console.log('   Schema: Ma-Vr 08/12/18/22:00 | Za 09:00 (samenvatting) | Zo 09:00 (reset)');
  }
  
  // ALTIJD: Update de topic banner
  html = updateTopicBanner(html, activeTopic);
  
  if (postsAdded > 0 && newPosts) {
    html = injectPostsRedditStyle(html, newPosts);
  }
  
  // Altijd opslaan (banner is altijd geüpdatet)
  saveHTML(html);
  
  if (postsAdded > 0) {
    console.log('\n═══════════════════════════════════════════');
    console.log(`✅ KLAAR: ${postsAdded} posts toegevoegd!`);
    console.log('═══════════════════════════════════════════');
  }
}

run().catch(err => {
  console.error('\n❌ KRITIEKE FOUT:', err);
  process.exit(1);
});
