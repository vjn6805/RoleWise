import {defineConfig} from 'vitest/config';
export default defineConfig({test:{environment:'jsdom',environmentOptions:{jsdom:{url:'https://jobs.example.test/role'}},include:['tests/**/*.test.ts'],restoreMocks:true}});
