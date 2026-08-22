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
  '{"type":"rheplicant/run","seq":3,"time":1784974100828,"ignorable":true,"data":{"document":{},"outcome":{"runs":[{"name":"fit","kind":"nuts","status":"ok","diagnostics":{"rhat":1.004,"n_eff":980,"divergences":2,"notes":[]},"chains":{"g":[1,1.1,1.2,1.05,1.08,1.15],"amp":[0.5,0.51,0.49,0.52,0.5,0.5],"beam[0]":[2,2.1,1.9,2.05,2,1.95],"beam[1]":[0.3,0.32,0.29,0.31,0.3,0.28],"wide.mean":[10,10.4,10.78,11.13,11.43,11.68,11.86,11.97,12,11.95,11.82,11.62,11.35,11.03,10.67,10.28,9.88,9.49,9.11,8.78,8.49,8.26,8.1,8.01,8.01,8.08,8.23,8.45,8.74,9.07,9.44,9.83,10.23,10.62,10.99,11.31,11.59,11.8,11.94,12],"wide.q05":[9,9.4,9.78,10.13,10.43,10.68,10.86,10.97,11,10.95,10.82,10.62,10.35,10.03,9.67,9.28,8.88,8.49,8.11,7.78,7.49,7.26,7.1,7.01,7.01,7.08,7.23,7.45,7.74,8.07,8.44,8.83,9.23,9.62,9.99,10.31,10.59,10.8,10.94,11],"wide.q95":[11,11.4,11.78,12.13,12.43,12.68,12.86,12.97,13,12.95,12.82,12.62,12.35,12.03,11.67,11.28,10.88,10.49,10.11,9.78,9.49,9.26,9.1,9.01,9.01,9.08,9.23,9.45,9.74,10.07,10.44,10.83,11.23,11.62,11.99,12.31,12.59,12.8,12.94,13]}},{"name":"ident","kind":"identifiability","status":"ok","diagnostics":{"rank":3,"nullity":2,"singular_values":[120,80,30,4,0.5],"weakest_identified":0.25,"notes":[]}},{"name":"mmode","kind":"mmodes","status":"ok","spectrum":[[0.1,0.2,0.3,0.4],[0.5,null,0.7,0.8],[0.9,1,1.1,1.2],[1.3,1.4,1.5,1.6]]}],"tookMs":57},"transport":"local"}}',
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
