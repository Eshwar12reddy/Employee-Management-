import readline from 'node:readline/promises'
import { stdin as input, stdout as output } from 'node:process'
import { readConfig } from '../config/environment.js'
import { createRepository } from '../db/create-repository.js'
import { AuthService } from '../services/auth-service.js'
import type { UserRole } from '../db/candidate-repository.js'

const roleArg = process.argv.find(value => value.startsWith('--role='))?.slice('--role='.length) as UserRole | undefined
if (roleArg !== 'CEO' && roleArg !== 'TEAM_LEAD') throw new Error('Use --role=CEO for the first account or --role=TEAM_LEAD for a Team Lead account')

const arg = (name: string) => process.argv.find(value => value.startsWith(`--${name}=`))?.slice(name.length + 3)
const rl = (!arg('name') || !arg('email')) ? readline.createInterface({ input, output }) : null
const name = (arg('name') || await rl!.question('Full name: ')).trim()
const email = (arg('email') || await rl!.question('Email: ')).trim()
async function promptPassword(): Promise<string> {
  if (process.env.PROVISION_PASSWORD) return process.env.PROVISION_PASSWORD.trim()
  if (!input.isTTY || !input.setRawMode) throw new Error('Set PROVISION_PASSWORD for non-interactive provisioning')
  return new Promise(resolve => {
    let value = ''
    output.write('Password (12+ characters): ')
    input.setRawMode!(true); input.resume()
    const onData = (chunk: Buffer) => {
      for (const character of chunk.toString()) {
        if (character === '\u0003') { input.setRawMode!(false); process.exit(1) }
        if (character === '\r' || character === '\n') { input.setRawMode!(false); input.pause(); input.off('data', onData); output.write('\n'); resolve(value); return }
        if (character === '\u007f') { value = value.slice(0, -1); continue }
        value += character
      }
    }
    input.on('data', onData)
  })
}
const password = await promptPassword()
rl?.close()

const config = readConfig()
const database = await createRepository(config)
try {
  const user = await new AuthService(database.auth, config).createUser({ email, name, password, role: roleArg, allowCeoBootstrap: roleArg === 'CEO' })
  console.log(`Provisioned ${user.role} account for ${user.email}.`)
} finally {
  await database.close()
}
