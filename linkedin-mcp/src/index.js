#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { loadDotEnv } from './config.js';
import { createContext, createLinkedInServer } from './server.js';

loadDotEnv();
const server = createLinkedInServer(createContext());
await server.connect(new StdioServerTransport());
console.error('linkedin-mcp running on stdio');
