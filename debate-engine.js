/**
 * AI Social Media - Debate Engine (TEST VERSIE)
 * 
 * Deze versie laadt posts uit test-posts.json in plaats van de API aan te roepen.
 * Perfect voor testen zonder API kosten!
 * 
 * Gebruik: node debate-engine.js
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

// ES Module path setup
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Bestandspaden
const HTML_PATH = resolve(__dirname, 'public', 'index.html');
const TEST_POSTS_PATH = resolve(__dirname, 'public', 'test-posts.json');

console.log('═══════════════════════════════════════════');
console.log('🧪 AI SOCIAL MEDIA - TEST MODE');
console.log('═══════════════════════════════════════════');
console.log(`📂 Script locatie: ${__dirname}`);
console.log(`📄 HTML pad: ${HTML_PATH}`);
console.log(`📄 Test posts pad: ${TEST_POSTS_PATH}`);
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

function loadTestPosts() {
  if (!existsSync(TEST_POSTS_PATH)) {
    console.error(`❌ Test posts bestand niet gevonden: ${TEST_POSTS_PATH}`);
    console.error('   Zorg dat test-posts.json in de public/ map staat.');
    process.exit(1);
  }
  const data = readFileSync(TEST_POSTS_PATH, 'utf-8');
  return JSON.parse(data);
}

// ============================================
// HTML GENERATIE
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

function formatTimeFromTimestamp(timestamp) {
  const date = new Date(timestamp);
  return date.toLocaleTimeString('nl-NL', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Amsterdam'
  });
}

function createPostCard(perspective, time, content, isNew = true) {
  const badge = isNew ? '<span class="new-badge">NIEUW</span>' : '';
  const dateStr = formatDateString();
  const perspectiveLower = perspective.toLowerCase();
  const perspectiveUpper = perspective.toUpperCase();
  
  // Escape HTML in content
  const safeContent = content
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n/g, '<br>');
  
  return `
            <div class="message-card ${perspectiveLower}">
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

function injectPosts(html, postsHtml) {
  // Debug: check of marker aanwezig is
  const marker = '<!-- POSTS_START -->';
  const markerIndex = html.indexOf(marker);
  
  console.log(`   🔍 Zoeken naar marker: "${marker}"`);
  console.log(`   📍 Marker gevonden op index: ${markerIndex}`);
  
  if (markerIndex !== -1) {
    const insertPoint = markerIndex + marker.length;
    console.log(`   ✅ Injectie op positie: ${insertPoint}`);
    return html.slice(0, insertPoint) + '\n' + postsHtml + html.slice(insertPoint);
  }
  
  // Fallback: zoek de wall div
  const wallMarker = '<div class="wall">';
  const wallIndex = html.indexOf(wallMarker);
  console.log(`   🔍 Fallback - zoeken naar: "${wallMarker}"`);
  console.log(`   📍 Wall gevonden op index: ${wallIndex}`);
  
  if (wallIndex !== -1) {
    const insertPoint = wallIndex + wallMarker.length;
    console.log(`   ✅ Fallback injectie op positie: ${insertPoint}`);
    return html.slice(0, insertPoint) + '\n' + postsHtml + html.slice(insertPoint);
  }
  
  console.error('❌ Geen injectie-punt gevonden in HTML!');
  return html;
}

// ============================================
// MAIN
// ============================================

function run() {
  console.log('\n📥 Laden van test posts...');
  
  // Laad test posts
  const testData = loadTestPosts();
  console.log(`   Topic: "${testData.topic}"`);
  console.log(`   Week: ${testData.week}`);
  console.log(`   Aantal posts: ${testData.posts.length}`);
  
  // Laad HTML
  let html = loadHTML();
  console.log(`   📄 HTML geladen: ${html.length} karakters`);
  
  // Genereer HTML voor alle posts
  console.log('\n📝 Genereer post cards...');
  const postsHtml = testData.posts.map(post => {
    const time = formatTimeFromTimestamp(post.timestamp);
    console.log(`   → ${post.perspective} AI`);
    return createPostCard(post.perspective, time, post.content);
  }).join('\n');
  
  // Injecteer posts in HTML
  console.log('\n💉 Injecteer posts in HTML...');
  html = injectPosts(html, postsHtml);
  
  // Sla op
  saveHTML(html);
  
  console.log('\n═══════════════════════════════════════════');
  console.log(`✅ KLAAR: ${testData.posts.length} test posts toegevoegd!`);
  console.log('═══════════════════════════════════════════');
  console.log('\n🌐 Je kunt nu de site bekijken.');
}

// Start
run();
