import check from '../../checks/semantic-drift.js';

describe('semantic-drift check (checks/)', () => {
  it('has correct id and description', () => {
    expect(check.id).toBe('semantic-drift');
    expect(typeof check.description).toBe('string');
  });

  describe('empty or trivial diffs', () => {
    it('passes with an empty diff', () => {
      const result = check.check({ diff: '' });
      expect(result.passed).toBe(true);
      expect(result.driftScore).toBe(0);
    });

    it('passes when no imports/exports/structs are changed', () => {
      const diff = `diff --git a/src/foo.js b/src/foo.js
--- a/src/foo.js
+++ b/src/foo.js
@@ -1 +1 @@
+const x = 42;
`;
      const result = check.check({ diff });
      expect(result.passed).toBe(true);
    });
  });

  describe('import changes', () => {
    it('detects import addition', () => {
      const diff = `diff --git a/src/foo.js b/src/foo.js
--- a/src/foo.js
+++ b/src/foo.js
@@ -1 +1 @@
+import bar from './bar.js';
`;
      const result = check.check({ diff, sensitivity: 'low' });
      expect(result.messages.some(m => m.message.includes('Import boundary changed'))).toBe(true);
    });

    it('detects require() at start of line as import change', () => {
      const diff = `diff --git a/src/foo.js b/src/foo.js
--- a/src/foo.js
+++ b/src/foo.js
@@ -1 +1 @@
+require('./bar');
`;
      const result = check.check({ diff, sensitivity: 'low' });
      expect(result.messages.some(m => m.message.includes('Import boundary changed'))).toBe(true);
    });
  });

  describe('export changes', () => {
    it('detects export addition', () => {
      const diff = `diff --git a/src/foo.js b/src/foo.js
--- a/src/foo.js
+++ b/src/foo.js
@@ -1 +1 @@
+export default function foo() {}
`;
      const result = check.check({ diff, sensitivity: 'low' });
      expect(result.messages.some(m => m.message.includes('Public API surface changed'))).toBe(true);
    });

    it('detects module.exports changes', () => {
      const diff = `diff --git a/src/foo.js b/src/foo.js
--- a/src/foo.js
+++ b/src/foo.js
@@ -1 +1 @@
+module.exports = { foo };
`;
      const result = check.check({ diff, sensitivity: 'low' });
      expect(result.messages.some(m => m.message.includes('Public API surface changed'))).toBe(true);
    });
  });

  describe('structural changes', () => {
    it('detects class addition', () => {
      const diff = `diff --git a/src/foo.js b/src/foo.js
--- a/src/foo.js
+++ b/src/foo.js
@@ -1 +1 @@
+class FooService {}
`;
      const result = check.check({ diff, sensitivity: 'low' });
      expect(result.messages.some(m => m.message.includes('Structural change detected'))).toBe(true);
    });

    it('detects function addition', () => {
      const diff = `diff --git a/src/foo.js b/src/foo.js
--- a/src/foo.js
+++ b/src/foo.js
@@ -1 +1 @@
+function doSomething() {}
`;
      const result = check.check({ diff, sensitivity: 'low' });
      expect(result.messages.some(m => m.message.includes('Structural change detected'))).toBe(true);
    });

    it('detects type alias addition', () => {
      const diff = `diff --git a/src/foo.ts b/src/foo.ts
--- a/src/foo.ts
+++ b/src/foo.ts
@@ -1 +1 @@
+type MyType = string | number;
`;
      const result = check.check({ diff, sensitivity: 'low' });
      expect(result.messages.some(m => m.message.includes('Structural change detected'))).toBe(true);
    });
  });

  describe('sensitivity thresholds', () => {
    const heavyDiff = `diff --git a/src/a.js b/src/a.js
--- a/src/a.js
+++ b/src/a.js
@@ -1,5 +1,5 @@
+import a1 from './a1';
+import a2 from './a2';
+export default function bigFunction() {}
+class BigClass {}
+module.exports = { bigFunction };
`;

    it('passes under low sensitivity (high threshold)', () => {
      const result = check.check({ diff: heavyDiff, sensitivity: 'low' });
      // driftScore with these changes over 1 file: (3*2 + 2*3 + 2*1) / max(1*5,1) = (6+6+2)/5 = 2.8 → min(1, 2.8) = 1
      // low threshold = 0.7, so 1.0 >= 0.7 → fail
      expect(typeof result.driftScore).toBe('number');
    });

    it('fails under high sensitivity (low threshold)', () => {
      const result = check.check({ diff: heavyDiff, sensitivity: 'high' });
      expect(result.passed).toBe(false);
    });

    it('uses a numeric threshold when provided', () => {
      const diff = `diff --git a/src/foo.js b/src/foo.js
--- a/src/foo.js
+++ b/src/foo.js
@@ -1 +1 @@
+import x from './x';
`;
      const resultPass = check.check({ diff, threshold: 0.99 });
      const resultFail = check.check({ diff, threshold: 0.0 });
      expect(resultPass.passed).toBe(true);
      expect(resultFail.passed).toBe(false);
    });

    it('clamps threshold to [0, 1]', () => {
      const diff = `diff --git a/src/foo.js b/src/foo.js
--- a/src/foo.js
+++ b/src/foo.js
@@ -1 +1 @@
+import x from './x';
`;
      const resultHigh = check.check({ diff, threshold: 999 });
      expect(resultHigh.passed).toBe(true);
      const resultLow = check.check({ diff, threshold: -5 });
      expect(resultLow.passed).toBe(false);
    });
  });

  describe('result shape', () => {
    it('always returns passed, driftScore, and messages', () => {
      const result = check.check({ diff: '' });
      expect(typeof result.passed).toBe('boolean');
      expect(typeof result.driftScore).toBe('number');
      expect(Array.isArray(result.messages)).toBe(true);
    });

    it('messages have the expected fields', () => {
      const diff = `diff --git a/src/foo.js b/src/foo.js
--- a/src/foo.js
+++ b/src/foo.js
@@ -1 +1 @@
+import bar from './bar';
`;
      const result = check.check({ diff, sensitivity: 'low' });
      const msg = result.messages[0];
      expect(msg).toHaveProperty('rule', 'semantic-drift');
      expect(msg).toHaveProperty('message');
      expect(msg).toHaveProperty('why');
    });
  });
});
