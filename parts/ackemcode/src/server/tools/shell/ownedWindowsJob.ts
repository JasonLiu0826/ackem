/** A suspended child is assigned before execution, so even detached descendants stay owned.
 * The wrapper stays alive until the Windows job is empty. Killing it closes the job handle.
 */
const script = `
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
Add-Type -TypeDefinition @'
using System;
using System.ComponentModel;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
public static class AckemOwnedJob {
 [StructLayout(LayoutKind.Sequential)] struct STARTUPINFO { public uint cb; public IntPtr reserved,desktop,title; public uint x,y,xsize,ysize,xchars,ychars,fill,flags; public ushort show,reservedSize; public IntPtr reservedBytes,input,output,error; }
 [StructLayout(LayoutKind.Sequential)] struct PROCESS_INFORMATION { public IntPtr process,thread; public uint pid,tid; }
 [StructLayout(LayoutKind.Sequential)] struct BASIC_LIMIT { public long processTime,jobTime; public uint flags; public UIntPtr minWorking,maxWorking; public uint processLimit; public UIntPtr affinity; public uint priority,scheduling; }
 [StructLayout(LayoutKind.Sequential)] struct IO_COUNTERS { public ulong ro,wo,oo,rb,wb,ob; }
 [StructLayout(LayoutKind.Sequential)] struct EXTENDED_LIMIT { public BASIC_LIMIT basic; public IO_COUNTERS io; public UIntPtr processMemory,jobMemory,peakProcess,peakJob; }
 [StructLayout(LayoutKind.Sequential)] struct ACCOUNTING { public long user,kernel,periodUser,periodKernel; public uint faults,total,active,terminated; }
 [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern IntPtr CreateJobObject(IntPtr attributes,string name);
 [DllImport("kernel32.dll",SetLastError=true)] static extern bool SetInformationJobObject(IntPtr job,int cls,ref EXTENDED_LIMIT info,uint size);
 [DllImport("kernel32.dll",SetLastError=true)] static extern bool QueryInformationJobObject(IntPtr job,int cls,out ACCOUNTING info,uint size,IntPtr ret);
 [DllImport("kernel32.dll",SetLastError=true)] static extern bool AssignProcessToJobObject(IntPtr job,IntPtr process);
 [DllImport("kernel32.dll",SetLastError=true)] static extern bool TerminateJobObject(IntPtr job,uint code);
 [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern bool CreateProcess(string app,StringBuilder command,IntPtr pa,IntPtr ta,bool inherit,uint flags,IntPtr env,string cwd,ref STARTUPINFO si,out PROCESS_INFORMATION pi);
 [DllImport("kernel32.dll")] static extern IntPtr GetStdHandle(int handle);
 [DllImport("kernel32.dll",SetLastError=true)] static extern uint ResumeThread(IntPtr thread);
 [DllImport("kernel32.dll")] static extern bool GetExitCodeProcess(IntPtr process,out uint code);
 [DllImport("kernel32.dll")] static extern bool TerminateProcess(IntPtr process,uint code);
 [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr handle);
 static string Quote(string value) {
  var b=new StringBuilder("\\\""); int slashes=0;
  foreach(char c in value) { if(c=='\\\\') { slashes++; continue; } if(c=='\\\"') { b.Append('\\\\',slashes*2+1); b.Append(c); } else { b.Append('\\\\',slashes); b.Append(c); } slashes=0; }
  b.Append('\\\\',slashes*2); b.Append('\\\"'); return b.ToString();
 }
 public static int Run(string executable,string[] args,string cwd) {
  IntPtr job=CreateJobObject(IntPtr.Zero,null); if(job==IntPtr.Zero) throw new Win32Exception();
  PROCESS_INFORMATION pi=new PROCESS_INFORMATION(); bool resumed=false;
  try {
   var limits=new EXTENDED_LIMIT(); limits.basic.flags=0x2000;
   if(!SetInformationJobObject(job,9,ref limits,(uint)Marshal.SizeOf(limits))) throw new Win32Exception();
   if(File.Exists(Environment.GetEnvironmentVariable("ACKEM_OWNED_JOB_STOP"))) { Console.Error.WriteLine(Environment.GetEnvironmentVariable("ACKEM_OWNED_JOB_PROOF")); return 1; }
   var command=new StringBuilder(Quote(executable)); foreach(var arg in args) command.Append(" "+Quote(arg));
   var si=new STARTUPINFO(); si.cb=(uint)Marshal.SizeOf(si); si.flags=0x100; si.input=GetStdHandle(-10); si.output=GetStdHandle(-11); si.error=GetStdHandle(-12);
   if(!CreateProcess(null,command,IntPtr.Zero,IntPtr.Zero,true,4|0x08000000,IntPtr.Zero,cwd,ref si,out pi)) throw new Win32Exception();
   if(!AssignProcessToJobObject(job,pi.process)) throw new Win32Exception();
   bool cancelled=false;
   if(File.Exists(Environment.GetEnvironmentVariable("ACKEM_OWNED_JOB_STOP"))) { if(!TerminateJobObject(job,1)) throw new Win32Exception(); cancelled=true; }
   else { if(ResumeThread(pi.thread)==0xFFFFFFFF) throw new Win32Exception(); resumed=true; }
   while(true) { if(!cancelled && File.Exists(Environment.GetEnvironmentVariable("ACKEM_OWNED_JOB_STOP"))) { if(!TerminateJobObject(job,1)) throw new Win32Exception(); cancelled=true; } ACCOUNTING accounting; if(!QueryInformationJobObject(job,1,out accounting,(uint)Marshal.SizeOf(typeof(ACCOUNTING)),IntPtr.Zero)) throw new Win32Exception(); if(accounting.active==0) break; Thread.Sleep(25); }
   Console.Error.WriteLine(Environment.GetEnvironmentVariable("ACKEM_OWNED_JOB_PROOF"));
   uint code; if(!GetExitCodeProcess(pi.process,out code)) throw new Win32Exception(); return unchecked((int)code);
  } finally { if(!resumed && pi.process!=IntPtr.Zero) TerminateProcess(pi.process,1); if(pi.thread!=IntPtr.Zero) CloseHandle(pi.thread); if(pi.process!=IntPtr.Zero) CloseHandle(pi.process); CloseHandle(job); }
 }
}
'@
$arguments = [string[]](ConvertFrom-Json $env:ACKEM_OWNED_JOB_ARGUMENTS)
exit [AckemOwnedJob]::Run($env:ACKEM_OWNED_JOB_EXECUTABLE,$arguments,$env:ACKEM_OWNED_JOB_CWD)
`

export function ownedWindowsJob(executable:string,args:string[],cwd:string,env:NodeJS.ProcessEnv){
  return {executable:'powershell.exe',args:['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(script,'utf16le').toString('base64')],env:{...env,ACKEM_OWNED_JOB_EXECUTABLE:executable,ACKEM_OWNED_JOB_ARGUMENTS:JSON.stringify(args),ACKEM_OWNED_JOB_CWD:cwd}}
}
