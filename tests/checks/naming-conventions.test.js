import check from '../../checks/naming-conventions.js';

describe('naming-conventions check', () => {
  describe('when enforce_case is false (default)', () => {
    it('passes with no context', () => {
      const result = check.check({});
      expect(result.passed).toBe(true);
      expect(result.messages).toEqual([]);
    });

    it('passes even with badly named files when enforce_case is false', () => {
      const diff = `diff --git a/src/BadFile_Name.js b/src/BadFile_Name.js
--- a/src/BadFile_Name.js
+++ b/src/BadFile_Name.js
@@ -1 +1 @@
+const BadVar = 1;
`;
      const result = check.check({ diff, naming: { enforce_case: false } });
      expect(result.passed).toBe(true);
      expect(result.messages).toEqual([]);
    });
  });

  describe('file name casing', () => {
    it('passes for a kebab-case file name (default)', () => {
      const diff = `diff --git a/src/my-module.js b/src/my-module.js
--- a/src/my-module.js
+++ b/src/my-module.js
@@ -1 +1 @@
+const x = 1;
`;
      const result = check.check({ diff, naming: { enforce_case: true, file_case: 'kebab' } });
      expect(result.passed).toBe(true);
      expect(result.messages).toEqual([]);
    });

    it('fails for a PascalCase file when kebab is required', () => {
      const diff = `diff --git a/src/MyModule.js b/src/MyModule.js
--- a/src/MyModule.js
+++ b/src/MyModule.js
@@ -1 +1 @@
+const x = 1;
`;
      const result = check.check({ diff, naming: { enforce_case: true, file_case: 'kebab' } });
      expect(result.passed).toBe(false);
      expect(result.messages).toHaveLength(1);
      expect(result.messages[0].message).toMatch(/MyModule/);
      expect(result.messages[0].message).toMatch(/kebab/);
    });

    it('passes for a snake_case file when snake is required', () => {
      const diff = `diff --git a/src/my_module.js b/src/my_module.js
--- a/src/my_module.js
+++ b/src/my_module.js
@@ -1 +1 @@
+const x = 1;
`;
      const result = check.check({ diff, naming: { enforce_case: true, file_case: 'snake' } });
      expect(result.passed).toBe(true);
    });

    it('fails for kebab-case file when snake is required', () => {
      const diff = `diff --git a/src/my-module.js b/src/my-module.js
--- a/src/my-module.js
+++ b/src/my-module.js
@@ -1 +1 @@
+const x = 1;
`;
      const result = check.check({ diff, naming: { enforce_case: true, file_case: 'snake' } });
      expect(result.passed).toBe(false);
    });

    it('passes for PascalCase file when pascal is required', () => {
      const diff = `diff --git a/src/MyComponent.js b/src/MyComponent.js
--- a/src/MyComponent.js
+++ b/src/MyComponent.js
@@ -1 +1 @@
+const x = 1;
`;
      const result = check.check({ diff, naming: { enforce_case: true, file_case: 'pascal' } });
      expect(result.passed).toBe(true);
    });
  });

  describe('class name casing', () => {
    it('passes for PascalCase class (default)', () => {
      const diff = `diff --git a/src/my-module.js b/src/my-module.js
--- a/src/my-module.js
+++ b/src/my-module.js
@@ -1 +1 @@
+class MyService {}
`;
      const result = check.check({ diff, naming: { enforce_case: true, file_case: 'kebab', class_case: 'pascal' } });
      expect(result.passed).toBe(true);
    });

    it('fails for camelCase class when pascal is required', () => {
      const diff = `diff --git a/src/my-module.js b/src/my-module.js
--- a/src/my-module.js
+++ b/src/my-module.js
@@ -1 +1 @@
+class myService {}
`;
      const result = check.check({ diff, naming: { enforce_case: true, file_case: 'kebab', class_case: 'pascal' } });
      expect(result.passed).toBe(false);
      expect(result.messages[result.messages.length - 1].message).toMatch(/myService/);
      expect(result.messages[result.messages.length - 1].message).toMatch(/pascal/);
    });

    it('passes for exported abstract class with PascalCase name', () => {
      const diff = `diff --git a/src/my-module.js b/src/my-module.js
--- a/src/my-module.js
+++ b/src/my-module.js
@@ -1 +1 @@
+export abstract class BaseHandler {}
`;
      const result = check.check({ diff, naming: { enforce_case: true, file_case: 'kebab', class_case: 'pascal' } });
      expect(result.passed).toBe(true);
    });

    it('passes for interface with PascalCase name', () => {
      const diff = `diff --git a/src/my-module.js b/src/my-module.js
--- a/src/my-module.js
+++ b/src/my-module.js
@@ -1 +1 @@
+interface MyInterface {}
`;
      const result = check.check({ diff, naming: { enforce_case: true, file_case: 'kebab', class_case: 'pascal' } });
      expect(result.passed).toBe(true);
    });
  });

  describe('variable name casing', () => {
    it('passes for camelCase variable (default)', () => {
      const diff = `diff --git a/src/my-module.js b/src/my-module.js
--- a/src/my-module.js
+++ b/src/my-module.js
@@ -1 +1 @@
+const myVariable = 1;
`;
      const result = check.check({ diff, naming: { enforce_case: true, file_case: 'kebab', variable_case: 'camel' } });
      expect(result.passed).toBe(true);
    });

    it('fails for PascalCase variable when camel is required', () => {
      const diff = `diff --git a/src/my-module.js b/src/my-module.js
--- a/src/my-module.js
+++ b/src/my-module.js
@@ -1 +1 @@
+const MyVariable = 1;
`;
      const result = check.check({ diff, naming: { enforce_case: true, file_case: 'kebab', variable_case: 'camel' } });
      expect(result.passed).toBe(false);
      expect(result.messages[result.messages.length - 1].message).toMatch(/MyVariable/);
    });

    it('passes for let and var declarations', () => {
      const diff = `diff --git a/src/my-module.js b/src/my-module.js
--- a/src/my-module.js
+++ b/src/my-module.js
@@ -1,2 +1,2 @@
+let myLetVar = 1;
+var myVarVar = 2;
`;
      const result = check.check({ diff, naming: { enforce_case: true, file_case: 'kebab', variable_case: 'camel' } });
      expect(result.passed).toBe(true);
    });

    it('passes for exported const with camelCase', () => {
      const diff = `diff --git a/src/my-module.js b/src/my-module.js
--- a/src/my-module.js
+++ b/src/my-module.js
@@ -1 +1 @@
+export const myConfig = {};
`;
      const result = check.check({ diff, naming: { enforce_case: true, file_case: 'kebab', variable_case: 'camel' } });
      expect(result.passed).toBe(true);
    });
  });

  describe('multiple violations', () => {
    it('reports all violations from file name, class, and variable', () => {
      const diff = `diff --git a/src/BadFile.js b/src/BadFile.js
--- a/src/BadFile.js
+++ b/src/BadFile.js
@@ -1,2 +1,2 @@
+class bad_class {}
+const BadVar = 1;
`;
      const result = check.check({
        diff,
        naming: {
          enforce_case: true,
          file_case: 'kebab',
          class_case: 'pascal',
          variable_case: 'camel',
        },
      });
      expect(result.passed).toBe(false);
      // file name BadFile, class bad_class, variable BadVar
      expect(result.messages.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('unknown case style', () => {
    it('does not produce a false-positive for an unknown case style', () => {
      const diff = `diff --git a/src/my-module.js b/src/my-module.js
--- a/src/my-module.js
+++ b/src/my-module.js
@@ -1 +1 @@
+const AnythingGoes = 1;
`;
      const result = check.check({ diff, naming: { enforce_case: true, file_case: 'kebab', variable_case: 'unknown-style' } });
      // Unknown variable_case → skip check, only file name matters
      expect(result.passed).toBe(true);
    });
  });

  it('has correct id and description', () => {
    expect(check.id).toBe('naming-conventions');
    expect(typeof check.description).toBe('string');
  });
});
