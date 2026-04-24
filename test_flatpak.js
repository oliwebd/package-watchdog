import { execSync } from 'child_process';

const listOut = execSync('flatpak list --columns=application,active,options').toString();
const installed = new Map();
listOut.trim().split('\n').filter(Boolean).forEach(line => {
    const parts = line.split(/\s+/);
    if (parts.length < 2) return;
    const app = parts[0];
    const active = parts[1];
    const opts = parts[2] || '';
    const hashes = [active];
    const altMatch = opts.match(/alt-id=([0-9a-f]+)/);
    if (altMatch) hashes.push(altMatch[1]);
    installed.set(app, hashes);
});

const appOut = execSync('flatpak remote-ls --updates --app --columns=application,commit:f').toString();
const apps = appOut.trim().split('\n').filter(Boolean).map(line => {
    if (line.startsWith('Application ID')) return null;
    const parts = line.split(/\s+/);
    if (parts.length < 2) return null;
    const app = parts[0];
    const remoteCommit = parts[1];
    
    const localHashes = installed.get(app);
    if (localHashes) {
        const isInstalled = localHashes.some(h => h.startsWith(remoteCommit));
        if (isInstalled) return null;
    }
    return app;
}).filter(Boolean);

console.log("Valid App updates:", apps);
