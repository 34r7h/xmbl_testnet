import { spawn } from 'child_process'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const rootDir = join(__dirname, '..')

const modules = [
  { name: 'XCLT', port: 3001 },
  { name: 'XVSM', port: 3002 },
  { name: 'XID', port: 3003 },
  { name: 'XPC', port: 3004 },
  { name: 'XSC', port: 3005 },
  // XSIM removed - should only be started by visualizer when needed
  { name: 'XCLI', port: 3007 },
  { name: 'XV', port: 3008 }
]

const processes = []

modules.forEach(module => {
  const modulePath = join(rootDir, module.name.toLowerCase())
  const isBash = module.name === 'XCLI'
  
  if (isBash) {
    const proc = spawn('bash', [join(modulePath, 'index.js')], {
      cwd: modulePath,
      stdio: 'inherit',
      env: { ...process.env, PORT: module.port }
    })
    processes.push(proc)
  } else {
    const proc = spawn('node', [join(modulePath, 'index.js')], {
      cwd: modulePath,
      stdio: 'inherit',
      env: { ...process.env, PORT: module.port }
    })
    processes.push(proc)
  }
})

const rootProc = spawn('vite', [], {
  cwd: rootDir,
  stdio: 'inherit'
})
processes.push(rootProc)

process.on('SIGINT', () => {
  processes.forEach(proc => proc.kill())
  process.exit()
})

process.on('SIGTERM', () => {
  processes.forEach(proc => proc.kill())
  process.exit()
})



