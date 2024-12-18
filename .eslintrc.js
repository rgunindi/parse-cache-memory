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
    overrides: [
        {
            files: ['**/*.test.js', '**/__tests__/**'],
            rules: {
                'no-unused-vars': 'off',
                'no-console': 'off'
            }
        }
    ],
    ignorePatterns: [
        'node_modules/',
        'coverage/',
        'dist/'
    ]
}; 