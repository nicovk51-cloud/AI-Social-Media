/**
 * AI Social Media - Debate Engine
 * 
 * Dit script wordt uitgevoerd door GitHub Actions volgens een schema.
 * Het genereert AI posts en update de index.html direct.
 * 
 * Schema:
 * - Zondag 22:00: Nieuw thema introductie
 * - Ma-Vr 08:00: Opening posts
 * - Ma-Vr 12:00, 18:00, 22:00: Reactierondes
 * - Zaterdag 22:00: Weeksamenvatting
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

// ES Module path setup
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Bestandspaden
const HTML_PATH = join(__dirname, 'public', 'index.html');
const TOPICS_PATH = join(__dirname, 'public', 'topics.json');

// ============================================
// CONFIGURATIE
// ============================================

const CONFIG = {
  model: 'claude-3-haiku-20240307',
  defaultMaxTokens: 300,
  apiDelay: 500, // ms tussen API calls
  timezone: 'Europe/Amsterdam'
};

// ============================================
// TIJD & DATUM
// ============================================

function getAmsterdamTime() {
  const now = new Date();
  // Converteer naar Amsterdam tijd
  const amsterdamStr = now.toLocaleString('en-US', { timeZone: CONFIG.timezone });
  return new Date(amsterdamStr);
}

const amsterdamTime = getAmsterdamTime();
const DAY = amsterdamTime.getDay();      // 0=zondag, 1=maandag, ..., 6=zaterdag
const HOUR = amsterdamTime.getHours();

console.log('═══════════════════════════════════════════');
console.log('🤖 AI SOCIAL MEDIA - DEBATE ENGINE');
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
// THEMA BEREKENING
// ============================================

function getCurrentTopic() {
  const topics = loadTopics();
  const startDate = new Date('2025-12-14T00:00:00'); // Week 1 begint op deze zondag
  const now = new Date();
  
  // Bereken het weeknummer
  const diffMs = now - startDate;
  const diffDays = Math.floor(diffMs / (24 * 60 * 60 * 1000));
  let weekNumber = Math.floor(diffDays / 7) + 1;
  
  // Als we voor de startdatum zijn, gebruik week 1
  if (weekNumber < 1) weekNumber = 1;
  
  // Zoek het juiste thema
  let topic = topics.topics.find(t => t.week === weekNumber);
  
  // Fallback: cycle door thema's als we voorbij week 52 zijn
  if (!topic) {
    const cycledWeek = ((weekNumber - 1) % 52) + 1;
    topic = topics.topics.find(t => t.week === cycledWeek);
  }
  
  // Laatste fallback
  if (!topic) {
    topic = topics.topics[0];
  }
  
  console.log(`📌 Huidig thema: Week ${weekNumber} - "${topic.title}"`);
  console.log(`   Categorie: ${topic.category}`);
  
  return { ...topic, weekNumber };
}

// ============================================
// HTML INJECTIE
// ============================================

function injectPost(html, postHtml) {
  // Zoek de marker waar posts moeten komen
  const marker = '<!-- POSTS_START -->';
  const markerIndex = html.indexOf(marker);
  
  if (markerIndex !== -1) {
    // Injecteer na de marker
    const insertPoint = markerIndex + marker.length;
    return html.slice(0, insertPoint) + '\n' + postHtml + html.slice(insertPoint);
  }
  
  // Fallback: zoek de wall div
  const wallMarker = '<div class="wall">';
  const wallIndex = html.indexOf(wallMarker);
  
  if (wallIndex !== -1) {
    const insertPoint = wallIndex + wallMarker.length;
    return html.slice(0, insertPoint) + '\n' + postHtml + html.slice(insertPoint);
  }
  
  console.error('❌ Geen injectie-punt gevonden in HTML!');
  return html;
}

function updateTopicBanner(html, topic) {
  const newBanner = `
        <div class="topic-banner">
            <div class="topic-label">Week ${topic.weekNumber} • ${topic.category}</div>
            <h1 class="topic-title">${topic.title}</h1>
            <div class="topic-week">Lopend debat</div>
        </div>`;
  
  // Vervang bestaande banner of voeg toe
  const bannerRegex = /<div class="topic-banner">[\s\S]*?<\/div>\s*<\/div>\s*<\/div>/;
  
  if (bannerRegex.test(html)) {
    return html.replace(bannerRegex, newBanner);
  }
  
  // Voeg banner toe na main-container opening
  const mainMarker = '<main class="main-container">';
  const mainIndex = html.indexOf(mainMarker);
  
  if (mainIndex !== -1) {
    const insertPoint = mainIndex + mainMarker.length;
    return html.slice(0, insertPoint) + '\n' + newBanner + html.slice(insertPoint);
  }
  
  return html;
}

// ============================================
// AI PROMPTS
// ============================================

const PROMPTS = {
  north: `Je bent NORTH AI – het urgentie perspectief.

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

Reageer ALTIJD in het Nederlands. Maximum 100 woorden.`,

  east: `Je bent EAST AI – het economisch perspectief.

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

Reageer ALTIJD in het Nederlands. Maximum 100 woorden.`,

  south: `Je bent SOUTH AI – het systeem perspectief.

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

Reageer ALTIJD in het Nederlands. Maximum 100 woorden.`,

  west: `Je bent WEST AI – het filosofisch perspectief.

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

Reageer ALTIJD in het Nederlands. Maximum 100 woorden.`,

  referee: `Je bent de REFEREE – neutrale moderator.

ROL:
- Objectief en eerlijk
- Geen eigen standpunt innemen
- Alle perspectieven gelijk behandelen
- Synthese en samenvatting
- Structuur en overzicht bieden

TOON:
- Neutraal en evenwichtig
- Helder en gestructureerd
- Verbindend zonder kant te kiezen

Reageer ALTIJD in het Nederlands.`
};

// ============================================
// CLAUDE API
// ============================================

async function callClaude(prompt, maxTokens = CONFIG.defaultMaxTokens) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  
  if (!apiKey) {
    console.error('❌ ANTHROPIC_API_KEY ontbreekt!');
    console.error('   Stel deze in via GitHub Secrets');
    return '[API key niet geconfigureerd]';
  }
  
  try {
    console.log(`   🔄 API call (max ${maxTokens} tokens)...`);
    
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        model: CONFIG.model,
        max_tokens: maxTokens,
        messages: [{ role: 'user', content: prompt }]
      })
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`   ❌ API Error ${response.status}: ${errorText}`);
      return `[API fout ${response.status}]`;
    }
    
    const data = await response.json();
    const text = data.content[0].text.trim();
    console.log(`   ✅ Respons ontvangen (${text.length} karakters)`);
    return text;
    
  } catch (error) {
    console.error(`   ❌ Verbindingsfout: ${error.message}`);
    return `[Verbindingsfout]`;
  }
}

// Delay helper
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ============================================
// POST HTML GENERATIE
// ============================================

function formatTimeString(hour) {
  return `${hour.toString().padStart(2, '0')}:00`;
}

function formatDateString() {
  return amsterdamTime.toLocaleDateString('nl-NL', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  });
}

function createPostCard(perspective, time, content, isNew = true) {
  const badge = isNew ? '<span class="new-badge">NIEUW</span>' : '';
  const dateStr = formatDateString();
  const perspectiveUpper = perspective.toUpperCase();
  
  // Escape HTML in content
  const safeContent = content
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n/g, '<br>');
  
  return `
            <div class="message-card ${perspective}">
                <div class="message-header">
                    <div class="avatar ${perspective}">
                        <img src="${perspective}-badge.jpg" alt="${perspectiveUpper} AI">
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
// POST GENERATIE FUNCTIES
// ============================================

async function generateIntroPost(topic) {
  console.log('\n📝 Genereer introductie post...');
  
  const prompt = `${PROMPTS.referee}

TAAK: Schrijf een introductiepost voor het nieuwe weekthema.

THEMA: "${topic.title}"
CATEGORIE: ${topic.category}
WEEK: ${topic.weekNumber}

Schrijf een boeiende introductie die:
1. Het thema kort uitlegt
2. Waarom het relevant en actueel is
3. Welke vragen deze week centraal staan
4. De vier perspectieven uitnodigt om te reageren

Maximum 150 woorden. Wees enthousiast maar neutraal.`;

  const content = await callClaude(prompt, 400);
  return createPostCard('referee', '22:00', content);
}

async function generateOpeningPosts(topic) {
  console.log('\n📝 Genereer opening posts...');
  const posts = [];
  
  for (const perspective of ['north', 'east', 'south', 'west']) {
    console.log(`   → ${perspective.toUpperCase()} AI...`);
    
    const prompt = `${PROMPTS[perspective]}

THEMA VAN DEZE WEEK: "${topic.title}"
CATEGORIE: ${topic.category}

TAAK: Geef je openingsstatement over dit thema.
- Wat is jouw positie?
- Wat zijn de belangrijkste punten vanuit jouw perspectief?
- Welke zorgen of kansen zie je?

Dit is je eerste bijdrage aan het debat. Wees duidelijk over je standpunt.`;

    const content = await callClaude(prompt);
    posts.push(createPostCard(perspective, '08:00', content));
    
    await delay(CONFIG.apiDelay);
  }
  
  return posts.join('\n');
}

async function generateReactionPosts(topic, timeSlot) {
  const slotNames = { 12: 'middag', 18: 'avond', 22: 'late avond' };
  console.log(`\n📝 Genereer ${slotNames[timeSlot]} reacties...`);
  const posts = [];
  
  for (const perspective of ['north', 'east', 'south', 'west']) {
    console.log(`   → ${perspective.toUpperCase()} AI...`);
    
    const prompt = `${PROMPTS[perspective]}

THEMA: "${topic.title}"
TIJDSLOT: ${slotNames[timeSlot]} discussieronde

TAAK: Reageer op het lopende debat.
- Verdiep of nuanceer je eerdere standpunt
- Reageer op mogelijke tegenargumenten
- Breng nieuwe inzichten of voorbeelden in
- Blijf bij je kernwaarden maar toon dat je luistert

Wees constructief en voeg iets nieuws toe aan de discussie.`;

    const content = await callClaude(prompt);
    posts.push(createPostCard(perspective, formatTimeString(timeSlot), content));
    
    await delay(CONFIG.apiDelay);
  }
  
  return posts.join('\n');
}

async function generateSummaryPost(topic) {
  console.log('\n📝 Genereer weeksamenvatting...');
  
  const prompt = `${PROMPTS.referee}

TAAK: Schrijf de weeksamenvatting voor dit debat.

THEMA: "${topic.title}"
CATEGORIE: ${topic.category}
WEEK: ${topic.weekNumber}

Structuur je samenvatting als volgt:

1. HOOFDPUNTEN PER PERSPECTIEF
   - North AI: [kernpunt]
   - East AI: [kernpunt]
   - South AI: [kernpunt]
   - West AI: [kernpunt]

2. OVEREENKOMSTEN
   Waar waren de perspectieven het (deels) eens?

3. KERNVERSCHILLEN
   Wat blijven de belangrijkste meningsverschillen?

4. INZICHTEN
   Welke nieuwe inzichten kwamen naar voren?

5. VOORUITBLIK
   Kort teaser voor volgende week.

Maximum 300 woorden. Blijf strikt neutraal.`;

  const content = await callClaude(prompt, 600);
  return createPostCard('referee', '22:00', content);
}

// ============================================
// SCHEDULE ROUTER
// ============================================

async function run() {
  let html = loadHTML();
  const topic = getCurrentTopic();
  let postsAdded = 0;
  let newPosts = '';
  
  // Update altijd de topic banner
  html = updateTopicBanner(html, topic);
  
  // ─────────────────────────────────────────
  // ZONDAG 22:00 - Nieuw thema introductie
  // ─────────────────────────────────────────
  if (DAY === 0 && HOUR === 22) {
    console.log('\n🆕 ZONDAG 22:00 - Nieuw thema introductie');
    newPosts = await generateIntroPost(topic);
    postsAdded = 1;
  }
  
  // ─────────────────────────────────────────
  // MA-VR 08:00 - Opening posts
  // ─────────────────────────────────────────
  else if (DAY >= 1 && DAY <= 5 && HOUR === 8) {
    console.log('\n🌅 WEEKDAG 08:00 - Opening posts');
    newPosts = await generateOpeningPosts(topic);
    postsAdded = 4;
  }
  
  // ─────────────────────────────────────────
  // MA-VR 12:00 - Middag reacties
  // ─────────────────────────────────────────
  else if (DAY >= 1 && DAY <= 5 && HOUR === 12) {
    console.log('\n☀️ WEEKDAG 12:00 - Middag reacties');
    newPosts = await generateReactionPosts(topic, 12);
    postsAdded = 4;
  }
  
  // ─────────────────────────────────────────
  // MA-VR 18:00 - Avond reacties
  // ─────────────────────────────────────────
  else if (DAY >= 1 && DAY <= 5 && HOUR === 18) {
    console.log('\n🌆 WEEKDAG 18:00 - Avond reacties');
    newPosts = await generateReactionPosts(topic, 18);
    postsAdded = 4;
  }
  
  // ─────────────────────────────────────────
  // MA-VR 22:00 - Late avond reacties
  // ─────────────────────────────────────────
  else if (DAY >= 1 && DAY <= 5 && HOUR === 22) {
    console.log('\n🌙 WEEKDAG 22:00 - Late avond reacties');
    newPosts = await generateReactionPosts(topic, 22);
    postsAdded = 4;
  }
  
  // ─────────────────────────────────────────
  // ZATERDAG 22:00 - Weeksamenvatting
  // ─────────────────────────────────────────
  else if (DAY === 6 && HOUR === 22) {
    console.log('\n📊 ZATERDAG 22:00 - Weeksamenvatting');
    newPosts = await generateSummaryPost(topic);
    postsAdded = 1;
  }
  
  // ─────────────────────────────────────────
  // GEEN GEPLAND MOMENT
  // ─────────────────────────────────────────
  else {
    console.log('\nℹ️ Geen posts gepland voor dit moment');
    console.log(`   Dag: ${DAY}, Uur: ${HOUR}`);
    console.log('   Geplande momenten:');
    console.log('   - Zo 22:00: Intro');
    console.log('   - Ma-Vr 08:00: Opening');
    console.log('   - Ma-Vr 12/18/22:00: Reacties');
    console.log('   - Za 22:00: Samenvatting');
  }
  
  // ─────────────────────────────────────────
  // POSTS TOEVOEGEN & OPSLAAN
  // ─────────────────────────────────────────
  if (postsAdded > 0 && newPosts) {
    html = injectPost(html, newPosts);
    saveHTML(html);
    
    console.log('\n═══════════════════════════════════════════');
    console.log(`✅ KLAAR: ${postsAdded} post(s) toegevoegd`);
    console.log('═══════════════════════════════════════════');
  } else {
    // Sla toch op voor banner update
    saveHTML(html);
    console.log('\n═══════════════════════════════════════════');
    console.log('ℹ️ Geen nieuwe posts, banner bijgewerkt');
    console.log('═══════════════════════════════════════════');
  }
}

// ============================================
// START
// ============================================

run().catch(err => {
  console.error('\n❌ KRITIEKE FOUT:', err);
  process.exit(1);
});
