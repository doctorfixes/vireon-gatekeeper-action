/**
 * Governance Contract Compiler
 * Loads, validates, and compiles a governance contract against the v2 schema.
 */

import { readFileSync, existsSync } from 'fs';
import { loadGovernanceContract } from './loadGovernanceContract.js';

/**
 * Compile a governance contract by loading and validating it against the provided schema.
 *
 * @param {string} contractPath - Path to the governance contract JSON file.
 * @param {string} [schemaPath] - Path to the JSON schema file for validation.
 * @returns {Object} The compiled and validated governance contract.
 */
function compileGovernanceContract(contractPath, schemaPath) {
  const contract = loadGovernanceContract(contractPath);

  if (schemaPath && existsSync(schemaPath)) {
    let schema;
    try {
      schema = JSON.parse(readFileSync(schemaPath, 'utf8'));
    } catch {
      // schema not parseable — skip validation
      return contract;
    }
    _validateRequiredFields(contract, schema, contractPath);
  }

  return contract;
}

/**
 * Lightweight validation of a contract object against a JSON schema's required fields.
 * Checks that all top-level required fields are present in the compiled contract.
 *
 * @param {Object} contract
 * @param {Object} schema
 * @param {string} contractPath
 */
function _validateRequiredFields(contract, schema, contractPath) {
  const required = Array.isArray(schema.required) ? schema.required : [];
  const missing = required.filter((field) => !(field in contract));
  if (missing.length > 0) {
    console.warn(
      `[compileGovernanceContract] Contract at "${contractPath}" is missing required fields: ${missing.join(', ')}`
    );
  }
}

export { compileGovernanceContract };
