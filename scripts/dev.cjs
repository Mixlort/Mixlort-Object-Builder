#!/usr/bin/env node

const path = require('node:path')
const { createDevProcessManager } = require('./dev-process.cjs')

const binName = process.platform === 'win32' ? 'electron-vite.cmd' : 'electron-vite'
const command = path.resolve(__dirname, '..', 'node_modules', '.bin', binName)
const args = ['dev', ...process.argv.slice(2)]

createDevProcessManager({ command, args }).start()
