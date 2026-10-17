import json from '@rollup/plugin-json';
import { nodeResolve } from '@rollup/plugin-node-resolve';
import terser from '@rollup/plugin-terser';
import typescript from '@rollup/plugin-typescript';

// Im Watch-Modus (npm run watch) nicht minifizieren, damit man im Browser debuggen kann.
const dev = process.env.ROLLUP_WATCH === 'true';

export default {
  input: 'src/advent-calendar-card.ts',
  output: {
    file: 'dist/advent-calendar-card.js',
    format: 'es',
    inlineDynamicImports: true,
  },
  plugins: [
    nodeResolve(),
    json({ preferConst: true }),
    typescript({ include: ['src/**/*.ts'], noEmitOnError: !dev }),
    !dev && terser({ format: { comments: false } }),
  ],
};
