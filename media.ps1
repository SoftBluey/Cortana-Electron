param(
  [ValidateSet('state','mute','unmute','setvolume','volup','voldown')][string]$Action='state',
  [ValidateRange(0,100)][double]$Level=0
)
$ErrorActionPreference='Stop'
[Console]::OutputEncoding=New-Object System.Text.UTF8Encoding($false)
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
[ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")] class CortanaMediaEnumerator { }
[ComImport, Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface ICortanaMediaEnumerator {
 [PreserveSig] int EnumAudioEndpoints(int flow,int mask,out IntPtr devices);
 [PreserveSig] int GetDefaultAudioEndpoint(int flow,int role,out ICortanaMediaDevice device);
}
[ComImport, Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface ICortanaMediaDevice {
 [PreserveSig] int Activate(ref Guid iid,int context,IntPtr parameters,out IntPtr instance);
}
[ComImport, Guid("5CDF2C82-841E-4546-9722-0CF74078229A"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface ICortanaMediaVolume {
 [PreserveSig] int RegisterControlChangeNotify(IntPtr callback);
 [PreserveSig] int UnregisterControlChangeNotify(IntPtr callback);
 [PreserveSig] int GetChannelCount(out uint count);
 [PreserveSig] int SetMasterVolumeLevel(float level,ref Guid context);
 [PreserveSig] int SetMasterVolumeLevelScalar(float level,ref Guid context);
 [PreserveSig] int GetMasterVolumeLevel(out float level);
 [PreserveSig] int GetMasterVolumeLevelScalar(out float level);
 [PreserveSig] int SetChannelVolumeLevel(uint channel,float level,ref Guid context);
 [PreserveSig] int SetChannelVolumeLevelScalar(uint channel,float level,ref Guid context);
 [PreserveSig] int GetChannelVolumeLevel(uint channel,out float level);
 [PreserveSig] int GetChannelVolumeLevelScalar(uint channel,out float level);
 [PreserveSig] int SetMute([MarshalAs(UnmanagedType.Bool)] bool mute,ref Guid context);
 [PreserveSig] int GetMute([MarshalAs(UnmanagedType.Bool)] out bool mute);
}
public static class CortanaMediaAudio {
 public static double[] Control(string action,double requested) {
  var enumerator=(ICortanaMediaEnumerator)new CortanaMediaEnumerator();
  ICortanaMediaDevice device=null;object volume=null;IntPtr pointer=IntPtr.Zero;
  try {
   Marshal.ThrowExceptionForHR(enumerator.GetDefaultAudioEndpoint(0,1,out device));
   var iid=new Guid("5CDF2C82-841E-4546-9722-0CF74078229A");
   Marshal.ThrowExceptionForHR(device.Activate(ref iid,23,IntPtr.Zero,out pointer));
   volume=Marshal.GetObjectForIUnknown(pointer);var endpoint=(ICortanaMediaVolume)volume;
   float level;bool muted;var context=Guid.Empty;
   Marshal.ThrowExceptionForHR(endpoint.GetMasterVolumeLevelScalar(out level));
   if(action=="mute"||action=="unmute")Marshal.ThrowExceptionForHR(endpoint.SetMute(action=="mute",ref context));
   if(action=="setvolume"||action=="volup"||action=="voldown") {
    var next=action=="setvolume"?requested/100:level+(action=="volup"?.05:-.05);
    Marshal.ThrowExceptionForHR(endpoint.SetMasterVolumeLevelScalar((float)Math.Max(0,Math.Min(1,next)),ref context));
   }
   Marshal.ThrowExceptionForHR(endpoint.GetMasterVolumeLevelScalar(out level));
   Marshal.ThrowExceptionForHR(endpoint.GetMute(out muted));return new double[]{level*100,muted?1:0};
  }finally {
   if(volume!=null)Marshal.ReleaseComObject(volume);
   if(pointer!=IntPtr.Zero)Marshal.Release(pointer);
   if(device!=null)Marshal.ReleaseComObject(device);
   Marshal.ReleaseComObject(enumerator);
  }
 }
}
'@
try {
  $result=[CortanaMediaAudio]::Control($Action,$Level)
  [pscustomobject]@{success=$true;volume=[Math]::Round($result[0],2);muted=$result[1] -eq 1} | ConvertTo-Json -Compress
}catch {
  [pscustomobject]@{success=$false;error='Windows could not access the default playback device.'} | ConvertTo-Json -Compress
  exit 1
}
