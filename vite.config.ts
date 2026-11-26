import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// GitHub Pages serves this repo at https://shuhamcj.github.io/coolplant/
export default defineConfig({ base: '/coolplant/', plugins: [react(), tailwindcss()] });
