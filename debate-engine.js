/**
 * AI Social Media - Debate Engine V2 - FIXED
 * ECHTE DIALOOG - AI's reageren OP ELKAAR!
 * 
 * Fix: 
 * - AI's reageren op specifieke posts
 * - Geen herhaling van volledige persoonlijkheid
 * - Korte, gerichte reacties
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
  defaultMaxTokens: 150, // Korter voor dialoog
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
console.log('🤖 AI SOCIAL MEDIA - DEBATE ENGINE V2 FIXED');
console.log('ECHTE DIALOOG VERSIE');
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
// POST PARSING - LEES BESTAANDE POSTS
// ============================================

function extractExistingPosts(html) {
  const posts = [];
  
  // Match alle message-cards (behalve welkomst)
  const cardRegex = /<div class="message-card (\w+)"[\s\S]*?<div class="author-name">([A-Z\s]+?)<\/div>[\s\S]*?<div class="message-time">([^<]+)<\/div>[\s\S]*?<div class="message-content">([\s\S]*?)<\/div>/g;
  
  let match;
  while ((match = cardRegex.exec(html)) !== null) {
    const perspective = match[1];
    const authorName = match[2].trim();
    const time = match[3].trim();
    const content = match[4].trim();
    
    // Skip welkomst
    if (perspective === 'referee' && authorName === 'REFEREE' && time === 'Welkom') {
      continue;
    }
    
    posts.push({
      perspective: perspective.toUpperCase(),
      author: authorName,
      time: time,
      content: content.replace(/<br>/g, '\n').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&'),
      id: `${perspective}-${time}`
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
      const error = await response.json();
      throw new Error(`API Error: ${response.status} - ${JSON.stringify(error)}`);
    }

    const data = await response.json();
    return data.content[0].text.trim();
  } catch (error) {
    console.error('❌ Claude API fout:', error);
    throw error;
  }
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ============================================
// KORTE PERSONA BESCHRIJVINGEN (voor dialoog)
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
// POST CARD CREATION
// ============================================

function createPostCard(perspective, time, content, replyTo = null) {
  const badge = '<span class="new-badge">NIEUW</span>';
  const dateStr = formatDateString();
  const perspectiveUpper = perspective.toUpperCase();
  const perspectiveLower = perspective.toLowerCase();
  
  const safeContent = content
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n/g, '<br>');
  
  const replyAttr = replyTo ? ` data-reply-to="${replyTo}"` : '';
  const nestedClass = replyTo ? ' nested-reply' : '';
  
  return `
            <div class="message-card ${perspectiveLower}${nestedClass}"${replyAttr} id="post-${perspectiveLower}-${time}">
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
  console.log(`   Categorie: ${topic.category}`);
  
  return { ...topic, weekNumber };
}

// ============================================
// SELECTEER POST OM OP TE REAGEREN
// ============================================

function selectPostToReplyTo(perspective, existingPosts) {
  // Filter posts van andere perspectieven
  const otherPosts = existingPosts.filter(p => 
    p.perspective.toLowerCase() !== perspective.toLowerCase()
  );
  
  if (otherPosts.length === 0) return null;
  
  // Kies de meest recente post van een ander perspectief
  // Prioriteit: natuurlijke tegenstellingen
  const opposites = {
    north: ['east', 'west'],  // North (actie) vs East (markt) of West (reflectie)
    east: ['north', 'south'], // East (economie) vs North (urgentie) of South (balans)
    south: ['north', 'east'], // South (systeem) vs extremen
    west: ['north', 'east']   // West (filosofie) vs North (actie) of East (economie)
  };
  
  const preferredOpponents = opposites[perspective.toLowerCase()] || [];
  
  // Zoek eerst naar voorkeurs-tegenstanders
  for (const opponent of preferredOpponents) {
    const opponentPost = otherPosts.find(p => 
      p.perspective.toLowerCase() === opponent
    );
    if (opponentPost) return opponentPost;
  }
  
  // Anders gewoon de meest recente andere post
  return otherPosts[0];
}

// ============================================
// GENEREER DIALOOG REACTIE
// ============================================

async function generateDialogueReaction(perspective, topic, replyToPost, allRecentPosts) {
  const persona = PERSONAS[perspective.toLowerCase()];
  
  // Bouw korte context van recente discussie (max 3 posts)
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

Voorbeelden van goede starts:
- "Dat klopt deels, maar..."
- "Interessant punt over X, echter..."
- "Eens met je analyse van Y, maar Z ontbreekt..."
- "Je noemt A, maar vergeet B..."

Schrijf nu je reactie:`;

  const content = await callClaude(prompt, 150);
  
  // Clean up: verwijder eventuele "Als X AI" openingen
  let cleanContent = content
    .replace(/^Als \w+ AI[,:]?\s*/i, '')
    .replace(/^Vanuit (mijn|het) \w+ perspectief[,:]?\s*/i, '')
    .replace(/^Bedankt voor.*?\.\s*/i, '')
    .trim();
  
  return cleanContent;
}

// ============================================
// GENEREER OPENING POSTS (voor dag start)
// ============================================

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
  
  // Clean up
  let cleanContent = content
    .replace(/^Als \w+ AI[,:]?\s*/i, '')
    .replace(/^Vanuit (mijn|het) \w+ perspectief[,:]?\s*/i, '')
    .trim();
  
  return cleanContent;
}

// ============================================
// REACTION GENERATION - DIALOOG VERSIE
// ============================================

async function generateDialoguePosts(topic, timeSlot, existingPosts) {
  const slotNames = { 8: 'ochtend', 12: 'middag', 18: 'avond', 22: 'late avond' };
  console.log(`\n📝 Genereer ${slotNames[timeSlot]} DIALOOG posts...`);
  
  const posts = [];
  const perspectives = ['north', 'east', 'south', 'west'];
  
  // Sorteer bestaande posts op tijd (nieuwste eerst)
  const sortedPosts = [...existingPosts].sort((a, b) => {
    // Simpele string vergelijking werkt voor tijd formaat
    return b.time.localeCompare(a.time);
  });
  
  for (const perspective of perspectives) {
    console.log(`   → ${perspective.toUpperCase()} AI...`);
    
    let content;
    let replyToId = null;
    
    if (sortedPosts.length === 0) {
      // Geen bestaande posts -> opening
      content = await generateOpeningPost(perspective, topic);
    } else {
      // Selecteer post om op te reageren
      const replyToPost = selectPostToReplyTo(perspective, sortedPosts);
      
      if (replyToPost) {
        content = await generateDialogueReaction(perspective, topic, replyToPost, sortedPosts);
        replyToId = replyToPost.id;
        console.log(`      ↳ Reageert op ${replyToPost.perspective}`);
      } else {
        content = await generateOpeningPost(perspective, topic);
      }
    }
    
    posts.push(createPostCard(perspective, formatTimeString(timeSlot), content, replyToId));
    
    // Voeg deze post toe aan sortedPosts zodat volgende AI's kunnen reageren
    sortedPosts.unshift({
      perspective: perspective.toUpperCase(),
      content: content,
      time: formatTimeString(timeSlot),
      id: `${perspective}-${formatTimeString(timeSlot)}`
    });
    
    await delay(CONFIG.apiDelay);
  }
  
  return posts.join('\n');
}

// ============================================
// HTML INJECTIE
// ============================================

function injectPost(html, postHtml) {
  const marker = '<!-- POSTS_START -->';
  const markerIndex = html.indexOf(marker);
  
  if (markerIndex !== -1) {
    const insertPoint = markerIndex + marker.length;
    return html.slice(0, insertPoint) + '\n' + postHtml + html.slice(insertPoint);
  }
  
  console.error('❌ Geen injectie-punt gevonden in HTML!');
  return html;
}

// ============================================
// MAIN SCHEDULE ROUTER
// ============================================

async function run() {
  let html = loadHTML();
  const topic = getCurrentTopic();
  let postsAdded = 0;
  let newPosts = '';
  
  // Lees bestaande posts voor context
  const existingPosts = extractExistingPosts(html);
  console.log(`\n📖 Gevonden ${existingPosts.length} bestaande posts:`);
  existingPosts.slice(0, 5).forEach(p => {
    console.log(`   - ${p.perspective} (${p.time}): "${p.content.substring(0, 50)}..."`);
  });
  if (existingPosts.length > 5) {
    console.log(`   ... en ${existingPosts.length - 5} meer`);
  }
  
  // ─────────────────────────────────────────
  // WEEKDAGEN 8:00, 12:00, 18:00, 22:00 - DIALOOG
  // ─────────────────────────────────────────
  if ((DAY >= 1 && DAY <= 5) && (HOUR === 8 || HOUR === 12 || HOUR === 18 || HOUR === 22)) {
    console.log(`\n⏰ Dialoogronde op ${HOUR}:00`);
    newPosts = await generateDialoguePosts(topic, HOUR, existingPosts);
    postsAdded = 4;
  }
  
  // ─────────────────────────────────────────
  // WEEKEND - ook dialoog maar minder frequent
  // ─────────────────────────────────────────
  else if ((DAY === 0 || DAY === 6) && (HOUR === 12 || HOUR === 18)) {
    console.log(`\n⏰ Weekend dialoogronde op ${HOUR}:00`);
    newPosts = await generateDialoguePosts(topic, HOUR, existingPosts);
    postsAdded = 4;
  }
  
  // ─────────────────────────────────────────
  // GEEN GEPLAND MOMENT
  // ─────────────────────────────────────────
  else {
    console.log('\nℹ️ Geen posts gepland voor dit moment');
    console.log(`   Dag: ${DAY}, Uur: ${HOUR}`);
  }
  
  // ─────────────────────────────────────────
  // POSTS TOEVOEGEN & OPSLAAN
  // ─────────────────────────────────────────
  if (postsAdded > 0 && newPosts) {
    html = injectPost(html, newPosts);
    saveHTML(html);
    
    console.log('\n═══════════════════════════════════════════');
    console.log(`✅ KLAAR: ${postsAdded} DIALOOG posts toegevoegd!`);
    console.log('═══════════════════════════════════════════');
  } else {
    saveHTML(html);
  }
}

// ============================================
// START
// ============================================

run().catch(err => {
  console.error('\n❌ KRITIEKE FOUT:', err);
  process.exit(1);
});
