import esbuild from 'esbuild';
import fs from 'fs';

const commonOptions: esbuild.BuildOptions = {
    bundle: true,
    minify: false,
    format: 'esm',
    target: 'es2022',
    external: ['gi://*', 'resource://*'],
    logLevel: 'info',
};

async function runBuild() {
    try {
        // Build extension.ts -> dist/extension.js
        await esbuild.build({
            ...commonOptions,
            entryPoints: ['src/extension.ts'],
            outfile: 'dist/extension.js',
        });

        // Build prefs.ts -> dist/prefs.js
        await esbuild.build({
            ...commonOptions,
            entryPoints: ['src/prefs.ts'],
            outfile: 'dist/prefs.js',
        });

        // Copy stylesheet.css
        if (fs.existsSync('src/stylesheet.css')) {
            fs.copyFileSync('src/stylesheet.css', 'dist/stylesheet.css');
        }

        console.log('Build successful');
    } catch (err) {
        console.error('Build failed:', err);
        process.exit(1);
    }
}

if (process.argv.includes('--watch')) {
    // Basic watch implementation
    esbuild
        .context({
            ...commonOptions,
            entryPoints: ['src/extension.ts', 'src/prefs.ts'],
            outdir: 'dist',
        })
        .then((ctx) => ctx.watch());
} else {
    runBuild();
}
