// TEMPORARY: boot a long-lived web scaffold with a seeded rheplicant session
// (run + graph + gates + chains), print the URL, keep serving until killed.
import { writeFileSync } from 'node:fs'
import { describe, it } from 'vitest'
import { launchWebScaffold, realizeSeedFixture, seedSession } from './scaffold.ts'

const SEED_ID = 'rheplicant-console-demo'
const URL_FILE = '/Users/zzhang/projects/rheplicant-agent/.build/demo-url.txt'

const SEED_FIXTURE = [
  '{"type":"session","version":0,"id":"{{sessionId}}","createdAt":1784974100747,"cwd":"{{cwd}}"}',
  '{"type":"turn/start","seq":0,"time":1784974100758,"data":{"turn":1,"trigger":{"kind":"message","source":{"kind":"user","rpcId":"{{rpcId}}"}}}}',
  '{"type":"user/message","seq":1,"time":1784974100759,"data":{"content":[{"type":"text","text":"Fit the global signal and read back the chains."}],"source":{"kind":"user","rpcId":"{{rpcId}}"}},"surfaceOp":"append"}',
  '{"type":"step/start","seq":2,"time":1784974100827,"data":{"turn":1,"step":1}}',
  '{"type":"rheplicant/run","seq":3,"time":1784974100828,"ignorable":true,"data":{"document":{"schema_version":1,"model":{"global_signal":{"depth":0.1,"centre":75e6,"width":5e6},"gain":{"gain":1.1},"noise":{"sigma":0.05}}},"outcome":{"runs":[{"name":"fit","kind":"nuts","status":"ok","diagnostics":{"rhat":1.002,"n_eff":1327,"divergences":0,"notes":[]},"chains":{"g":[1.0,1.1,1.2,1.05,1.08,1.15,1.0,0.95,1.02,1.08],"amp":[0.5,0.51,0.49,0.52,0.5,0.5,0.48,0.52,0.5,0.49]}},{"name":"rank","kind":"identifiability","status":"ok","diagnostics":{"rank":6,"nullity":0,"singular_values":[10,8,5,3,1],"notes":[]}},{"name":"mmode","kind":"mmodes","status":"ok","spectrum":[[0.1,0.5,0.3,0.2],[0.4,0.9,0.6,0.3],[0.2,0.6,0.4,0.2],[0.1,0.3,0.2,0.1]],"diagnostics":{"notes":[]}}],"tookMs":42,"graph":{"graph":"single-antenna","lit":["global_signal","gain","noise"],"skipped":["astro_sum","beam_spill"],"svg":"<svg xmlns=\\"http://www.w3.org/2000/svg\\" width=\\"200\\" height=\\"60\\"><rect width=\\"200\\" height=\\"60\\" fill=\\"#07131f\\"/><text x=\\"10\\" y=\\"20\\" fill=\\"#F2A93B\\">global_signal → gain → noise</text><text x=\\"10\\" y=\\"40\\" fill=\\"#9fb3c4\\">(signal path lit/dim)</text></svg>"},"gates":[{"check":"C12","severity":"report","where":"inference.parameters.g","message":"relative departure 6.7e-13"}]},"transport":"local"}}',
  '{"type":"assistant/message","seq":4,"time":1784974100829,"data":{"turn":1,"step":1,"content":[{"type":"text","text":"Fitted the global signal; chains below."}],"provenance":{"provider":"deepseek-official","model":"deepseek-v4-flash"}},"surfaceOp":"append"}',
  '{"type":"step/end","seq":5,"time":1784974100830,"data":{"turn":1,"step":1}}',
  '{"type":"turn/end","seq":6,"time":1784974100831,"data":{"turn":1,"reason":{"kind":"completed"}}}',
  '',
].join('\n')

describe('serve rheplicant console demo', () => {
  it('boots and keeps serving', async () => {
    const scaffold = await launchWebScaffold({})
    await seedSession(scaffold, realizeSeedFixture(scaffold, SEED_FIXTURE, SEED_ID), SEED_ID)
    writeFileSync(URL_FILE, `${scaffold.baseUrl}\n${SEED_ID}\n`)
    console.log(`\n\nRHEPLICANT_DEMO_URL=${scaffold.baseUrl}\n\n`)
    await new Promise(() => {})
  }, 60 * 60 * 1000)
})
