const fs = require('fs');
const path = require('path');

const BASELINE_PATH = '.gatekeeper/baseline.json';
const HISTORY_PATH = '.gatekeeper/history.json';

function loadBaseline() {
  if (!fs.existsSync(BASELINE_PATH)) return null;
  return JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf8'));
}

function saveBaseline(baseline, commitHash) {
  const enriched = { ...baseline, commitHash };
  const dir = path.dirname(BASELINE_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(BASELINE_PATH, JSON.stringify(enriched, null, 2), 'utf8');
  appendHistory(enriched);
  return enriched;
}

function loadHistory() {
  if (!fs.existsSync(HISTORY_PATH)) return [];
  return JSON.parse(fs.readFileSync(HISTORY_PATH, 'utf8'));
}

function appendHistory(entry) {
  const history = loadHistory();
  history.push(entry);
  const dir = path.dirname(HISTORY_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(HISTORY_PATH, JSON.stringify(history, null, 2), 'utf8');
}

module.exports = { loadBaseline, saveBaseline, loadHistory };

