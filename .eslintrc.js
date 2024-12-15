module.exports = {
    env: {
        node: true,
        es2021: true,
        jest: true
    },
    extends: [
        'eslint:recommended'
    ],
    parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module'
    },
    rules: {
        'no-unused-vars': ['warn', { 
            'argsIgnorePattern': '^_',
            'varsIgnorePattern': '^_'
        }],
        'no-console': 'warn',
        'semi': ['error', 'always']
    },
    ignorePatterns: [
        'node_modules/',
        'coverage/',
        'dist/'
    ]
}; 