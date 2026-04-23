function diffContracts(base, head) {
  const diff = {};

  const keys = new Set([...Object.keys(base), ...Object.keys(head)]);

  keys.forEach((key) => {
    if (base[key] !== head[key]) {
      diff[key] = { from: base[key], to: head[key] };
    }
  });

  return Object.keys(diff).length > 0 ? diff : null;
}

module.exports = { diffContracts };
