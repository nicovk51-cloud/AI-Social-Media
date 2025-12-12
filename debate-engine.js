/**
 * AI Social Media - Debate Engine V2
 * MET REPLY THREADING - Posts antwoorden op elkaar!
 * 
 * Dit script:
 * 1. Leest bestaande posts uit HTML
 * 2. Geeft die aan Claude zodat hij kan antwoorden
 * 3. Voegt data-reply-to attributen toe
 * 4. Posts nesten visueel onder elkaar
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
  defaultMaxTokens: 300,
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
console.log('🤖 AI SOCIAL MEDIA - DEBATE ENGINE V2');
console.log('WITH REPLY THREADING');
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
      content: content.replace(/<br>/g, '\n'),
      id: `${perspective}-${time}`
    });
  }
  
  return posts;
}

// ============================================
// CLAUDE API CALL
// ============================================

async function callClaude(prompt, maxTokens = CONFIG.defaultMaxTokens) {
  const apiKey = process.env.CLAUDE_API_KEY;
  if (!apiKey) {
    throw new Error('❌ CLAUDE_API_KEY environment variable niet ingesteld!');
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
// PROMPTS MET CONTEXT
// ============================================

const PERSPECTIVES = {
  north: {
    role: 'NORTH AI',
    description: 'het urgentie perspectief',
    values: ['Actie', 'Wetenschap', 'Urgentie', 'Beleid'],
    prompt: `Je bent NORTH AI – het urgentie perspectief.

KERNWAARDEN:
- Wetenschappelijke consensus is leidend
- Klimaat en milieu vereisen ONMIDDELLIJKE actie
- Voorzorgsprincipe boven economische belangen
- Collectieve verantwoordelijkheid boven individuele vrijheid
- Sterke overheidsinterventie is noodzakelijk

TOON:
- Direct en urgent
- Gefrustreerd met traagheid en uitstel
- Gebruik cijfers en data
- Ongeduldig maar respectvol

Reageer ALTIJD in het Nederlands. Maximum 50 woorden.`
  },
  
  east: {
    role: 'EAST AI',
    description: 'het economisch perspectief',
    values: ['Innovatie', 'Markt', 'Pragmatisme', 'Data'],
    prompt: `Je bent EAST AI – het economisch perspectief.

KERNWAARDEN:
- Marktmechanismen bieden de beste oplossingen
- Technologische innovatie is de sleutel
- Economische haalbaarheid is essentieel
- Sceptisch over overheidsinterventie
- Kosten-batenanalyse altijd nodig

TOON:
- Analytisch en data-gedreven
- Pragmatisch en realistisch
- Zakelijk maar constructief
- Focus op haalbaarheid

Reageer ALTIJD in het Nederlands. Maximum 50 woorden.`
  },

  south: {
    role: 'SOUTH AI',
    description: 'het systeem perspectief',
    values: ['Balans', 'Inclusiviteit', 'Systeemdenken', 'Gemeenschap'],
    prompt: `Je bent SOUTH AI – het systeem perspectief.

KERNWAARDEN:
- Alles is met alles verbonden
- Inclusiviteit en diverse stemmen
- Balans tussen economie, ecologie en sociaal
- Lokale kennis en gemeenschappen
- Geïntegreerde oplossingen

TOON:
- Genuanceerd en verbindend
- Zoekt naar consensus
- Empathisch en luisterend
- Brengt perspectieven samen

Reageer ALTIJD in het Nederlands. Maximum 50 woorden.`
  },

  west: {
    role: 'WEST AI',
    description: 'het filosofisch perspectief',
    values: ['Wijsheid', 'Waarden', 'Reflectie', 'Natuur'],
    prompt: `Je bent WEST AI – het filosofisch perspectief.

KERNWAARDEN:
- Problemen wortelen in diepere culturele crises
- Vraag naar onderliggende waarden
- Stel groei-aannames ter discussie
- Harmonie met natuur als doel
- Innerlijke transformatie nodig

TOON:
- Contemplatief en reflectief
- Stelt fundamentele vragen
- Wijsheid boven snelle oplossingen
- Lange-termijn denken

Reageer ALTIJD in het Nederlands. Maximum 50 woorden.`
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
// REACTION GENERATION WITH CONTEXT
// ============================================

async function generateReactionPostsWithContext(topic, timeSlot, existingPosts) {
  const slotNames = { 12: 'middag', 18: 'avond', 22: 'late avond' };
  console.log(`\n📝 Genereer ${slotNames[timeSlot]} reacties MET CONTEXT...`);
  
  const posts = [];
  
  // Bouw context van bestaande posts
  let contextText = '\n\nHUITIDIG DEBAT CONTEXT:\n';
  existingPosts.forEach(post => {
    contextText += `- ${post.perspective}: "${post.content.substring(0, 100)}..."\n`;
  });
  
  for (const perspective of ['north', 'east', 'south', 'west']) {
    console.log(`   → ${perspective.toUpperCase()} AI...`);
    
    const perspectiveData = PERSPECTIVES[perspective];
    
    const prompt = `${perspectiveData.prompt}

THEMA: "${topic.title}"
CATEGORIE: ${topic.category}
TIJDSLOT: ${slotNames[timeSlot]} discussieronde

${contextText}

TAAK: Reageer op het lopende debat.
- Verdiep of nuanceer je eerdere standpunt
- Reageer op mogelijke tegenargumenten van anderen
- Breng nieuwe inzichten of voorbeelden in
- Blijf bij je kernwaarden maar toon dat je luistert

Wees constructief en voeg iets nieuws toe aan de discussie.`;

    const content = await callClaude(prompt, 200);
    
    // Bepaal op welk bericht je reageert (logic: antwoord op vorige perspective in cyclus)
    const perspectiveIndex = ['north', 'east', 'south', 'west'].indexOf(perspective);
    const prevPerspectiveIndex = (perspectiveIndex - 1 + 4) % 4;
    const prevPerspective = ['north', 'east', 'south', 'west'][prevPerspectiveIndex];
    const replyTo = `${prevPerspective}-${formatTimeString(timeSlot)}`;
    
    posts.push(createPostCard(perspective, formatTimeString(timeSlot), content, replyTo));
    
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
  existingPosts.forEach(p => {
    console.log(`   - ${p.perspective} (${p.time}): "${p.content.substring(0, 50)}..."`);
  });
  
  // ─────────────────────────────────────────
  // WEEKDAGEN 12:00, 18:00, 22:00 - Reacties MET CONTEXT
  // ─────────────────────────────────────────
  if ((DAY >= 1 && DAY <= 5) && (HOUR === 12 || HOUR === 18 || HOUR === 22)) {
    console.log(`\n⏰ Reactieronde op ${HOUR}:00`);
    newPosts = await generateReactionPostsWithContext(topic, HOUR, existingPosts);
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
    console.log(`✅ KLAAR: ${postsAdded} post(s) met reply threading!`);
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
