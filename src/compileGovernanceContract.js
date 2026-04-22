const fs = require('fs');
const path = require('path');
const Ajv = require('ajv/dist/2020');

function compileGovernanceContract(contractPath, schemaPath) {
  const contract = JSON.parse(fs.readFileSync(path.resolve(contractPath), 'utf8'));
  const schema = JSON.parse(fs.readFileSync(path.resolve(schemaPath), 'utf8'));

  const ajv = new Ajv({ allErrors: true });
  const validate = ajv.compile(schema);

  if (!validate(contract)) {
    const errors = validate.errors || [];
    throw new Error(`Invalid governance contract: ${JSON.stringify(errors, null, 2)}`);
  }

  return contract;
}

module.exports = { compileGovernanceContract };

