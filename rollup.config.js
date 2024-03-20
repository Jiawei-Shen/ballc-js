import commonjs from '@rollup/plugin-commonjs';

export default {
    input: 'src/BAllC.js', // Entry point of your application
    output: {
        file: 'dist/bundle.js', // Output file path
        format: 'commonjs', // Output format (UMD, CommonJS, ES module, etc.)
        name: 'MyLibrary', // Name of the exported variable in the UMD bundle
    },
    external: ['buffer', 'generic-filehandle', '@gmod/bgzf-filehandle', 'node-fetch'],

    plugins: [
        // Other plugins...
        commonjs() // If you're using CommonJS modules
    ]
};
