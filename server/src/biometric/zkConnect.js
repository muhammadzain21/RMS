/**
 * node-zklib@1.3.0 ignores the 5th constructor arg (COMM Key).
 * When the device has Comm Password set, CMD_CONNECT returns UNAUTH and
 * later calls fail as `[TCP] undefined`. We send CMD_AUTH ourselves.
 */

export function formatZkErr(e) {
  if (!e) return 'error'
  if (typeof e === 'string') return e
  const msg = String(e?.message || '')
  const err = e?.err
  const code = err?.code ? String(err.code) : ''
  const errno = (typeof err?.errno !== 'undefined') ? String(err.errno) : ''
  const syscall = err?.syscall ? String(err.syscall) : ''
  const address = err?.address ? String(err.address) : ''
  const port = err?.port ? String(err.port) : ''
  const parts = [
    msg,
    e?.command && `command=${e.command}`,
    e?.ip && `ip=${e.ip}`,
    code && `code=${code}`,
    errno && `errno=${errno}`,
    syscall && `syscall=${syscall}`,
    address && `address=${address}`,
    port && `port=${port}`,
  ].filter(Boolean)
  if (parts.length) return parts.join(' ')
  try { return JSON.stringify(e) } catch { return String(e) }
}

/** ZK COMM Key hash used by CMD_AUTH (same algorithm as pyzk / node-zklib master). */
export function makeCommKey(key, sessionId, ticks = 50) {
  key = Math.floor(Number(key) || 0)
  sessionId = Math.floor(Number(sessionId) || 0)

  let k = 0
  for (let i = 0; i < 32; i++) {
    if (key & (1 << i)) k = (k << 1) | 1
    else k = k << 1
  }
  k += sessionId

  const buf = Buffer.alloc(4)
  buf.writeUInt32LE(k >>> 0, 0)
  const xorKey = [0x5a, 0x4b, 0x53, 0x4f] // 'ZKSO'
  for (let i = 0; i < 4; i++) buf[i] ^= xorKey[i]

  const swapped = Buffer.from([buf[2], buf[3], buf[0], buf[1]])
  const B = ticks & 0xff
  return Buffer.from([
    swapped[0] ^ B,
    swapped[1] ^ B,
    B,
    swapped[3] ^ B,
  ])
}

const CMD_AUTH = 1102
const CMD_ACK_OK = 2000
const CMD_ACK_UNAUTH = 2005
const CMD_ACK_ERROR = 2001

function replyCmdId(reply) {
  try {
    if (reply && Buffer.isBuffer(reply) && reply.length >= 2) return reply.readUInt16LE(0)
  } catch {}
  return null
}

async function authenticateIfNeeded(zk, password) {
  const pwd = Number(password) || 0
  const tcp = zk.zklibTcp
  const udp = zk.zklibUdp
  const sessionId = tcp?.sessionId ?? udp?.sessionId
  if (sessionId == null) return

  if (!pwd) {
    // Device may still require a COMM Key — probe with a harmless info call later.
    return
  }

  const payload = makeCommKey(pwd, sessionId)
  try {
    const reply = await zk.executeCmd(CMD_AUTH, payload)
    const cmd = replyCmdId(reply)
    if (cmd === CMD_ACK_ERROR || cmd === CMD_ACK_UNAUTH) {
      throw new Error(`COMM Key rejected by device (reply=${cmd}). Check the password in Biometric Settings.`)
    }
    // Some firmwares return ACK_OK (2000); others return empty/other — only fail on clear reject.
    if (cmd != null && cmd !== CMD_ACK_OK && cmd !== CMD_AUTH) {
      // Unexpected but not always fatal; getInfo will confirm.
      console.warn(`[biometric] CMD_AUTH unusual reply cmd=${cmd}`)
    }
    console.log(`[biometric] CMD_AUTH ok (COMM Key ${pwd})`)
  } catch (e) {
    console.warn('[biometric] CMD_AUTH failed:', formatZkErr(e))
    throw e
  }
}

export async function connectZk({
  ip,
  port = 4370,
  password = 0,
  timeoutMs = 12000,
  inport = 5200,
}) {
  const { default: ZKLib } = await import('node-zklib')
  const pwd = Number(password) || 0
  // 5th arg is ignored by npm 1.3.0 — auth is handled below
  const zk = new ZKLib(String(ip), Number(port) || 4370, timeoutMs, inport, pwd)
  await zk.createSocket()
  await authenticateIfNeeded(zk, pwd)
  return { zk, usedPassword: pwd }
}

export async function disconnectZk(zk) {
  if (!zk) return
  try {
    await Promise.race([
      zk.disconnect(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('disconnect timeout')), 3000)),
    ])
  } catch {}
  await new Promise(r => setTimeout(r, 800))
}
