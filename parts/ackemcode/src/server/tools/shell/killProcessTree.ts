import { spawn, type ChildProcess } from 'node:child_process'

/** Only a live ChildProcess created by this runtime may authorize killing a tree. */
export async function killProcessTree(child: ChildProcess, signal: NodeJS.Signals = 'SIGKILL'): Promise<boolean> {
  const pid = child.pid
  if (!pid) return false
  if (process.platform === 'win32') {
    if(child.exitCode!==null||child.signalCode!==null)return false
    return new Promise(resolve => {
      // Do not kill the root first: taskkill needs its parentage to find descendants.
      const killer = spawn('taskkill', ['/PID', String(pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore', shell: false })
      const timer = setTimeout(() => { killer.kill(); resolve(false) }, 5_000)
      killer.once('error', () => { clearTimeout(timer); resolve(false) })
      killer.once('close', code => { clearTimeout(timer); resolve(code === 0) })
    })
  }
  try {
    // runShell creates a new owned process group with detached:true.
    process.kill(-pid, signal)
    return true
  } catch (error) { return (error as NodeJS.ErrnoException).code==='ESRCH' }
}

export async function waitOwnedProcessGroup(pid:number,timeoutMs:number):Promise<boolean>{
  const deadline=Date.now()+timeoutMs
  while(Date.now()<deadline){
    try{process.kill(-pid,0)}catch(error){return (error as NodeJS.ErrnoException).code==='ESRCH'}
    await new Promise(r=>setTimeout(r,50))
  }
  return false
}
