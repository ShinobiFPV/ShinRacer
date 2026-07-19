// Minimal, dependency-free UPnP IGD (Internet Gateway Device) client.
//
// Built from scratch instead of using an npm library after two real, tested
// problems with the obvious choices: `@achingbrain/nat-port-mapper` (modern,
// well-maintained) failed to find this app's own target router at all on a
// machine running Tailscale — its SSDP discovery doesn't let the caller pin
// which network interface to search from, and on a multi-adapter machine
// (real LAN + Tailscale's virtual one) it consistently searched the wrong
// one. `nat-upnp` (older) DID find the router and successfully map/unmap a
// real port, but pulls in `request`/`form-data`, both long-deprecated with
// real critical CVEs (SSRF, unsafe boundary generation). The UPnP IGD SOAP
// protocol itself is a small, stable, 20+-year-old standard, and every piece
// below was verified against a real router (a TP-Link Archer AX10 running
// MiniUPnPd) before being wired into the app — not assumed from a spec.
const dgram = require('dgram')
const http = require('http')
const https = require('https')
const os = require('os')

const SSDP_ADDR = '239.255.255.250'
const SSDP_PORT = 1900
const SEARCH_TARGET = 'urn:schemas-upnp-org:device:InternetGatewayDevice:1'

function nonInternalIPv4() {
  const out = []
  const nets = os.networkInterfaces()
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) out.push(net.address)
    }
  }
  return out
}

// Sends the SSDP M-SEARCH from every non-internal interface (not just
// whichever one the OS would pick by default) — this is the exact fix for
// the real interface-selection failure found in testing.
function discoverGateway({ timeoutMs = 4000 } = {}) {
  return new Promise((resolve) => {
    const interfaces = nonInternalIPv4()
    if (!interfaces.length) return resolve(null)

    const sockets = []
    let resolved = false
    const msg = Buffer.from(
      'M-SEARCH * HTTP/1.1\r\n' +
      `HOST: ${SSDP_ADDR}:${SSDP_PORT}\r\n` +
      'MAN: "ssdp:discover"\r\n' +
      'MX: 3\r\n' +
      `ST: ${SEARCH_TARGET}\r\n\r\n`
    )

    const finish = (result) => {
      if (resolved) return
      resolved = true
      for (const s of sockets) { try { s.close() } catch (e) {} }
      resolve(result)
    }

    for (const ip of interfaces) {
      try {
        const socket = dgram.createSocket({ type: 'udp4', reuseAddr: true })
        sockets.push(socket)
        socket.on('message', (data) => {
          const text = data.toString()
          const locationMatch = text.match(/LOCATION:\s*(.+)/i)
          if (locationMatch) finish({ location: locationMatch[1].trim() })
        })
        socket.on('error', () => {})
        socket.bind(0, ip, () => {
          try { socket.send(msg, SSDP_PORT, SSDP_ADDR) } catch (e) {}
        })
      } catch (e) { /* interface unavailable — skip it */ }
    }

    setTimeout(() => finish(null), timeoutMs)
  })
}

function httpGet(url) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https:') ? https : http
    const req = lib.get(url, { timeout: 5000 }, (res) => {
      let body = ''
      res.on('data', (c) => { body += c })
      res.on('end', () => resolve({ status: res.statusCode, body }))
    })
    req.on('error', reject)
    req.on('timeout', () => req.destroy(new Error('timeout')))
  })
}

function httpPost(url, body, headers) {
  return new Promise((resolve, reject) => {
    const u = new URL(url)
    const lib = u.protocol === 'https:' ? https : http
    const req = lib.request(u, { method: 'POST', headers, timeout: 5000 }, (res) => {
      let resBody = ''
      res.on('data', (c) => { resBody += c })
      res.on('end', () => resolve({ status: res.statusCode, body: resBody }))
    })
    req.on('error', reject)
    req.on('timeout', () => req.destroy(new Error('timeout')))
    req.write(body)
    req.end()
  })
}

// Regex-based extraction, not a full XML parser — deliberate, matching this
// codebase's existing preference for hand-rolled parsing of small, stable
// formats over adding a dependency (see main.js's SHM telemetry reader).
// UPnP device descriptions are simple, flat-ish XML; this only needs one
// specific service block out of it.
async function fetchControlUrl(locationUrl) {
  const { body } = await httpGet(locationUrl)
  const serviceBlocks = body.match(/<service>[\s\S]*?<\/service>/g) || []
  const target = serviceBlocks.find((b) => /WANIPConnection:1|WANPPPConnection:1/.test(b))
  if (!target) return null
  const serviceTypeMatch = target.match(/<serviceType>([^<]+)<\/serviceType>/)
  const controlUrlMatch = target.match(/<controlURL>([^<]+)<\/controlURL>/)
  if (!controlUrlMatch) return null
  const base = new URL(locationUrl)
  const controlUrl = new URL(controlUrlMatch[1], `${base.protocol}//${base.host}`).toString()
  return { controlUrl, serviceType: serviceTypeMatch ? serviceTypeMatch[1] : 'urn:schemas-upnp-org:service:WANIPConnection:1' }
}

async function soapCall(controlUrl, serviceType, action, params) {
  const paramXml = Object.entries(params).map(([k, v]) => `<${k}>${v}</${k}>`).join('')
  const envelope = `<?xml version="1.0"?>` +
    `<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/">` +
    `<s:Body><u:${action} xmlns:u="${serviceType}">${paramXml}</u:${action}></s:Body></s:Envelope>`

  const { status, body } = await httpPost(controlUrl, envelope, {
    'Content-Type': 'text/xml; charset="utf-8"',
    'SOAPACTION': `"${serviceType}#${action}"`,
    'Content-Length': Buffer.byteLength(envelope),
  })
  if (status >= 300) {
    const faultMatch = body.match(/<errorDescription>([^<]+)<\/errorDescription>/)
    throw new Error(faultMatch ? faultMatch[1] : `SOAP ${action} failed with HTTP ${status}`)
  }
  return body
}

async function getGatewayClient({ timeoutMs } = {}) {
  const gw = await discoverGateway({ timeoutMs })
  if (!gw) return null
  const desc = await fetchControlUrl(gw.location)
  if (!desc) return null
  const { controlUrl, serviceType } = desc

  return {
    async addPortMapping({ externalPort, internalPort, internalClient, protocol, description }) {
      await soapCall(controlUrl, serviceType, 'AddPortMapping', {
        NewRemoteHost: '',
        NewExternalPort: externalPort,
        NewProtocol: protocol,
        NewInternalPort: internalPort,
        NewInternalClient: internalClient,
        NewEnabled: 1,
        NewPortMappingDescription: description || 'ShinRacer',
        NewLeaseDuration: 0,
      })
    },
    async deletePortMapping({ externalPort, protocol }) {
      await soapCall(controlUrl, serviceType, 'DeletePortMapping', {
        NewRemoteHost: '',
        NewExternalPort: externalPort,
        NewProtocol: protocol,
      })
    },
    async getExternalIpAddress() {
      const body = await soapCall(controlUrl, serviceType, 'GetExternalIPAddress', {})
      const match = body.match(/<NewExternalIPAddress>([^<]*)<\/NewExternalIPAddress>/)
      return match ? match[1] : null
    },
  }
}

module.exports = { getGatewayClient }
