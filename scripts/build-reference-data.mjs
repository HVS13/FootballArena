import fs from 'node:fs';
import path from 'node:path';

const inputPath = path.resolve('football_game_reference.md');
const outputPath = path.resolve('src/data/referenceData.json');

const md = fs.readFileSync(inputPath, 'utf8');
const lines = md.split(/\r?\n/);

const data = {
  attributes: {
    technical: [],
    goalkeeping: [],
    mental: [],
    physical: [],
    hidden: []
  },
  playstyles: [],
  teamInstructions: {
    inPossession: [],
    outOfPossession: []
  },
  roles: {},
  duties: []
};

const slugify = (value) => value
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '_')
  .replace(/^_+|_+$/g, '');

const parseBullet = (line) => {
  const match = line.match(/^- \*\*(.+?)\*\*(.*)$/);
  if (!match) return null;

  const name = match[1].trim();
  let rest = match[2].trim();
  let note = '';

  if (rest.startsWith('(')) {
    const noteMatch = rest.match(/^\((.*?)\)\s*-\s*(.*)$/);
    if (noteMatch) {
      note = noteMatch[1].trim();
      rest = noteMatch[2].trim();
    }
  }

  if (rest.startsWith('-')) {
    rest = rest.replace(/^-\s*/, '');
  }

  let description = rest;
  let options = [];

  const optionsMatch = rest.match(/Options:\s*(.*)$/i);
  if (optionsMatch) {
    const optionsText = optionsMatch[1];
    const optionMatches = [...optionsText.matchAll(/\*([^*]+)\*/g)];
    options = optionMatches.map((m) => m[1].trim()).filter(Boolean);
    if (!options.length) {
      options = optionsText.split(',').map((opt) => opt.trim()).filter(Boolean);
    }
  }

  if (note) {
    description = `${note}. ${description}`.trim();
  }

  return {
    id: slugify(name),
    name,
    description: description.trim(),
    options
  };
};

const isHeading = (line, level) => line.startsWith('#'.repeat(level) + ' ');

let currentSection = '';
let currentSubsection = '';

for (const line of lines) {
  if (isHeading(line, 2)) {
    currentSection = line.replace(/^## /, '').trim();
    currentSubsection = '';
    continue;
  }

  if (isHeading(line, 3)) {
    currentSubsection = line.replace(/^### /, '').trim();
    continue;
  }

  if (!line.startsWith('- **')) {
    continue;
  }

  const bullet = parseBullet(line);
  if (!bullet) continue;

  if (currentSection === 'Football Manager Player Attributes (Stats)') {
    if (currentSubsection.startsWith('Technical')) {
      data.attributes.technical.push(bullet);
    } else if (currentSubsection.startsWith('Goalkeeping')) {
      data.attributes.goalkeeping.push(bullet);
    } else if (currentSubsection.startsWith('Mental')) {
      data.attributes.mental.push(bullet);
    } else if (currentSubsection.startsWith('Physical')) {
      data.attributes.physical.push(bullet);
    } else if (currentSubsection.startsWith('Hidden')) {
      data.attributes.hidden.push(bullet);
    }
    continue;
  }

  if (currentSection === 'EA Sports FC PlayStyles and PlayStyle+ Effects') {
    const category = currentSubsection.replace(' PlayStyles', '').trim();
    data.playstyles.push({
      id: bullet.id,
      name: bullet.name,
      description: bullet.description,
      category
    });
    continue;
  }

  if (currentSection === 'Football Manager 26 Team Instructions') {
    if (currentSubsection.startsWith('In Possession')) {
      data.teamInstructions.inPossession.push(bullet);
    } else if (currentSubsection.startsWith('Out of Possession')) {
      data.teamInstructions.outOfPossession.push(bullet);
    }
    continue;
  }

  if (currentSection === 'Football Manager 26 Player Roles') {
    const key = slugify(currentSubsection.replace(' roles', ''));
    if (!data.roles[key]) {
      data.roles[key] = [];
    }
    data.roles[key].push(bullet);
    continue;
  }

  if (currentSection === 'Player Duties') {
    data.duties.push(bullet);
  }
}

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, JSON.stringify(data, null, 2), 'utf8');

console.log('Wrote', outputPath);
