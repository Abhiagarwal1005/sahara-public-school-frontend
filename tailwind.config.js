/** @type {import('tailwindcss').Config} */
export default {
    content: ['./index.html', './src/**/*.{js,jsx}'],
    theme: {
        extend: {
            colors: {
                // The palette approved in the UI preview.
                // Blackboard green — from the school's own world, and distinct from the
                // AI-default purple/indigo gradients seen on every other dashboard.
                ink: { DEFAULT: '#15201B', 2: '#57625B', 3: '#7E887F' },
                paper: { DEFAULT: '#F1F4F0', card: '#FFFFFF', 2: '#F7F9F6' },
                line: { DEFAULT: '#E2E7DF', 2: '#CFD7CB' },
                brand: { DEFAULT: '#1E5C44', 2: '#2F7D5D', soft: '#E5EFE9' },
                sidebar: { DEFAULT: '#12201A', ink: '#B7C6BD', ink2: '#7C8D84', sel: '#1C3329' },
                // Status colors - CVD validator se paas hue steps (green/amber
                // apart was the hardest pair). These always ship with a text label
                // always ship with a text label; never colour alone.
                good: { DEFAULT: '#0F7A4D', bg: '#E3F1E9' },
                warn: { DEFAULT: '#B98200', bg: '#FBF0DA' },
                crit: { DEFAULT: '#A8231A', bg: '#FAE6E3' },
            },
            fontFamily: {
                sans: ['-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'Helvetica Neue', 'Arial', 'sans-serif'],
                mono: ['ui-monospace', 'SF Mono', 'SFMono-Regular', 'Menlo', 'Consolas', 'monospace'],
            },
            boxShadow: {
                card: '0 1px 2px rgba(20,35,28,.06), 0 4px 12px rgba(20,35,28,.05)',
            },
        },
    },
    plugins: [],
};
