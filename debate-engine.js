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
    
    posts.push({
      perspective: perspective,
      time: time,
      content: content.replace(/<br>/g, '\n').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&'),
      id: id
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

function selectPostToReplyTo(perspective, existingPosts) {
  const otherPosts = existingPosts.filter(p => 
    p.perspective.toLowerCase() !== perspective.toLowerCase() &&
    !p.id.startsWith('reply-') // Alleen reageren op hoofdposts, niet op replies
  );
  
  if (otherPosts.length === 0) return null;
  
  const opposites = {
    north: ['east', 'west'],
    east: ['north', 'south'],
    south: ['north', 'east'],
    west: ['north', 'east']
  };
  
  const preferredOpponents = opposites[perspective.toLowerCase()] || [];
  
  for (const opponent of preferredOpponents) {
    const opponentPost = otherPosts.find(p => 
      p.perspective.toLowerCase() === opponent
    );
    if (opponentPost) return opponentPost;
  }
  
  return otherPosts[0];
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
  
  for (const perspective of perspectives) {
    console.log(`   → ${perspective.toUpperCase()} AI...`);
    
    let content;
    let replyToPost = null;
    
    if (mainPosts.length === 0) {
      // Geen bestaande posts -> opening post
      content = await generateOpeningPost(perspective, topic);
      
      results.push({
        type: 'opening',
        html: createPostCard(perspective, formatTimeString(timeSlot), content, false),
        perspective: perspective
      });
      
    } else {
      // Selecteer post om op te reageren
      replyToPost = selectPostToReplyTo(perspective, mainPosts);
      
      if (replyToPost) {
        content = await generateDialogueReaction(perspective, topic, replyToPost, sortedPosts);
        console.log(`      ↳ Reageert BINNEN ${replyToPost.perspective}'s post`);
        
        results.push({
          type: 'reply',
          html: createReplyCard(perspective, formatTimeString(timeSlot), content),
          parentId: replyToPost.id,
          perspective: perspective
        });
      } else {
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
// HTML INJECTIE - REDDIT STYLE
// ============================================

function injectPostsRedditStyle(html, posts) {
  let newHtml = html;
  
  // Verwerk opening posts eerst (komen na POSTS_START)
  const openingPosts = posts.filter(p => p.type === 'opening');
  const replyPosts = posts.filter(p => p.type === 'reply');
  
  // 1. Voeg opening posts toe na POSTS_START
  const startMarker = '<!-- POSTS_START -->';
  const startIndex = newHtml.indexOf(startMarker);
  
  if (startIndex !== -1 && openingPosts.length > 0) {
    const openingHtml = openingPosts.map(p => p.html).join('\n');
    const insertPoint = startIndex + startMarker.length;
    newHtml = newHtml.slice(0, insertPoint) + '\n' + openingHtml + newHtml.slice(insertPoint);
    console.log(`   📍 ${openingPosts.length} opening posts toegevoegd`);
  }
  
  // 2. Voeg reply posts toe BINNEN hun parent's replies container
  for (const reply of replyPosts) {
    // Zoek de replies container van de parent
    const repliesMarker = `id="replies-${reply.parentId}"`;
    const repliesIndex = newHtml.indexOf(repliesMarker);
    
    if (repliesIndex !== -1) {
      // Zoek de <!-- REPLIES --> comment binnen deze container
      const containerStart = repliesIndex;
      const containerContent = newHtml.slice(containerStart, containerStart + 500);
      const repliesCommentIndex = containerContent.indexOf('<!-- REPLIES -->');
      
      if (repliesCommentIndex !== -1) {
        const insertPoint = containerStart + repliesCommentIndex + '<!-- REPLIES -->'.length;
        newHtml = newHtml.slice(0, insertPoint) + '\n' + reply.html + newHtml.slice(insertPoint);
        console.log(`   📍 Reply van ${reply.perspective.toUpperCase()} genest in ${reply.parentId}`);
      } else {
        // Geen REPLIES marker, zoek einde van replies div
        const closingDiv = containerContent.indexOf('</div>');
        if (closingDiv !== -1) {
          const insertPoint = containerStart + closingDiv;
          newHtml = newHtml.slice(0, insertPoint) + '\n' + reply.html + newHtml.slice(insertPoint);
          console.log(`   📍 Reply van ${reply.perspective.toUpperCase()} genest in ${reply.parentId}`);
        }
      }
    } else {
      // Parent niet gevonden - plaats als top-level post
      console.log(`   ⚠️ Parent ${reply.parentId} niet gevonden, reply als top-level geplaatst`);
      const fallbackIndex = newHtml.indexOf(startMarker);
      if (fallbackIndex !== -1) {
        const insertPoint = fallbackIndex + startMarker.length;
        newHtml = newHtml.slice(0, insertPoint) + '\n' + reply.html + newHtml.slice(insertPoint);
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
  // ZONDAG 09:00 - Nieuw thema starten
  else if (DAY === 0 && HOUR === 9) {
    console.log(`\n🆕 Zondag 09:00: Nieuw thema starten`);
    
    // Eerst oude posts verwijderen
    html = clearWeeklyPosts(html);
    
    // Dan nieuwe opening posts genereren
    const nextTopic = getNextTopic();
    activeTopic = nextTopic; // Update active topic voor banner
    newPosts = await generateOpeningPosts(nextTopic, 9);
    postsAdded = newPosts.length;
  }
  else {
    console.log('\nℹ️ Geen posts gepland voor dit moment');
    console.log('   Schema: Ma-Vr 08/12/18/22:00 | Za 09:00 (samenvatting) | Zo 09:00 (nieuw thema)');
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
