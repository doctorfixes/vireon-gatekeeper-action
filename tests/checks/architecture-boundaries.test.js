import check from '../../checks/architecture-boundaries.js';

describe('architecture-boundaries check', () => {
  describe('when enforce_layers is false (default)', () => {
    it('passes with no context', () => {
      const result = check.check({});
      expect(result.passed).toBe(true);
      expect(result.messages).toEqual([]);
    });

    it('passes when enforce_layers is explicitly false', () => {
      const result = check.check({
        diff: 'some diff',
        architecture: { enforce_layers: false, allowed_layers: ['core', 'ui'] },
      });
      expect(result.passed).toBe(true);
      expect(result.messages).toEqual([]);
    });

    it('passes when allowed_layers is empty', () => {
      const result = check.check({
        diff: 'some diff',
        architecture: { enforce_layers: true, allowed_layers: [] },
      });
      expect(result.passed).toBe(true);
      expect(result.messages).toEqual([]);
    });
  });

  describe('when enforce_layers is true', () => {
    const layers = ['core', 'services', 'ui'];

    it('passes with an empty diff', () => {
      const result = check.check({
        diff: '',
        architecture: { enforce_layers: true, allowed_layers: layers },
      });
      expect(result.passed).toBe(true);
      expect(result.messages).toEqual([]);
    });

    it('passes when files do not reside in any recognised layer', () => {
      const diff = `diff --git a/utils/helper.js b/utils/helper.js
--- a/utils/helper.js
+++ b/utils/helper.js
@@ -1 +1 @@
+import foo from '../../core/foo.js';
`;
      const result = check.check({
        diff,
        architecture: { enforce_layers: true, allowed_layers: layers },
      });
      expect(result.passed).toBe(true);
      expect(result.messages).toEqual([]);
    });

    it('passes when a same-layer import is used', () => {
      const diff = `diff --git a/core/module.js b/core/module.js
--- a/core/module.js
+++ b/core/module.js
@@ -1 +1 @@
+import bar from '../core/bar.js';
`;
      const result = check.check({
        diff,
        architecture: { enforce_layers: true, allowed_layers: layers },
      });
      expect(result.passed).toBe(true);
      expect(result.messages).toEqual([]);
    });

    it('detects a layer violation when core imports from services', () => {
      const diff = `diff --git a/core/module.js b/core/module.js
--- a/core/module.js
+++ b/core/module.js
@@ -1 +1 @@
+import bar from '../services/bar.js';
`;
      const result = check.check({
        diff,
        architecture: { enforce_layers: true, allowed_layers: layers },
      });
      expect(result.passed).toBe(false);
      expect(result.messages).toHaveLength(1);
      expect(result.messages[0].message).toMatch(/Layer violation/);
      expect(result.messages[0].message).toMatch(/"core"/);
      expect(result.messages[0].message).toMatch(/"services"/);
    });

    it('detects a layer violation when core imports from ui', () => {
      const diff = `diff --git a/core/module.js b/core/module.js
--- a/core/module.js
+++ b/core/module.js
@@ -1 +1 @@
+import Widget from '../ui/Widget.js';
`;
      const result = check.check({
        diff,
        architecture: { enforce_layers: true, allowed_layers: layers },
      });
      expect(result.passed).toBe(false);
      expect(result.messages).toHaveLength(1);
      expect(result.messages[0].rule).toBe('architecture-boundaries');
      expect(result.messages[0].why).toMatch(/Inner layers should not depend on outer layers/);
    });

    it('allows ui (outer layer) to import from core (inner layer)', () => {
      const diff = `diff --git a/ui/component.js b/ui/component.js
--- a/ui/component.js
+++ b/ui/component.js
@@ -1 +1 @@
+import util from '../core/util.js';
`;
      const result = check.check({
        diff,
        architecture: { enforce_layers: true, allowed_layers: layers },
      });
      expect(result.passed).toBe(true);
      expect(result.messages).toEqual([]);
    });

    it('detects multiple violations across multiple files', () => {
      const diff = `diff --git a/core/a.js b/core/a.js
--- a/core/a.js
+++ b/core/a.js
@@ -1,2 +1,2 @@
+import x from '../services/x.js';
+import y from '../ui/y.js';
diff --git a/services/b.js b/services/b.js
--- a/services/b.js
+++ b/services/b.js
@@ -1 +1 @@
+import z from '../ui/z.js';
`;
      const result = check.check({
        diff,
        architecture: { enforce_layers: true, allowed_layers: layers },
      });
      expect(result.passed).toBe(false);
      expect(result.messages).toHaveLength(3);
    });

    it('handles require() syntax when it starts the added line', () => {
      const diff = `diff --git a/core/module.js b/core/module.js
--- a/core/module.js
+++ b/core/module.js
@@ -1 +1 @@
+require('../services/bar.js');
`;
      const result = check.check({
        diff,
        architecture: { enforce_layers: true, allowed_layers: layers },
      });
      expect(result.passed).toBe(false);
      expect(result.messages).toHaveLength(1);
    });

    it('ignores non-import lines in added content', () => {
      const diff = `diff --git a/core/module.js b/core/module.js
--- a/core/module.js
+++ b/core/module.js
@@ -1 +1 @@
+const x = 42;
+// just a comment mentioning services
`;
      const result = check.check({
        diff,
        architecture: { enforce_layers: true, allowed_layers: layers },
      });
      expect(result.passed).toBe(true);
    });

    it('has correct id and description', () => {
      expect(check.id).toBe('architecture-boundaries');
      expect(typeof check.description).toBe('string');
    });
  });
});
