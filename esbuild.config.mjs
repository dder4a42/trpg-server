/**
 * esbuild Configuration
 * Bundles ES modules for production
 */
import * as esbuild from 'esbuild';

const isWatch = process.argv.includes('--watch');

// Build configuration for frontend modules
const buildConfig = {
  entryPoints: ['public/js/main.js', 'public/js/game-client.js'],
  outdir: 'public/dist',
  bundle: true,
  format: 'esm',
  sourcemap: true,
  target: 'es2020',
  logLevel: 'info',
};

// Watch mode setup
if (isWatch) {
  const ctx = await esbuild.context(buildConfig);
  console.log('Watching for changes...');
  await ctx.watch();
} else {
  await esbuild.build(buildConfig);
  console.log('Build complete!');
}
