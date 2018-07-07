import babel from 'rollup-plugin-babel';

export default [
  {
    input: 'src/index.js',
    output: [
      {
        file: 'bin/systemEventsLogger.js',
        format: 'cjs',
        sourcemap: false,
        banner: '#!/usr/bin/env node',
      },
    ],
    external: [
      'elasticsearch',
      'amqplib',
      'commander',
      'uuid/v4',
      'debug',
    ],
    plugins: [
      babel({
        exclude: 'node_modules/**',
        envName: 'rollup',
      }),
    ],
  },
];
