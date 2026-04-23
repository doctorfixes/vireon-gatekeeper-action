function diffContracts(base, head) {
  const diff = {};

  const keys = new Set([...Object.keys(base), ...Object.keys(head)]);

  keys.forEach((key) => {
    const baseVal = JSON.stringify(base[key]);
    const headVal = JSON.stringify(head[key]);
    if (baseVal !== headVal) {
      diff[key] = { from: base[key], to: head[key] };
    }
  });

  return Object.keys(diff).length > 0 ? diff : null;
}

module.exports = { diffContracts };
