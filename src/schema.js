// src/schema.js

/**
 * Very simple schema validation.
 * You can expand this to full JSON Schema later.
 */
function validateSchema(schema, contract) {
  if (!schema || typeof schema !== 'object') {
    throw new Error('Schema must be an object');
  }

  if (!contract || typeof contract !== 'object') {
    throw new Error('Contract must be an object');
  }

  if (!Array.isArray(schema.rules)) {
    throw new Error('Schema must define a "rules" array');
  }

  // Optional: ensure each rule has an id and severity
  schema.rules.forEach((rule, idx) => {
    if (!rule.id) {
      throw new Error(`Schema rule at index ${idx} is missing "id"`);
    }
  });
}

module.exports = {
  validateSchema
};
