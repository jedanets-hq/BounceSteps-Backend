const fs = require('fs');
const path = require('path');
const modelsDir = 'backend/models';

// Check all model files for the bug pattern
const files = fs.readdirSync(modelsDir).filter(f => f.endsWith('.js'));

files.forEach(file => {
  const content = fs.readFileSync(path.join(modelsDir, file), 'utf8');
  const lines = content.split('\n');
  
  lines.forEach((line, i) => {
    // Look for lines with index + N but without $$ before {
    if (line.includes('index +') && line.includes('= `') && !line.includes('= $`')) {
      // Check if it has the bug (single $ instead of $$)
      if (line.match(/= `\$\{key\}.*\$\{index/) && !line.match(/\$\$\{index/)) {
        console.log(`${file}:${i+1}: BUG FOUND`);
        console.log(`  ${line.trim()}`);
      }
    }
  });
});

console.log('\nDone checking models.');
