const fs = require('fs');
const path = require('path');

function walk(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach(file => {
    file = dir + '/' + file;
    const stat = fs.statSync(file);
    if (stat && stat.isDirectory()) { 
      results = results.concat(walk(file));
    } else { 
      results.push(file);
    }
  });
  return results;
}

const files = walk('src').filter(f => f.endsWith('.tsx'));
let hasDups = false;

files.forEach(file => {
  const content = fs.readFileSync(file, 'utf8');
  const matches = content.match(/key=\{[^}]+\}|key="[^"]+"/g);
  if (matches) {
    const counts = {};
    matches.forEach(m => {
      counts[m] = (counts[m] || 0) + 1;
    });
    for (const [key, count] of Object.entries(counts)) {
      if (count > 1) {
        console.log(`Duplicate in ${file}: ${key} appears ${count} times`);
        hasDups = true;
      }
    }
  }
});

if (!hasDups) {
  console.log("No exact string duplicates found. Checking for variables used as keys multiple times...");
}
