// Shared server deploy/save flow — used by both BuildView's manual form and
// ServerWizard's guided flow, so the INI generation + process spawn logic
// lives in exactly one place.
import { generateServerCfg, generateEntryList } from './iniUtils'

const api = window.api

export async function deployConfig(cfg, settings) {
  const id = `srv_${Date.now()}`
  const cfgDir = `${settings.acPath}\\server\\cfg`
  const cfgPath = `${cfgDir}\\server_cfg.ini`
  const entryPath = `${cfgDir}\\entry_list.ini`

  const iniPreview = generateServerCfg(cfg, settings.adminPassword)
  const entryPreview = generateEntryList(cfg)

  const iniResult = await api.fs.writeFile(cfgPath, iniPreview)
  const entryResult = await api.fs.writeFile(entryPath, entryPreview)
  if (!iniResult.ok || !entryResult.ok) {
    return { ok: false, error: iniResult.error || entryResult.error }
  }

  const result = await api.server.launch({
    id, acServerPath: settings.acServerExe, serverCfgPath: cfgPath, entryListPath: entryPath,
  })
  if (!result.ok) return { ok: false, error: result.error }

  return {
    ok: true,
    server: { id, name: cfg.name, config: cfg, startedAt: Date.now(), pid: result.pid, logPath: result.logPath, players: 0 },
  }
}

export function presetFromConfig(cfg) {
  return { ...cfg, id: `preset_${Date.now()}`, savedAt: Date.now() }
}
