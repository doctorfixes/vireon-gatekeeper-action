import semanticDriftRule from '../../rules/semantic-drift.js';

describe('rules/semantic-drift rule pack', () => {
  it('has correct id and description', () => {
    expect(semanticDriftRule.id).toBe('semantic-drift');
    expect(typeof semanticDriftRule.description).toBe('string');
  });

  describe('file-level structural changes', () => {
    it('detects a new file', () => {
      const diff = `diff --git a/src/newFile.js b/src/newFile.js
new file mode 100644
--- /dev/null
+++ b/src/newFile.js
@@ -0,0 +1 @@
+const x = 1;
`;
      const result = semanticDriftRule.check({ diff });
      expect(result.messages.some(m => m.message.includes('New files added'))).toBe(true);
      expect(result.messages.some(m => m.message.includes('newFile.js'))).toBe(true);
    });

    it('detects a deleted file', () => {
      const diff = `diff --git a/src/oldFile.js b/src/oldFile.js
deleted file mode 100644
--- a/src/oldFile.js
+++ /dev/null
@@ -1 +0,0 @@
-const x = 1;
`;
      const result = semanticDriftRule.check({ diff });
      expect(result.messages.some(m => m.message.includes('Files removed'))).toBe(true);
      expect(result.messages.some(m => m.message.includes('oldFile.js'))).toBe(true);
    });

    it('detects a renamed/moved file', () => {
      const diff = `diff --git a/src/old.js b/src/new.js
similarity index 100%
rename from src/old.js
rename to src/new.js
--- a/src/old.js
+++ b/src/new.js
`;
      const result = semanticDriftRule.check({ diff });
      expect(result.messages.some(m => m.message.includes('Files moved'))).toBe(true);
    });
  });

  describe('dependency changes', () => {
    it('detects new import dependencies', () => {
      const diff = `diff --git a/src/foo.js b/src/foo.js
--- a/src/foo.js
+++ b/src/foo.js
@@ -1 +1 @@
+import bar from './bar.js';
`;
      const result = semanticDriftRule.check({ diff });
      expect(result.messages.some(m => m.message.includes('New dependencies'))).toBe(true);
    });

    it('detects removed import dependencies', () => {
      const diff = `diff --git a/src/foo.js b/src/foo.js
--- a/src/foo.js
+++ b/src/foo.js
@@ -1 +1 @@
-import bar from './bar.js';
`;
      const result = semanticDriftRule.check({ diff });
      expect(result.messages.some(m => m.message.includes('Removed dependencies'))).toBe(true);
    });

    it('detects require() dependencies', () => {
      const diff = `diff --git a/src/foo.js b/src/foo.js
--- a/src/foo.js
+++ b/src/foo.js
@@ -1 +1 @@
+const bar = require('./bar.js');
`;
      const result = semanticDriftRule.check({ diff });
      expect(result.messages.some(m => m.message.includes('New dependencies'))).toBe(true);
    });
  });

  describe('sensitivity and threshold', () => {
    it('passes with an empty diff regardless of sensitivity', () => {
      for (const sensitivity of ['low', 'medium', 'high']) {
        const result = semanticDriftRule.check({ diff: '', sensitivity });
        expect(result.passed).toBe(true);
        expect(result.driftScore).toBe(0);
      }
    });

    it('uses the numeric threshold when provided', () => {
      const diff = `diff --git a/src/foo.js b/src/foo.js
new file mode 100644
--- /dev/null
+++ b/src/foo.js
@@ -0,0 +1 @@
+const x = 1;
`;
      const resultPass = semanticDriftRule.check({ diff, threshold: 0.99 });
      const resultFail = semanticDriftRule.check({ diff, threshold: 0.0 });
      expect(resultPass.passed).toBe(true);
      expect(resultFail.passed).toBe(false);
    });

    it('clamps threshold to valid range', () => {
      const diff = `diff --git a/src/foo.js b/src/foo.js
new file mode 100644
--- /dev/null
+++ b/src/foo.js
@@ -0,0 +1 @@
+import x from './x.js';
`;
      const resultHigh = semanticDriftRule.check({ diff, threshold: 100 });
      expect(resultHigh.passed).toBe(true);
      const resultLow = semanticDriftRule.check({ diff, threshold: -1 });
      expect(resultLow.passed).toBe(false);
    });
  });

  describe('result shape', () => {
    it('returns passed, driftScore, messages, and metadata', () => {
      const result = semanticDriftRule.check({ diff: '' });
      expect(typeof result.passed).toBe('boolean');
      expect(typeof result.driftScore).toBe('number');
      expect(Array.isArray(result.messages)).toBe(true);
      expect(typeof result.metadata).toBe('object');
      expect(Array.isArray(result.metadata.findings)).toBe(true);
    });

    it('includes boundary_violation finding for moved files', () => {
      const diff = `diff --git a/src/old.js b/src/new.js
similarity index 100%
rename from src/old.js
rename to src/new.js
--- a/src/old.js
+++ b/src/new.js
`;
      const result = semanticDriftRule.check({ diff });
      const boundaryFindings = result.metadata.findings.filter(f => f.type === 'boundary_violation');
      expect(boundaryFindings.length).toBeGreaterThan(0);
    });

    it('includes dependency_change finding for new imports', () => {
      const diff = `diff --git a/src/foo.js b/src/foo.js
--- a/src/foo.js
+++ b/src/foo.js
@@ -1 +1 @@
+import bar from './bar.js';
`;
      const result = semanticDriftRule.check({ diff });
      const depFindings = result.metadata.findings.filter(f => f.type === 'dependency_change');
      expect(depFindings.length).toBeGreaterThan(0);
    });
  });
});
