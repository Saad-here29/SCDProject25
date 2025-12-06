// main.js
require('dotenv').config();
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const readline = require('readline-sync');
const Record = require('./models/Record');

const BACKUP_DIR = path.join(__dirname, 'backups');
if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });

const MONGO_URI = process.env.MONGO_URI;
if (!MONGO_URI) {
  console.error('ERROR: MONGO_URI missing in .env. Create .env with MONGO_URI.');
  process.exit(1);
}

mongoose.connect(MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(()=> console.log('MongoDB connected'))
  .catch(err => { console.error('MongoDB connection error:', err); process.exit(1); });

/* ---------- Utility helpers ---------- */

function formatDate(d) {
  if (!d) return '-';
  const dt = new Date(d);
  return dt.getFullYear() + '-' +
    String(dt.getMonth()+1).padStart(2,'0') + '-' +
    String(dt.getDate()).padStart(2,'0') + ' ' +
    String(dt.getHours()).padStart(2,'0') + ':' +
    String(dt.getMinutes()).padStart(2,'0') + ':' +
    String(dt.getSeconds()).padStart(2,'0');
}

function backupFilename() {
  const now = new Date();
  const ts = now.getFullYear() + '-' +
    String(now.getMonth()+1).padStart(2,'0') + '-' +
    String(now.getDate()).padStart(2,'0') + '_' +
    String(now.getHours()).padStart(2,'0') + '-' +
    String(now.getMinutes()).padStart(2,'0') + '-' +
    String(now.getSeconds()).padStart(2,'0');
  return `backup_${ts}.json`;
}

async function createBackup() {
  try {
    const all = await Record.find({}).sort({ id: 1 }).lean();
    const filename = path.join(BACKUP_DIR, backupFilename());
    fs.writeFileSync(filename, JSON.stringify(all, null, 2), 'utf8');
    console.log(`Backup created: ${path.relative(process.cwd(), filename)}`);
  } catch (err) {
    console.error('Backup failed:', err);
  }
}

/* ---------- CRUD + features ---------- */

async function nextId() {
  const last = await Record.findOne({}).sort({ id: -1 }).lean();
  return last ? (last.id + 1) : 100; // start at 100 if no records
}

async function addRecord() {
  try {
    const name = readline.question('Enter name: ').trim();
    if (!name) { console.log('Name required.'); return; }
    const useId = readline.question('Provide custom numeric ID? (y/N): ').trim().toLowerCase();
    let id;
    if (useId === 'y') {
      const tmp = Number(readline.question('Enter numeric ID: ').trim());
      if (!Number.isInteger(tmp)) { console.log('Invalid ID.'); return; }
      const exists = await Record.findOne({ id: tmp });
      if (exists) { console.log('ID already exists.'); return; }
      id = tmp;
    } else {
      id = await nextId();
    }
    const rec = new Record({ id, name });
    await rec.save();
    console.log(`Record added: ID ${id} | ${name}`);
    await createBackup();
  } catch (err) {
    console.error('Add failed:', err.message || err);
  }
}

async function viewAll(displayList = null) {
  try {
    const list = displayList || await Record.find({}).sort({ id: 1 }).lean();
    if (!list.length) {
      console.log('No records in vault.');
      return list;
    }
    console.log('\nRecords:');
    list.forEach((r, i) => {
      console.log(`${i+1}. ID: ${r.id} | Name: ${r.name} | Created: ${formatDate(r.created)} | Modified: ${formatDate(r.modified)}`);
    });
    console.log('');
    return list;
  } catch (err) {
    console.error('View failed:', err);
    return [];
  }
}

async function updateRecord() {
  try {
    const id = Number(readline.question('Enter ID to update: ').trim());
    if (!Number.isInteger(id)) { console.log('Invalid ID'); return; }
    const rec = await Record.findOne({ id });
    if (!rec) { console.log('Record not found'); return; }

    console.log(`Current name: ${rec.name}`);
    const newName = readline.question('Enter new name (leave blank to keep): ').trim();
    if (newName) rec.name = newName;
    rec.modified = new Date();
    await rec.save();
    console.log('Record updated.');
  } catch (err) {
    console.error('Update failed:', err);
  }
}

async function deleteRecord() {
  try {
    const id = Number(readline.question('Enter ID to delete: ').trim());
    if (!Number.isInteger(id)) { console.log('Invalid ID'); return; }
    const rec = await Record.findOne({ id });
    if (!rec) { console.log('Record not found'); return; }
    const confirm = readline.question(`Are you sure to delete ID ${id} (${rec.name})? (y/N): `).trim().toLowerCase();
    if (confirm !== 'y') { console.log('Delete cancelled'); return; }
    await Record.deleteOne({ id });
    console.log('Record deleted.');
    await createBackup();
  } catch (err) {
    console.error('Delete failed:', err);
  }
}

/* ---------- Search ---------- */

async function searchRecords() {
  try {
    const keyword = readline.question('Enter search keyword (name or id): ').trim();
    if (!keyword) { console.log('Enter something.'); return; }
    const isNumber = /^\d+$/.test(keyword);
    let results;
    if (isNumber) {
      results = await Record.find({ id: Number(keyword) }).lean();
    } else {
      const regex = new RegExp(keyword, 'i');
      results = await Record.find({ name: regex }).lean();
    }

    if (!results.length) {
      console.log('No records found.');
    } else {
      console.log(`Found ${results.length} matching record(s):`);
      results.forEach((r, i) => {
        console.log(`${i+1}. ID: ${r.id} | Name: ${r.name} | Created: ${formatDate(r.created)}`);
      });
    }
  } catch (err) {
    console.error('Search failed:', err);
  }
}

/* ---------- Sort (display-only) ---------- */

async function sortRecords() {
  try {
    const by = readline.question('Choose field to sort by (name/date): ').trim().toLowerCase();
    if (!['name','date'].includes(by)) { console.log('Invalid choice'); return; }
    const order = readline.question('Choose order (asc/desc): ').trim().toLowerCase();
    if (!['asc','desc'].includes(order)) { console.log('Invalid order'); return; }

    const all = await Record.find({}).lean();
    let sorted = [...all];

    if (by === 'name') {
      sorted.sort((a,b) => a.name.localeCompare(b.name));
    } else {
      sorted.sort((a,b) => new Date(a.created) - new Date(b.created));
    }

    if (order === 'desc') sorted.reverse();

    console.log('\nSorted Records:');
    sorted.forEach((r,i) => {
      console.log(`${i+1}. ID: ${r.id} | Name: ${r.name} | Created: ${formatDate(r.created)}`);
    });
    console.log('');
  } catch (err) {
    console.error('Sort failed:', err);
  }
}

/* ---------- Export to export.txt ---------- */

async function exportData() {
  try {
    const all = await Record.find({}).sort({ id: 1 }).lean();
    const now = new Date();
    const header = `Vault Export\nDate: ${formatDate(now)}\nTotal Records: ${all.length}\nFile: export.txt\n\n`;
    let body = '';
    all.forEach(r => {
      body += `ID: ${r.id}\nName: ${r.name}\nCreated: ${formatDate(r.created)}\nModified: ${formatDate(r.modified)}\n-------------------------\n`;
    });

    fs.writeFileSync(path.join(process.cwd(), 'export.txt'), header + body, 'utf8');
    console.log('Data exported successfully to export.txt');
  } catch (err) {
    console.error('Export failed:', err);
  }
}

/* ---------- Statistics ---------- */

async function viewStats() {
  try {
    const all = await Record.find({}).lean();
    if (!all.length) { console.log('Vault is empty.'); return; }

    const total = all.length;
    const lastModified = new Date(Math.max(...all.map(r => new Date(r.modified).getTime())));
    const longest = all.reduce((a,b) => (a.name.length >= b.name.length ? a : b));
    const earliest = new Date(Math.min(...all.map(r => new Date(r.created).getTime())));
    const latest = new Date(Math.max(...all.map(r => new Date(r.created).getTime())));

    console.log('\nVault Statistics:\n--------------------------');
    console.log(`Total Records: ${total}`);
    console.log(`Last Modified: ${formatDate(lastModified)}`);
    console.log(`Longest Name: ${longest.name} (${longest.name.length} characters)`);
    console.log(`Earliest Record: ${earliest.toISOString().split('T')[0]}`);
    console.log(`Latest Record: ${latest.toISOString().split('T')[0]}\n`);
  } catch (err) {
    console.error('Stats failed:', err);
  }
}

/* ---------- Menu ---------- */

async function showMenu() {
  console.log(`
--- Vault CLI ---
1. Add Record
2. View All Records
3. Update Record
4. Delete Record
5. Search Records
6. Sort Records
7. Export Data
8. View Vault Statistics
9. Exit
`);
  const choice = readline.question('Choose an option: ').trim();
  return choice;
}

async function mainLoop() {
  while (true) {
    const choice = await showMenu();
    switch (choice) {
      case '1': await addRecord(); break;
      case '2': await viewAll(); break;
      case '3': await updateRecord(); break;
      case '4': await deleteRecord(); break;
      case '5': await searchRecords(); break;
      case '6': await sortRecords(); break;
      case '7': await exportData(); break;
      case '8': await viewStats(); break;
      case '9':
        console.log('Exiting...');
        mongoose.disconnect();
        process.exit(0);
      default:
        console.log('Invalid option.');
    }
  }
}

mainLoop().catch(err => {
  console.error('Fatal error:', err);
  mongoose.disconnect();
  process.exit(1);
});

