function explainResults(ruleResults, options = {}) {
  const messages = [];
  ruleResults.forEach(r => {
    (r.messages || []).forEach(m => messages.push({ ruleId: r.id, message: m }));
  });
  return messages;
}

module.exports = { explainResults };

